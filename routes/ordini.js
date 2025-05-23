const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { authenticateJWT, authorizeRole } = require('../middlewares/authMiddleware');
const { v4: uuidv4 } = require('uuid');

// Funzione di supporto per analizzare JSON in modo sicuro
const parseJSON = (data) => {
    try {
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

// Funzione di supporto per formattare la data come yyyy-mm-dd + 1gg
const formatDate = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Funzione di supporto per generare un codice QR unico
const genQr = async (connection) => {
    const qrCode = uuidv4().replace(/-/g, '');
    const exists = await checkQRIfExists(connection, qrCode);
    if (exists) {
        return await genQr(connection); // ricorsione in caso di duplicato
    }
    return qrCode; // restituisce direttamente la stringa
};


const checkQRIfExists = async (connection, qrCode) => {
    const [rows] = await connection.query('SELECT * FROM QrCode WHERE token = ?', [qrCode]);
    return rows.length > 0;
}

// Ottieni tutti gli ordini individuali
router.get('/', authenticateJWT, authorizeRole(['admin']),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { startDate, endDate, nTurno, user, confermato, preparato } = req.query;

            let query = `
                SELECT
                    os.idOrdine,
                    os.data,
                    os.nTurno,
                    os.giorno,
                    os.user,
                    oc.classe,
                    oc.confermato,
                    oc.oraRitiro,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'idProdotto', p.idProdotto,
                            'nome', p.nome,
                            'quantita', dos.quantita,
                            'prezzo', p.prezzo
                        )
                    ) AS prodotti
                FROM OrdineSingolo os
                LEFT JOIN OrdineClasse oc ON os.idOrdineClasse = oc.idOrdine
                LEFT JOIN DettagliOrdineSingolo dos ON os.idOrdine = dos.idOrdineSingolo
                LEFT JOIN Prodotto p ON dos.idProdotto = p.idProdotto
                WHERE 1=1
            `;

            const params = [];

            if (startDate && endDate) {
                query += ` AND os.data BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (!startDate || !endDate) {
                query += ` AND os.data = CURDATE()`;
            }

            if (nTurno) {
                query += ` AND os.nTurno = ?`;
                params.push(nTurno);
            }

            if (user) {
                query += ` AND os.user = ?`;
                params.push(user);
            }

            if (confermato === '0' || confermato === '1') {
                query += ` AND oc.confermato = ?`;
                params.push(Number(confermato));
            }
          
            query += ` GROUP BY os.idOrdine ORDER BY os.data DESC, os.idOrdine DESC`;

            const [orders] = await connection.execute(query, params);

            const result = orders.map(order => ({
                ...order,
                data: formatDate(order.data),
                prodotti: order.prodotti
            }));

            res.json(result);

        } catch (error) {
            console.error('Errore nel recupero ordini:', error);
            res.status(500).json({ error: 'Errore del database' });
        } finally {
            connection.release();
        }
    }
);

// Ottieni tutti gli ordini raggruppati per classe
router.get('/classi',
    authenticateJWT,
    authorizeRole(['admin', 'gestore']),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { startDate, endDate, nTurno, confermato, preparato } = req.query;
            const userRole = req.user.ruolo;
            let classeFilter = '';

            if (userRole === 'paninaro') {
                const [classe] = await connection.query(
                    'SELECT classe FROM Utente WHERE idUtente = ?',
                    [req.user.id]
                );
                if (!classe[0]?.classe) return res.status(403).json({ error: 'Nessuna classe assegnata' });
                classeFilter = `AND oc.classe = ${classe[0].classe}`;
            }

            let query = `
                SELECT
                    c.nome AS classe,
                    oc.classe AS classeId,
                    oc.data,
                    oc.oraRitiro,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'idProdotto', p.idProdotto,
                            'nome', p.nome,
                            'quantita', dos.totalQuantita,
                            'prezzo', p.prezzo
                        )
                    ) AS prodotti
                FROM OrdineClasse oc
                JOIN Classe c ON oc.classe = c.id
                JOIN (
                    SELECT os.idOrdineClasse, dos.idProdotto, SUM(dos.quantita) AS totalQuantita
                    FROM OrdineSingolo os
                    JOIN DettagliOrdineSingolo dos ON os.idOrdine = dos.idOrdineSingolo
                    GROUP BY os.idOrdineClasse, dos.idProdotto
                ) dos ON oc.idOrdine = dos.idOrdineClasse
                JOIN Prodotto p ON dos.idProdotto = p.idProdotto
                WHERE 1=1
                ${classeFilter}
            `;

            const params = [];

            if (startDate && endDate) {
                query += ` AND oc.data BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (!startDate && !endDate) {
                query += ` AND oc.data = CURDATE()`;
            }

            if (nTurno) {
                query += ` AND oc.nTurno = ?`;
                params.push(nTurno);
            }

            if (confermato === '0' || confermato === '1') {
                query += ` AND oc.confermato = ?`;
                params.push(Number(confermato));
            }

            query += ` GROUP BY c.nome, oc.classe, oc.data, oc.oraRitiro ORDER BY oc.classe ASC`;

            const [results] = await connection.execute(query, params);

            const formatted = results.map(row => ({
                classe: row.classe,
                classeId: row.classeId,
                data: formatDate(row.data),
                oraRitiro: row.oraRitiro,
                prodotti: row.prodotti,
            }));

            res.json(formatted);

        } catch (error) {
            console.error('Errore nel recupero ordini per classi:', error);
            res.status(500).json({ error: 'Errore del database' });
        } finally {
            connection.release();
        }
    }
);

