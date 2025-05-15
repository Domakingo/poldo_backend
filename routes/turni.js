const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { authenticateJWT, authorizeRole } = require('../middlewares/authMiddleware');

function getQueryTurni(ruolo) {
    if(["studente", "paninaro"].includes(ruolo)) {
        return 'SELECT * FROM Turno WHERE giorno = ? AND studenti = 1';
    }
    return 'SELECT * FROM Turno WHERE giorno = ?';
}


router.get('/', authenticateJWT, async (req, res) => {
    const connection = await pool.getConnection();
    try {

        const giorniEnum = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
        const giorno = !req.query.giorno ? giorniEnum[new Date().getDay()] : req.query.giorno;

        const [rows] = await connection.query(getQueryTurni(req.user.ruolo), [giorno]);
        
        if(rows.length === 0) {
            return res.status(404).json({ error: 'Nessun turno trovato' });
        }
        
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching turn:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});

router.post('/', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const { n, giorno, oraInizioOrdine, oraFineOrdine, oraInizioRitiro, oraFineRitiro } = req.body;
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query('INSERT INTO Turno (n, giorno, oraInizioOrdine, oraFineOrdine, oraInizioRitiro, oraFineRitiro) VALUES (?, ?, ?, ?, ?, ?)', [n, giorno, oraInizioOrdine, oraFineOrdine, oraInizioRitiro, oraFineRitiro]);
        res.status(201).json({ id: result.insertId });
    }
    catch (error) {
        console.error('Error creating turn:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Turno già esistente' });
        }
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});

router.put('/:giorno/:n', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const { oraInizioOrdine, oraFineOrdine, oraInizioRitiro, oraFineRitiro } = req.body;
    const { giorno, n } = req.params;
    if (!oraInizioOrdine || !oraFineOrdine || !oraInizioRitiro || !oraFineRitiro) {
        return res.status(400).json({ error: 'Tutti i campi sono richiesti' });
    }
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query('UPDATE turni SET oraInizioOrdine = ?, oraFineOrdine = ?, oraInizioRitiro = ?, oraFineRitiro = ? WHERE giorno = ? ANd n = ?', [oraInizioOrdine, oraFineOrdine, oraInizioRitiro, oraFineRitiro, giorno, n]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Turno non trovato' });
        }
        res.json({ message: 'Turno aggiornato con successo' });
    }
    catch (error) {
        console.error('Error updating turno:', error);
        if(error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Turno già esistente' });
        }
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});

router.delete('/:giorno/:n', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const connection = await pool.getConnection();
    const { giorno, n } = req.params;
    try {
        const [result] = await connection.query('DELETE FROM Turno WHERE giorno= ? AND n = ?', [giorno, n]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Turno non trovato' });
        }
        res.json({ message: 'Turno eliminato con successo' });
    }
    catch (error) {
        console.error('Error deleting turno:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});


module.exports = router;