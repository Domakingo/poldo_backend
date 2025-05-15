const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { authenticateJWT, authorizeRole } = require('../middlewares/authMiddleware');


router.get('/me',
    authenticateJWT,
    authorizeRole(['paninaro']),
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


module.exports = router;