router.get('/classi/me/oggi',
    authenticateJWT,
    authorizeRole(['paninaro', 'prof']),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { nTurno } = req.query;
            const giorniEnum = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
            const giorno = giorniEnum[new Date().getDay()];
            if (!nTurno) {
                return res.status(400).json({ error: 'Parametro nTurno obbligatorio' });
            }
    
            // Recupera la classe del paninaro
            const [classePaninaro] = await connection.query(
                'SELECT classe FROM Utente WHERE idUtente = ?',
                [req.user.id]
            );
            
            if (!classePaninaro[0]?.classe) {
                return res.status(403).json({ error: 'Nessuna classe assegnata' });
            }

            const query = `
                SELECT
                    os.idOrdine,
                    os.confermato,
                    os.user,
                    u.nome AS nomeUtente,
                    os.idOrdineClasse as confermatoClasse,
                    ROUND(sum(dos.quantita*p.prezzo), 2) AS totale,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'idProdotto', p.idProdotto,
                            'nome', p.nome,
                            'quantita', dos.quantita,
                            'prezzo', p.prezzo
                        )
                    ) AS prodotti
                FROM OrdineSingolo os
                JOIN Utente u ON os.user = u.idUtente
                JOIN DettagliOrdineSingolo dos ON os.idOrdine = dos.idOrdineSingolo
                JOIN Prodotto p ON dos.idProdotto = p.idProdotto
                WHERE u.classe = ?
                AND os.data = CURDATE()
                AND os.nTurno = ? and giorno = ?
                GROUP BY os.idOrdine, os.user, u.nome
                ORDER BY os.idOrdine DESC
            `;
    
            const [orders] = await connection.execute(query, [
                classePaninaro[0].classe,
                nTurno, giorno
            ]);
    
            if (orders.length === 0) {
                return res.status(404).json({ error: 'Nessun ordine trovato per oggi in questo turno' });
            }
            
            const totaleAccettato = orders.reduce((acc, order) => {
                return order.confermato ? acc + Number(order.totale) : acc
            }, 0).toFixed(2); 

            const confermatoClasse = orders[0].confermatoClasse === null ? false : true;

            const formattedOrders = orders.map(order => ({
                idOrdine: order.idOrdine,
                confermato: order.confermato,
                totale: order.totale,
                user: {
                    id: order.user,
                    nome: order.nomeUtente
                },
                prodotti: order.prodotti
            }));
    
            res.json({
                confermato: confermatoClasse,
                nTurno: Number(nTurno),
                totale: totaleAccettato,
                ordini: formattedOrders
            });
    
        } catch (error) {
            console.error('Errore nel recupero ordini della classe per oggi:', error);
            res.status(500).json({ error: 'Errore del database' });
        } finally {
            connection.release();
        }
    }
);

