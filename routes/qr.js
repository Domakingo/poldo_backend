const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { authenticateJWT, authorizeRole } = require('../middlewares/authMiddleware');


router.get('/me',
    authenticateJWT,
    authorizeRole(['paninaro', 'prof']),
    async (req, res) => {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const paninaroId = req.user.id;
            const { nTurno } = req.query;
            const today = new Date().toISOString().split('T')[0];
            const giorniEnum = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
            const giorno = giorniEnum[new Date().getDay()];
            const [classePaninaro] = await connection.query(
                'SELECT classe FROM Utente WHERE idUtente = ?',
                [paninaroId]
            );

            if(nTurno === undefined) {
                await connection.rollback();
                return res.status(400).json({ error: 'Parametro nTurno obbligatorio' });
            }

            if (!classePaninaro[0]?.classe) {
                await connection.rollback();
                return res.status(403).json({ error: 'Paninaro non assegnato a nessuna classe' });
            }

            const [qrcodes] = await connection.query(`
                SELECT 
                    q.token,
                    g.nome AS nome,
                    q.ritirato,
                    COALESCE(SUM(d.quantita * p.prezzo), 0) AS totale
                FROM OrdineClasse oc
                JOIN QrCode q ON oc.idOrdine = q.idOrdineClasse
                JOIN Gestione g ON q.gestore = g.idGestione
                LEFT JOIN OrdineSingolo os ON oc.idOrdine = os.idOrdineClasse
                LEFT JOIN DettagliOrdineSingolo d ON os.idOrdine = d.idOrdineSingolo
                LEFT JOIN Prodotto p ON d.idProdotto = p.idProdotto AND p.proprietario = g.idGestione
                WHERE oc.classe = ?
                    AND oc.data = ?
                    AND oc.nTurno = ?
                    AND oc.giorno = ?
                    AND oc.confermato = TRUE AND os.confermato = TRUE
                GROUP BY q.token, g.nome, q.ritirato;
                `, [classePaninaro[0].classe, today, nTurno, giorno]);

            if (qrcodes.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Nessun qr trovato per la tua classe nel turno selezionato' });
            }

            await connection.commit();
            res.json(qrcodes);

        } catch (error) {
            await connection.rollback();
            console.error('Errore conferma ordine:', error);
            res.status(500).json({ error: 'Errore del database' });
        } finally {
            connection.release();
        }
    }
);

router.post('/check',
    authenticateJWT,
    authorizeRole(['gestore']),
    async (req, res) => {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const { token } = req.body;
            const idGestione = req.user.idGestione;
            
            if (!token) {
                await connection.rollback();
                return res.status(400).json({ error: 'Token mancante nel body' });
            }

            // Verifica validità token
            const [tokenData] = await connection.query(`
                SELECT q.*, g.nome AS nomeGestore
                FROM QrCode q, Gestione g
                WHERE q.token = ? AND q.gestore = g.idGestione
            `, [token, idGestione]);

            if (tokenData.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Token non trovato' });
            }

            if( tokenData[0].gestore !== idGestione) {
                await connection.rollback();
                return res.status(403).json({ error: 'Token non valido per questo gestore: gestione: ' + tokenData[0].nomeGestore});
            }

            //prendi lista di prodotti con quantita per token
            const [dettagliOrdine] = await connection.query(`
                SELECT JSON_OBJECT(
                    'ritirato', dati.ritirato,
                    'class', dati.classe,
                    'totale', dati.totale,
                    'prodotti', JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'nome', dati.nomeProdotto,
                            'quantita', dati.quantita,
                            'prezzo', dati.prezzo
                        )
                    )
                ) AS result
                FROM (
                    SELECT 
                        q.token,
                        q.ritirato,
                        c.nome AS classe,
                        p.nome AS nomeProdotto,
                        SUM(d.quantita) AS quantita,
                        p.prezzo,
                        SUM(d.quantita * p.prezzo) AS subtotale,
                        SUM(SUM(d.quantita * p.prezzo)) OVER (PARTITION BY q.token) AS totale
                    FROM QrCode q
                    JOIN OrdineClasse oc ON q.idOrdineClasse = oc.idOrdine
                    JOIN OrdineSingolo os ON oc.idOrdine = os.idOrdineClasse
                    JOIN DettagliOrdineSingolo d ON os.idOrdine = d.idOrdineSingolo
                    JOIN Prodotto p ON d.idProdotto = p.idProdotto
                    JOIN Classe c ON oc.classe = c.id
                    WHERE q.token = ?
                    AND os.confermato = TRUE
                    AND oc.confermato = TRUE
                    AND p.proprietario = q.gestore
                    GROUP BY q.token, q.ritirato, c.nome, p.nome, p.prezzo
                ) AS dati
                GROUP BY dati.token, dati.ritirato, dati.classe, dati.totale;
            `, [token]);
            
            const ordine = JSON.parse(dettagliOrdine[0].result);
            
            res.status(200).json(ordine);

        } catch (error) {
            await connection.rollback();
            console.error('Errore validazione token:', error);
            res.status(500).json({ error: 'Errore del database' });
        } finally {
            connection.release();
        }
    }
);


module.exports = router;