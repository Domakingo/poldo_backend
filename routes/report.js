const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { authenticateJWT, authorizeRole } = require('../middlewares/authMiddleware');

/**
 * @route GET /api/reports/products/sales/:timeframe
 * @desc Ottiene le statistiche di vendita dei prodotti per periodo di tempo
 * @param {string} timeframe - day, week, month, year, all
 * @param {number} year - (opzionale) Anno specifico per il report
 * @param {number} month - (opzionale) Mese specifico per il report (solo per timeframe='day')
 */
router.get('/prodotti/vendite/:timeframe', authenticateJWT, authorizeRole(['admin', 'gestore']), 
    async (req, res) => {
        const { timeframe } = req.params;
        const { year, month } = req.query; // Parametri opzionali da query string
        const connection = await pool.getConnection();
        
        try {
            let dateFilter = '';
            
            switch(timeframe) {
                case 'day':
                    // Filtro per giorni in un mese specifico (o corrente)
                    if (month && year) {
                        dateFilter = `YEAR(os.data) = ${parseInt(year)} AND MONTH(os.data) = ${parseInt(month)}`;
                    } else if (year) {
                        dateFilter = `YEAR(os.data) = ${parseInt(year)} AND MONTH(os.data) = MONTH(CURDATE())`;
                    } else if (month) {
                        dateFilter = `YEAR(os.data) = YEAR(CURDATE()) AND MONTH(os.data) = ${parseInt(month)}`;
                    } else {
                        dateFilter = `YEAR(os.data) = YEAR(CURDATE()) AND MONTH(os.data) = MONTH(CURDATE())`;
                    }
                    break;
                case 'week':
                    // Filtro per settimane in un anno specifico (o corrente)
                    if (year) {
                        dateFilter = `YEAR(os.data) = ${parseInt(year)}`;
                    } else {
                        dateFilter = `YEAR(os.data) = YEAR(CURDATE())`;
                    }
                    break;
                case 'month':
                    // Filtro per mesi in un anno specifico (o corrente)
                    if (year) {
                        dateFilter = `YEAR(os.data) = ${parseInt(year)}`;
                    } else {
                        dateFilter = `YEAR(os.data) = YEAR(CURDATE())`;
                    }
                    break;
                case 'year':
                    // Filtro per un anno specifico o tutti gli anni
                    if (year) {
                        dateFilter = `YEAR(os.data) = ${parseInt(year)}`;
                    } else {
                        dateFilter = `1=1`; // Tutti gli anni
                    }
                    break;
                case 'all':
                    // Tutto il periodo
                    dateFilter = `1=1`; // Nessun filtro - restituisce tutti i dati
                    break;
                default:
                    return res.status(400).json({ error: 'Periodo di tempo non valido. Usa day, week, month, year, o all' });
            }
            
            // Se l'utente è un gestore, filtra per la sua gestione
            const gestioneFilter = req.user.ruolo === 'gestore' ? 
                `AND p.proprietario = ${connection.escape(req.user.idGestione)}` : '';
            
            const query = `
                SELECT 
                    p.idProdotto, 
                    p.nome, 
                    p.prezzo,
                    g.nome AS gestione,
                    SUM(dos.quantita) AS quantita_venduta,
                    SUM(dos.quantita * p.prezzo) AS valore_totale
                FROM DettagliOrdineSingolo dos
                JOIN OrdineSingolo os ON dos.idOrdineSingolo = os.idOrdine
                JOIN Prodotto p ON dos.idProdotto = p.idProdotto
                JOIN Gestione g ON p.proprietario = g.idGestione
                WHERE ${dateFilter}
                    AND os.confermato = TRUE
                    ${gestioneFilter}
                GROUP BY p.idProdotto, p.nome, p.prezzo, g.nome
                ORDER BY quantita_venduta DESC
            `;
            
            const [rows] = await connection.query(query);
            
            // Calcola il totale complessivo
            const totalValue = rows.reduce((sum, item) => sum + parseFloat(item.valore_totale), 0);
            const totalQuantity = rows.reduce((sum, item) => sum + parseInt(item.quantita_venduta), 0);
            
            // Aggiungi informazioni sul contesto temporale nella risposta
            const contextInfo = {
                timeframe,
                year: year ? parseInt(year) : (timeframe !== 'all' && timeframe !== 'year' ? new Date().getFullYear() : null),
                month: month && timeframe === 'day' ? parseInt(month) : (timeframe === 'day' ? new Date().getMonth() + 1 : null)
            };
            
            res.json({
                context: contextInfo,
                products: rows,
                summary: {
                    totalProducts: rows.length,
                    totalQuantitySold: totalQuantity,
                    totalValue: totalValue.toFixed(2)
                }
            });
            
        } catch (error) {
            console.error('Errore nel recupero delle vendite dei prodotti:', error);
            res.status(500).json({ error: 'Errore interno del server' });
        } finally {
            connection.release();
        }
    }
);