// Ottieni i propri ordini
router.get('/me',
    authenticateJWT,
    authorizeRole(['admin', 'paninaro', 'studente', 'prof', 'segreteria']),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const userId = req.user.id;
            let { startDate, endDate, nTurno } = req.query;

            if (startDate) startDate = startDate.replace(/\//g, '-');
            if (endDate) endDate = endDate.replace(/\//g, '-');

            let query = `
                SELECT
                    os.idOrdine, os.data, os.nTurno, os.giorno,
                    oc.classe, oc.confermato,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'idProdotto', p.idProdotto,
                            'nome', p.nome,
                            'quantita', dos.quantita,
                            'prezzo', p.prezzo
                        )
                    ) AS prodotti
                FROM OrdineSingolo os
                LEFT JOIN OrdineClasse oc ON os.idOrdineClasse = oc.idOrdine
                LEFT JOIN DettagliOrdineSingolo dos ON os.idOrdine = dos.idOrdineSingolo
                LEFT JOIN Prodotto p ON dos.idProdotto = p.idProdotto
                WHERE os.user = ?
            `;

            const params = [userId];

            if (startDate && endDate) {
                query += ` AND os.data BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (!startDate && !endDate) {
                query += ` AND os.data = CURDATE()`;
            }

            if (nTurno) {
                query += ` AND os.nTurno = ?`;
                params.push(nTurno);
            }

            query += ` GROUP BY os.idOrdine ORDER BY os.data DESC, os.idOrdine DESC`;

            const [orders] = await connection.execute(query, params);

            if (orders.length === 0) return res.status(404).json({ error: 'Nessun ordine trovato' });

            const result = orders.map(order => ({
                ...order,
                prodotti: order.prodotti
            }));

            res.json(result);

        } catch (error) {
            console.error(`Errore nel recuperare i propri ordini per utente ${req.user.id}:`, error);
            res.status(500).json({ error: 'Errore del database nel recuperare i propri ordini.' });
        } finally {
            if (connection) connection.release();
        }
    }
);

// Crea un nuovo ordine
router.post(
  '/',
  authenticateJWT,
  authorizeRole(['studente', 'prof', 'segreteria', 'terminale', 'admin']),
  async (req, res) => {
    const connection = await pool.getConnection()
    await connection.beginTransaction()

    try {
      const userId = req.user.id
      const userRole = req.user.ruolo
      const { prodotti, nTurno: bodyTurno, oraRitiro } = req.body
      const today = new Date().toISOString().split('T')[0]

      const giorniEnum = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
      const giorno = giorniEnum[new Date().getDay()]
      const giorniValidi = ['lun', 'mar', 'mer', 'gio', 'ven']

      if(req.user.ruolo === 'prof' && !oraRitiro){
        await connection.rollback()
        return res.status(400).json({ error: 'Ora di ritiro obbligatoria' })
      }

      if (!giorniValidi.includes(giorno)) {
        await connection.rollback()
        return res.status(400).json({ error: 'Ordini consentiti solo nei giorni feriali' })
      }

      let nTurno
      if (userRole === 'studente' || userRole === 'paninaro') {
        nTurno = parseInt(bodyTurno, 10)

        const [turno] = await connection.query(
          `SELECT oraInizioOrdine, oraFineOrdine, studenti FROM Turno 
           WHERE n = ? AND giorno = ?`,
          [nTurno, giorno]
        )

        if (turno.length === 0) {
          await connection.rollback()
          return res.status(400).json({ error: 'Turno non disponibile' })
        }

        if (userRole === 'studente' && turno[0]?.studenti === 0) {
          await connection.rollback()
          return res.status(400).json({ error: 'Turno non valido per studenti' })
        }

        const oraCorrente = new Date()
          .toLocaleTimeString('it-IT', {
            hour12: false,
            timeZone: 'Europe/Rome',
          })
          .slice(0, 5)

        const { oraInizioOrdine, oraFineOrdine } = turno[0]
        if (oraCorrente < oraInizioOrdine || oraCorrente > oraFineOrdine) {
          await connection.rollback()
          return res.status(400).json({
            error: `Fuori orario per il turno ${nTurno}: ${oraInizioOrdine}-${oraFineOrdine}`,
          })
        }
      } else {
        nTurno = 0
        const [turno] = await connection.query(
          `SELECT * FROM Turno WHERE n = ? AND giorno = ?`,
          [nTurno, giorno]
        )

        if (turno.length === 0) {
          await connection.rollback()
          return res.status(400).json({ error: 'Configurazione turno non trovata' })
        }
      }

      if (!prodotti || !Array.isArray(prodotti) || prodotti.length === 0) {
        await connection.rollback()
        return res.status(400).json({ error: 'Lista prodotti vuota' })
      }

      // Verifica prodotti e disponibilità
      const productIds = prodotti.map((p) => p.idProdotto)
      const placeholders = productIds.map(() => '?').join(',')
      const [dbProducts] = await connection.query(
        `SELECT idProdotto, prezzo, nome, disponibilita FROM Prodotto
         WHERE idProdotto IN (${placeholders}) AND attivo = TRUE`,
        [...productIds]
      )

      const availableProductMap = new Map(dbProducts.map((p) => [p.idProdotto, p]))
      
      // Controllo quantità e aggiornamento disponibilità
      for (const item of prodotti) {
        const product = availableProductMap.get(item.idProdotto)
        
        if (!product) {
          await connection.rollback()
          return res.status(400).json({ error: `Prodotto ${item.idProdotto} non disponibile` })
        }

        if (!Number.isInteger(item.quantita) || item.quantita <= 0) {
          await connection.rollback()
          return res.status(400).json({ error: `Quantità non valida per prodotto ${item.idProdotto}` })
        }

        if (product.disponibilita < item.quantita) {
          await connection.rollback()
          return res.status(400).json({ 
            error: `Quantità insufficiente per ${product.nome} (disponibili: ${product.disponibilita})` 
          })
        }

        // Aggiornamento concorrente della disponibilità
        const [updateResult] = await connection.query(
          `UPDATE Prodotto 
           SET disponibilita = disponibilita - ? 
           WHERE idProdotto = ? AND disponibilita >= ?`,
          [item.quantita, item.idProdotto, item.quantita]
        )

        if (updateResult.affectedRows === 0) {
          await connection.rollback()
          return res.status(400).json({ 
            error: `Quantità non più disponibile per ${product.nome}` 
          })
        }
      }

      // Creazione ordine
      let idOrdineClasse
      let idOrdineSingolo

      if (userRole === 'studente' || userRole === 'paninaro') {
        const [userClass] = await connection.query(
          `SELECT classe FROM Utente WHERE idUtente = ?`,
          [userId]
        )

        if (!userClass[0]?.classe) {
          await connection.rollback()
          return res.status(400).json({ error: 'Classe non assegnata' })
        }

        const [ordineSingoloResult] = await connection.query(
          `INSERT INTO OrdineSingolo (data, nTurno, giorno, user)
           VALUES (?, ?, ?, ?)`,
          [today, nTurno, giorno, userId]
        )
        idOrdineSingolo = ordineSingoloResult.insertId
      } else {
        const [userClass] = await connection.query(
          `SELECT classe FROM Utente WHERE idUtente = ?`,
          [userId]
        )
        const [newOrderClasseResult] = await connection.query(
          `INSERT INTO OrdineClasse (idResponsabile, data, nTurno, giorno, classe, confermato, oraRitiro)
           VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
          [userId, today, nTurno, giorno, userClass[0].classe, oraRitiro]
        )
        idOrdineClasse = newOrderClasseResult.insertId

        const [ordineSingoloResult] = await connection.query(
          `INSERT INTO OrdineSingolo (data, nTurno, giorno, user, idOrdineClasse)
           VALUES (?, ?, ?, ?, ?)`,
          [today, nTurno, giorno, userId, idOrdineClasse]
        )
        idOrdineSingolo = ordineSingoloResult.insertId

        const dettagliValues = prodotti.map((item) => [
            idOrdineSingolo,
            item.idProdotto,
            item.quantita,
        ])
        
        await connection.query(
            `INSERT INTO DettagliOrdineSingolo (idOrdineSingolo, idProdotto, quantita)
            VALUES ?`,
            [dettagliValues]
        )


        const [gestioni] = await connection.query(`
            SELECT DISTINCT p.proprietario
            FROM Prodotto p
            JOIN DettagliOrdineSingolo dos ON p.idProdotto = dos.idProdotto
            JOIN OrdineSingolo os ON dos.idOrdineSingolo = os.idOrdine
            JOIN OrdineClasse oc ON os.idOrdineClasse = oc.idOrdine
            WHERE oc.idOrdine = ?
            AND os.confermato = TRUE
            `, newOrderClasseResult.insertId
        );
        
        console.log('gestioni', gestioni);
        gestioni.map(gest => {
            console.log('gest', gest);
        });

        await Promise.all(
            gestioni.map(async gest => {
                const qrCode = await genQr(connection);
                console.log('qrCode', qrCode);
                await connection.query(`
                    INSERT INTO QrCode (token, idOrdineClasse, gestore)
                    VALUES (?, ?, ?)`,
                    [qrCode, newOrderClasseResult.insertId, gest.proprietario]
                );
            })
        );

        await connection.commit()
        
        res.status(201).json({
            success: true,
            idOrdineSingolo: idOrdineSingolo,
            idOrdineClasse: idOrdineClasse,
            message: 'Ordine creato e disponibilità aggiornata con successo',
        })

        return 
        
      }

      // Inserimento dettagli ordine
      const dettagliValues = prodotti.map((item) => [
        idOrdineSingolo,
        item.idProdotto,
        item.quantita,
      ])
      
      await connection.query(
        `INSERT INTO DettagliOrdineSingolo (idOrdineSingolo, idProdotto, quantita)
         VALUES ?`,
        [dettagliValues]
      )

      await connection.commit()
      
      res.status(201).json({
        success: true,
        idOrdineSingolo: idOrdineSingolo,
        idOrdineClasse: idOrdineClasse,
        message: 'Ordine creato e disponibilità aggiornata con successo',
      })

    } catch (error) {
      await connection.rollback()
      console.error('Errore creazione ordine:', error)
      res.status(500).json({ 
        error: error.code === 'ER_DUP_ENTRY' 
          ? 'Ordine duplicato' 
          : 'Errore durante la creazione dell\'ordine' 
      })
    } finally {
      if (connection) connection.release()
    }
  }
)

