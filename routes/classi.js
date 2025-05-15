const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { authenticateJWT, authorizeRole } = require('../middlewares/authMiddleware');

// Ottieni tutte le classi
router.get('/', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('SELECT c.nome as classe, c.id FROM Classe c');
        
        if(rows.length === 0) {
            return res.status(404).json({ error: 'Nessuna classe trovata' });
        }
        
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});

// Ottieni la classe dell'utente
router.get('/me', authenticateJWT, authorizeRole(['studente']), async (req, res) => {
    const userId = req.user.id;
    connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `SELECT c.nome as classe
             FROM Classe c 
             JOIN Utente u ON c.id = u.classe
             WHERE u.idUtente = ?`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Classe non trovata' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});

// Ottieni dettagli di una classe specifica
router.get('/:classe', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const classe = req.params.classe;
    const { bannato, ruolo } = req.query;
    const connection = await pool.getConnection();
    
    try {
        let query = `
            SELECT u.idUtente, u.mail, u.bannato, u.foto_url, u.ruolo 
            FROM Classe c 
            JOIN Utente u ON c.id = u.classe
            WHERE c.nome = ?
        `;
        const queryParams = [classe];
        
        if (bannato) {
            query += ' AND u.bannato = ?';
            queryParams.push(bannato);
        }
        
        if (ruolo) {
            query += ' AND u.ruolo = ?';
            queryParams.push(ruolo);
        }
        
        const [rows] = await connection.query(query, queryParams);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Classe non trovata' });
        }
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});

module.exports = router;