/**
 * @route GET /api/reports/sales/:timeframe
 * @desc Ottiene le statistiche totali di vendita per periodo di tempo
 * @param {string} timeframe - day, week, month, year, all
 * @param {number} year - (opzionale) Anno specifico per il report
 * @param {number} month - (opzionale) Mese specifico per il report (solo per timeframe='day')
 */
router.get('/vendite/:timeframe', authenticateJWT, authorizeRole(['admin', 'gestore']), 
    async (req, res) => {
        const { timeframe } = req.params;
        const { year, month } = req.query; // Parametri opzionali da query string
        const connection = await pool.getConnection();
        
        try {
            let groupBy, dateFormat, dateFilter;
            const yearFilter = year ? `YEAR(os.data) = ${parseInt(year)}` : `YEAR(os.data) = YEAR(CURDATE())`;
            
            switch(timeframe) {
                case 'day':
                    // Giorni di un mese specifico (o corrente)
                    groupBy = `DAY(os.data)`;
                    dateFormat = '%d'; // Solo il giorno del mese
                    if (month) {
                        dateFilter = `${yearFilter} AND MONTH(os.data) = ${parseInt(month)}`;
                    } else {
                        dateFilter = `${yearFilter} AND MONTH(os.data) = MONTH(CURDATE())`;
                    }
                    break;
                case 'week':
                    // Settimane di un anno specifico (o corrente)
                    groupBy = `WEEK(os.data, 1)`;
                    dateFormat = 'W%v'; // Solo il numero della settimana
                    dateFilter = yearFilter;
                    break;
                case 'month':
                    // Mesi di un anno specifico (o corrente)
                    groupBy = `MONTH(os.data)`;
                    dateFormat = '%M'; // Solo il nome del mese
                    dateFilter = yearFilter;
                    break;
                case 'year':
                    // Tutti gli anni o un anno specifico
                    groupBy = `YEAR(os.data)`;
                    dateFormat = '%Y';
                    dateFilter = year ? yearFilter : '1=1';
                    break;
                case 'all':
                    // Tutto il periodo
                    groupBy = `YEAR(os.data)`;
                    dateFormat = '%Y';
                    dateFilter = '1=1';
                    break;
                default:
                    return res.status(400).json({ error: 'Periodo di tempo non valido. Usa day, week, month, year, o all' });
            }
            
            // Se l'utente è un gestore, filtra per la sua gestione
            const gestioneFilter = req.user.ruolo === 'gestore' ? 
                `AND p.proprietario = ${connection.escape(req.user.idGestione)}` : '';
            
            const query = `
                SELECT 
                    ${groupBy} AS periodo_numero,
                    DATE_FORMAT(os.data, '${dateFormat}') AS periodo_nome,
                    COUNT(DISTINCT os.idOrdine) AS numero_ordini,
                    SUM(dos.quantita) AS quantita_prodotti,
                    SUM(dos.quantita * p.prezzo) AS valore_totale
                FROM OrdineSingolo os
                JOIN DettagliOrdineSingolo dos ON os.idOrdine = dos.idOrdineSingolo
                JOIN Prodotto p ON dos.idProdotto = p.idProdotto
                WHERE os.confermato = TRUE
                    AND ${dateFilter}
                    ${gestioneFilter}
                GROUP BY ${groupBy}
                ORDER BY ${groupBy}
            `;
            
            const [rows] = await connection.query(query);
            
            // Calcola i totali complessivi
            const totalOrders = rows.reduce((sum, item) => sum + parseInt(item.numero_ordini), 0);
            const totalQuantity = rows.reduce((sum, item) => sum + parseInt(item.quantita_prodotti), 0);
            const totalValue = rows.reduce((sum, item) => sum + parseFloat(item.valore_totale), 0);
            
            // Aggiungi informazioni sul contesto temporale nella risposta
            const contextInfo = {
                timeframe,
                year: year ? parseInt(year) : (timeframe !== 'all' ? new Date().getFullYear() : null),
                month: month && timeframe === 'day' ? parseInt(month) : (timeframe === 'day' ? new Date().getMonth() + 1 : null)
            };
            
            res.json({
                context: contextInfo,
                salesData: rows,
                summary: {
                    totalOrders,
                    totalQuantity,
                    totalValue: parseFloat(totalValue.toFixed(2))
                }
            });
            
        } catch (error) {
            console.error('Errore nel recupero dei dati di vendita:', error);
            res.status(500).json({ error: 'Errore interno del server' });
        } finally {
            connection.release();
        }
    }
);

module.exports = router;