router.delete('/', 
    authenticateJWT, 
    authorizeRole(['studente', 'prof', 'segreteria', 'terminale', 'admin']), 
    async (req, res) => {
        const connection = await pool.getConnection()
        await connection.beginTransaction()

        try{
            const { nTurno } = req.body
            const today = new Date().toISOString().split('T')[0]

            const giorniEnum = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
            const giorno = giorniEnum[new Date().getDay()]
            const giorniValidi = ['lun', 'mar', 'mer', 'gio', 'ven']

            if (!giorniValidi.includes(giorno)) {
                await connection.rollback()
                return res.status(400).json({ error: 'Ordini consentiti solo nei giorni feriali' })
            }

            if(nTunro === undefined) {
                await connection.rollback()
                return res.status(400).json({ error: 'Parametro nTurno obbligatorio' })
            }

            const userId = req.user.id
            
            // Verifica se l'ordine esiste
            const [ordine] = await connection.query(
                `SELECT idOrdine, idOrdineClasse FROM OrdineSingolo 
                 WHERE user = ? AND data = CURDATE() AND nTurno = ?`,
                [userId, nTurno]
            )

            if (ordine.length === 0) {
                await connection.rollback()
                return res.status(404).json({ error: 'Ordine non trovato' })
            }
            const idOrdine = ordine[0].idOrdine
            
            // Ripristina la disponibilità dei prodotti
            const [prodotti] = await connection.query(
                `SELECT dos.idProdotto, dos.quantita
                 FROM DettagliOrdineSingolo dos
                 JOIN OrdineSingolo os ON dos.idOrdineSingolo = os.idOrdine
                 WHERE os.idOrdine = ?`,
                [idOrdine]
            )

            const updateValues = prodotti.map((item) => [
                item.quantita,
                item.idProdotto
            ])
            await connection.query(
                `UPDATE Prodotto 
                 SET disponibilita = disponibilita + ?
                 WHERE idProdotto = ?`,
                [updateValues]
            )

            // Elimina i dettagli dell'ordine
            await connection.query(
                `DELETE FROM DettagliOrdineSingolo
                    WHERE idOrdineSingolo = ?`,
                [idOrdine]
            )

            // Elimina l'ordine
            await connection.query(
                `DELETE FROM OrdineSingolo
                    WHERE idOrdine = ?`,
                [idOrdine]
            )


            if(req.user.ruolo === 'prof' || req.user.ruolo === 'admin'){
                // Elimina l'ordine di classe se esiste
                const idOrdineClasse = ordine[0].idOrdineClasse
                if (!idOrdineClasse) {
                    await connection.rollback()
                    return res.status(404).json({ error: 'Ordine di classe non trovato' })
                }
                await connection.query(
                    `DELETE FROM OrdineClasse
                        WHERE idOrdine = ?`,
                    [idOrdineClasse]
                )
            }

            await connection.commit()
            res.status(200).json({ 
                success: true, 
                message: 'Ordine eliminato con successo' 
            })





        }catch (error) {
            await connection.rollback()
            console.error('Errore eliminazione ordine:', error)
            res.status(500).json({ 
                error: 'Errore durante l\'eliminazione dell\'ordine' 
            })
        }
    })
;

// Ottieni tutti gli ordini per la classe del paninaro
router.get('/classi/me',
    authenticateJWT,
    authorizeRole(['paninaro', 'prof']),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const [classeResult] = await connection.query(
                'SELECT classe FROM Utente WHERE idUtente = ?',
                [req.user.id]
            );

            if (!classeResult[0]?.classe) {
                return res.status(404).json({ error: 'Nessuna classe assegnata' });
            }

            const classeId = classeResult[0].classe;

            const query = `
                SELECT
                    u.idUtente AS userId,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'idOrdineSingolo', os.idOrdine,
                            'data', os.data,
                            'prodotti', (
                                SELECT JSON_ARRAYAGG(
                                    JSON_OBJECT(
                                        'idProdotto', p.idProdotto,
                                        'nome', p.nome,
                                        'quantita', dos.quantita,
                                        'prezzo', p.prezzo
                                    )
                                )
                                FROM DettagliOrdineSingolo dos
                                JOIN Prodotto p ON dos.idProdotto = p.idProdotto
                                WHERE dos.idOrdineSingolo = os.idOrdine
                            )
                        )
                    ) AS ordini
                FROM OrdineSingolo os
                JOIN Utente u ON os.user = u.idUtente
                WHERE u.classe = ?
                GROUP BY u.idUtente
            `;

            const [orders] = await connection.execute(query, [classeId]);

            const formattedOrders = orders.map(order => ({
                userId: order.userId,
                ordini: order.ordini
            }));

            res.json(formattedOrders);

        } catch (error) {
            console.error('Errore nel recupero ordini per la classe del paninaro:', error);
            res.status(500).json({ error: 'Errore del database' });
        } finally {
            connection.release();
        }
    }
);

router.patch('/classi/me/conferma/:id',
    authenticateJWT,
    authorizeRole(['paninaro']),
    async (req, res) => {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const paninaroId = req.user.id;
            const orderId = req.params.id;
            const { nTurno } = req.body;
            const { confermato } = req.body;
            const today = new Date().toISOString().split('T')[0];

            const [classePaninaro] = await connection.query(
                'SELECT classe FROM Utente WHERE idUtente = ?',
                [paninaroId]
            );


            if(confermato === undefined || nTurno === undefined) {
                await connection.rollback();
                return res.status(400).json({ error: 'Parametri nTurno e/o confermato obbligatori' });
            }

            if (!classePaninaro[0]?.classe) {
                await connection.rollback();
                return res.status(403).json({ error: 'Paninaro non assegnato a nessuna classe' });
            }

            // verifica che l'ordine sia della stessa classe e non già confermato
            const [ordine] = await connection.query(`
                SELECT os.idOrdine 
                FROM OrdineSingolo os
                JOIN Utente u ON os.user = u.idUtente
                WHERE 
                    os.idOrdine = ?
                    AND u.classe = ?
                    AND os.data = ?
                    AND os.nTurno = ?
                    AND os.idOrdineClasse IS NULL`,
                [orderId, classePaninaro[0].classe, today, nTurno]
            );

            if (ordine.length === 0) {
                await connection.rollback();
                return res.status(404).json({ 
                    error: 'Ordine non trovato o già confermato ordine di classe',
                });
            }


            await connection.query(`
                UPDATE OrdineSingolo 
                SET confermato = ?
                WHERE idOrdine = ?`,
                [confermato, orderId]
            );

            await connection.commit();

            res.json({ 
                success: true,
                message: 'Ordine confermato con successo',
            });

        } catch (error) {
            await connection.rollback();
            console.error('Errore conferma ordine:', error);
            res.status(500).json({ 
                error: 'Errore del database',
            });
        } finally {
            connection.release();
        }
    }
);

// Crea ordine di classe
router.put('/classi/me/conferma',
    authenticateJWT,
    authorizeRole(['paninaro']),
    async (req, res) => {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const paninaroId = req.user.id;
            const { nTurno } = req.body;
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

            const [ordiniDaConfermare] = await connection.query(`
                SELECT os.idOrdine 
                FROM OrdineSingolo os
                JOIN Utente u ON os.user = u.idUtente
                WHERE 
                    u.classe = ? 
                    AND os.data = ? 
                    AND os.nTurno = ? 
                    AND os.idOrdineClasse IS NULL`,
                [classePaninaro[0].classe, today, nTurno]
            );

            if (ordiniDaConfermare.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Nessun ordine da confermare per questo turno' });
            }

            const [nuovoOrdineClasse] = await connection.query(`
                INSERT INTO OrdineClasse 
                    (classe, data, nTurno, giorno, idResponsabile, confermato)
                VALUES (?, ?, ?, ?, ?, TRUE)`,
                [classePaninaro[0].classe, today, nTurno, giorno, paninaroId]
            );

            await connection.query(`
                UPDATE OrdineSingolo 
                SET idOrdineClasse = ? 
                WHERE idOrdine IN (?)`,
                [nuovoOrdineClasse.insertId, ordiniDaConfermare.map(o => o.idOrdine)]
            );


            const [gestioni] = await connection.query(`
                SELECT DISTINCT p.proprietario
                FROM Prodotto p
                JOIN DettagliOrdineSingolo dos ON p.idProdotto = dos.idProdotto
                JOIN OrdineSingolo os ON dos.idOrdineSingolo = os.idOrdine
                JOIN OrdineClasse oc ON os.idOrdineClasse = oc.idOrdine
                WHERE oc.idOrdine = ?
                AND os.confermato = TRUE
                `, nuovoOrdineClasse.insertId
            );
            
            console.log('gestioni', gestioni);
            gestioni.map(gest => {
                console.log('gest', gest);
            });

            await Promise.all(
                gestioni.map(async gest => {
                    const qrCode = await genQr(connection);
                    console.log('qrCode', qrCode);
                    await connection.query(`
                        INSERT INTO QrCode (token, idOrdineClasse, gestore)
                        VALUES (?, ?, ?)`,
                        [qrCode, nuovoOrdineClasse.insertId, gest.proprietario]
                    );
                })
            );

            


            await connection.commit();
            res.json({ 
                success: true,
                idOrdineClasse: nuovoOrdineClasse.insertId,
                classe: classePaninaro[0].classe,
                nOrdiniCollegati: ordiniDaConfermare.length,
                nTurno: nTurno,
                data: today
            });

        } catch (error) {
            await connection.rollback();
            console.error('Errore conferma ordine:', error);
            res.status(500).json({ error: 'Errore del database' });
        } finally {
            connection.release();
        }
    }
);


// Ottieni ordini di classe raggruppati per nome di classe specifico
router.get('/classi/:classe',
    authenticateJWT,
    authorizeRole(['admin', 'gestore']),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { classe } = req.params;
            const { startDate, endDate, nTurno } = req.query;

            let query = `
                SELECT
                    oc.idOrdine AS idOrdineClasse,
                    oc.data,
                    oc.nTurno,
                    oc.giorno,
                    oc.confermato,
                    oc.oraRitiro,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'idOrdineSingolo', os.idOrdine,
                            'user', os.user,
                            'prodotti', (
                                SELECT JSON_ARRAYAGG(
                                    JSON_OBJECT(
                                        'idProdotto', p.idProdotto,
                                        'nome', p.nome,
                                        'quantita', dos.totalQuantita,
                                        'prezzo', p.prezzo
                                    )
                                )
                                FROM (
                                    SELECT dos.idProdotto, SUM(dos.quantita) AS totalQuantita
                                    FROM DettagliOrdineSingolo dos
                                    WHERE dos.idOrdineSingolo = os.idOrdine
                                    GROUP BY dos.idProdotto
                                ) dos
                                JOIN Prodotto p ON dos.idProdotto = p.idProdotto
                            )
                        )
                    ) AS ordiniSingoli
                FROM OrdineClasse oc
                JOIN OrdineSingolo os ON oc.idOrdine = os.idOrdineClasse
                JOIN Classe c ON oc.classe = c.id
                WHERE c.nome = ?
            `;

            const params = [classe];

            if (startDate && endDate) {
                query += ` AND oc.data BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (!startDate && !endDate) {
                query += ` AND oc.data = CURDATE()`;
            }

            if (nTurno) {
                query += ` AND oc.nTurno = ?`;
                params.push(nTurno);
            }

            query += ` 
                GROUP BY 
                    oc.idOrdine,
                    oc.data,
                    oc.nTurno,
                    oc.giorno,
                    oc.confermato,
                    oc.oraRitiro
                ORDER BY oc.data DESC, oc.idOrdine DESC
            `;

            const [orders] = await connection.execute(query, params);

            const result = orders.map(order => ({
                ...order,
                data: formatDate(order.data),
                ordiniSingoli: parseJSON(order.ordiniSingoli)
            }));

            res.json(result);

        } catch (error) {
            console.error('Errore nel recuperare ordini per classe:', error);
            res.status(500).json({ error: 'Errore del database nel recuperare ordini per classe.' });
        } finally {
            if (connection) connection.release();
        }
    }
);

router.put('/classi/:classeId/turno/:turno/prepara',
    authenticateJWT,
    authorizeRole(['admin', 'gestore']),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { classeId } = req.params;
            const { turno } = req.params;
            const { gestoreId } = req.body;
            
            if (!turno || !classeId) {
                return res.status(400).json({ error: 'Parametri turno e classe mancanti' });
            }
            
            // Get the current user's gestione if gestoreId not provided
            let gestoreToUpdate = gestoreId;
            if (!gestoreToUpdate && req.user.ruolo === 'gestore') {
                const [gestioneResult] = await connection.query(
                    `SELECT idGestione FROM UtenteGestione WHERE utenteId = ?`,
                    [req.user.id]
                );
                
                if (gestioneResult.length > 0) {
                    gestoreToUpdate = gestioneResult[0].idGestione;
                } else {
                    return res.status(400).json({ error: 'Gestione non trovata per questo utente' });
                }
            }
            
            // First find the relevant OrdineClasse records
            const [ordiniClasse] = await connection.query(`
                SELECT idOrdine
                FROM OrdineClasse
                WHERE nTurno = ? AND classe = ? AND data = CURDATE()`,
                [turno, classeId]
            );
            
            if (ordiniClasse.length === 0) {
                return res.status(404).json({ error: 'Nessun ordine trovato per questa classe e turno oggi' });
            }
            
            // Update all QR codes for the matching ordini classe and gestione
            const ordineClasseIds = ordiniClasse.map(o => o.idOrdine);
            const updateQuery = gestoreToUpdate 
                ? `UPDATE QrCode 
                   SET preparato = TRUE 
                   WHERE idOrdineClasse IN (?) AND gestore = ?`
                : `UPDATE QrCode 
                   SET preparato = TRUE 
                   WHERE idOrdineClasse IN (?)`;
                   
            const params = gestoreToUpdate 
                ? [ordineClasseIds, gestoreToUpdate] 
                : [ordineClasseIds];
                
            const [updateResult] = await connection.query(updateQuery, params);
            
            if (updateResult.affectedRows === 0) {
                return res.status(404).json({ 
                    error: 'Nessun QR code trovato per questa combinazione di ordini e gestione' 
                });
            }

            res.json({ 
                success: true, 
                message: 'QR code marcati come preparati',
                updatedCount: updateResult.affectedRows
            });

        } catch (error) {
            console.error('Errore nel preparare QR code di classe:', error);
            res.status(500).json({ error: 'Errore del database' });
        } finally {
            connection.release();
        }
    }
);

// Ottieni tutti i prodotti con le relative quantità
router.get('/prodotti',
    authenticateJWT,
    authorizeRole(['admin', 'gestore']),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { startDate, endDate, nTurno, isProf, gestoreId: queryGestoreId } = req.query;
            const userId = req.user.id;
            
            // Determina quale gestione filtrare
            let gestoreToFilter = queryGestoreId;
            
            // Se l'utente è gestore e non è stato specificato un gestoreId, usa la gestione dell'utente
            if (!gestoreToFilter && req.user.ruolo === 'gestore') {
                const [gestioneResult] = await connection.query(
                    `SELECT idGestione FROM UtenteGestione WHERE utenteId = ?`,
                    [userId]
                );
                
                if (gestioneResult.length > 0) {
                    gestoreToFilter = gestioneResult[0].idGestione;
                }
            }
            
            let query = `
                SELECT 
                    p.idProdotto,
                    p.nome,
                    p.prezzo,
                    p.descrizione,
                    g.nome AS gestione,
                    p.proprietario AS idGestione,
                    SUM(IFNULL(dos.quantita, 0)) as quantitaOrdinata,
                    SUM(CASE WHEN qr.preparato = TRUE THEN IFNULL(dos.quantita, 0) ELSE 0 END) as quantitaPreparata
                FROM Prodotto p
                JOIN Gestione g ON p.proprietario = g.idGestione
                LEFT JOIN DettagliOrdineSingolo dos ON p.idProdotto = dos.idProdotto
                LEFT JOIN OrdineSingolo os ON dos.idOrdineSingolo = os.idOrdine
                LEFT JOIN OrdineClasse oc ON os.idOrdineClasse = oc.idOrdine
                LEFT JOIN QrCode qr ON oc.idOrdine = qr.idOrdineClasse AND qr.gestore = p.proprietario
                WHERE 1=1
            `;

            const params = [];
            
            // Filtra per gestione se specificato
            if (gestoreToFilter) {
                query += ` AND p.proprietario = ?`;
                params.push(gestoreToFilter);
            }

            if (startDate && endDate) {
                query += ` AND os.data BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else {
                query += ` AND (os.data = CURDATE() OR os.data IS NULL)`;
            }

            if (nTurno) {
                query += ` AND (os.nTurno = ? OR os.nTurno IS NULL)`;
                params.push(nTurno);
            }

            if (isProf === 'true') {
                query += ` AND (oc.oraRitiro IS NOT NULL OR oc.oraRitiro IS NULL)`;
            } else if (isProf === 'false') {
                query += ` AND (oc.oraRitiro IS NULL OR oc.oraRitiro IS NULL)`;
            }

            query += ` GROUP BY p.idProdotto, p.nome, p.prezzo, p.descrizione, g.nome, p.proprietario
                       ORDER BY quantitaOrdinata DESC, p.nome ASC`;

            const [products] = await connection.execute(query, params);
            
            const formattedProducts = products.map(product => ({
                idProdotto: product.idProdotto,
                nome: product.nome,
                prezzo: product.prezzo,
                descrizione: product.descrizione,
                gestione: product.gestione,
                idGestione: product.idGestione,
                img: product.img,
                quantitaOrdinata: Number(product.quantitaOrdinata) || 0,
                quantitaPreparata: Number(product.quantitaPreparata) || 0,
                tuttiPreparati: product.quantitaOrdinata > 0 && product.quantitaOrdinata === product.quantitaPreparata
            }));

            res.json(formattedProducts);

        } catch (error) {
            console.error('Errore nel recupero prodotti e quantità:', error);
            res.status(500).json({ error: 'Errore del database' });
        } finally {
            connection.release();
        }
    }
);

// Marca un prodotto come preparato
router.put('/prodotti/:id/prepara',
    authenticateJWT,
    authorizeRole(['admin', 'gestore']),
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { id } = req.params;
            const { nTurno, startDate, endDate } = req.query;
            const userId = req.user.id;
            
            if (!id) {
                return res.status(400).json({ error: 'ID prodotto non valido' });
            }

            if (!nTurno) {
                return res.status(400).json({ error: 'Parametro nTurno obbligatorio' });
            }

            // Ottieni l'idGestione dell'utente
            let gestoreId;
            if (req.user.ruolo === 'gestore') {
                const [gestioneResult] = await connection.query(
                    `SELECT idGestione FROM UtenteGestione WHERE utenteId = ?`,
                    [userId]
                );
                
                if (gestioneResult.length > 0) {
                    gestoreId = gestioneResult[0].idGestione;
                } else {
                    return res.status(400).json({ error: 'Gestione non trovata per questo utente' });
                }
            }

            // Trova tutti gli OrdineClasse che contengono il prodotto, per il turno e data specificati
            const queryOrdiniClasse = `
                SELECT DISTINCT oc.idOrdine
                FROM OrdineClasse oc
                JOIN OrdineSingolo os ON os.idOrdineClasse = oc.idOrdine
                JOIN DettagliOrdineSingolo dos ON dos.idOrdineSingolo = os.idOrdine
                JOIN Prodotto p ON dos.idProdotto = p.idProdotto
                WHERE p.idProdotto = ?
                AND os.nTurno = ?
                ${startDate && endDate ? ' AND os.data BETWEEN ? AND ?' : ' AND os.data = CURDATE()'}
                ${gestoreId ? ' AND p.proprietario = ?' : ''}
            `;

            const paramsOrdiniClasse = [id, nTurno];
            if (startDate && endDate) {
                paramsOrdiniClasse.push(startDate, endDate);
            }
            if (gestoreId) {
                paramsOrdiniClasse.push(gestoreId);
            }

            const [ordiniClasse] = await connection.execute(queryOrdiniClasse, paramsOrdiniClasse);

            if (ordiniClasse.length === 0) {
                return res.status(404).json({ error: 'Nessun ordine trovato per questo prodotto' });
            }

            // Aggiorna i QR code relativi a questi ordini classe e alla gestione dell'utente
            const ordineClasseIds = ordiniClasse.map(o => o.idOrdine);
            
            const updateQuery = gestoreId
                ? `UPDATE QrCode 
                   SET preparato = TRUE 
                   WHERE idOrdineClasse IN (?) AND gestore = ?`
                : `UPDATE QrCode 
                   SET preparato = TRUE 
                   WHERE idOrdineClasse IN (?)`;
                   
            const updateParams = gestoreId
                ? [ordineClasseIds, gestoreId]
                : [ordineClasseIds];
                
            const [updateResult] = await connection.execute(updateQuery, updateParams);

            // Aggiorna anche il flag preparato nei dettagli ordine per tracciamento
            await connection.execute(`
                UPDATE DettagliOrdineSingolo dos
                JOIN OrdineSingolo os ON dos.idOrdineSingolo = os.idOrdine
                JOIN OrdineClasse oc ON os.idOrdineClasse = oc.idOrdine
                SET dos.preparato = TRUE 
                WHERE dos.idProdotto = ?
                AND dos.preparato = FALSE
                AND os.nTurno = ?
                ${startDate && endDate ? ' AND os.data BETWEEN ? AND ?' : ' AND os.data = CURDATE()'}
                AND oc.idOrdine IN (?)
            `, [id, nTurno, ...(startDate && endDate ? [startDate, endDate] : []), ordineClasseIds]);

            res.json({ 
                success: true, 
                message: 'Prodotto marcato come preparato',
                updatedCount: updateResult.affectedRows 
            });

        } catch (error) {
            console.error('Errore nel marcare prodotti come preparati:', error);
            res.status(500).json({ error: 'Errore del database' });
        } finally {
            connection.release();
        }
    }
);

module.exports = router;
