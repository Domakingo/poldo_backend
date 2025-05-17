const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { authenticateJWT, authorizeRole } = require('../middlewares/authMiddleware');

// Ottieni le gestioni disponibili
router.get('/', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const connection = await pool.getConnection();
    try {        
        let query = `
            SELECT g.idGestione, g.nome
            FROM Gestione g
        `;
        
        const [gestioni] = await connection.execute(query, params);
        res.json(gestioni);
    } catch (error) {
        console.error('Errore nel recupero gestioni:', error);
        res.status(500).json({ error: 'Errore del database' });
    } finally {
        connection.release();
    }
});

// Crea una nuova gestione
router.post('/', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
        const { nome, utenteId } = req.body;
        
        if (!nome) {
            await connection.rollback();
            return res.status(400).json({ error: 'Nome gestione obbligatorio' });
        }
        
        // Verifica se esiste già una gestione con lo stesso nome
        const [existingGestione] = await connection.query(
            `SELECT idGestione FROM Gestione WHERE nome = ?`,
            [nome]
        );
        
        if (existingGestione.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Esiste già una gestione con questo nome' });
        }
        
        // Se è specificato un utenteId, verifica che esista
        if (utenteId) {
            const [userExists] = await connection.query(
                `SELECT idUtente FROM Utente WHERE idUtente = ?`,
                [utenteId]
            );
            
            if (userExists.length === 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'L\'utente specificato non esiste' });
            }
        }
          // Crea la gestione
        const [result] = await connection.query(
            `INSERT INTO Gestione (nome)
             VALUES (?)`,
            [nome]
        );
        
        // Se è stato specificato un utenteId, crea un'associazione UtenteGestione
        if (utenteId) {
            // Imposta il ruolo dell'utente a gestore se non è già admin
            await connection.query(
                `UPDATE Utente SET ruolo = 'gestore'
                 WHERE idUtente = ? AND ruolo != 'admin'`,
                [utenteId]
            );
            
            // Crea l'associazione
            await connection.query(
                `INSERT INTO UtenteGestione (utenteId, idGestione, username, password)
                 VALUES (?, ?, ?, ?)`,
                [utenteId, result.insertId, `user_${utenteId}`, `pass_${Date.now()}`]
            );
        }
        
        await connection.commit();
        
        res.status(201).json({
            success: true,
            idGestione: result.insertId,
            message: 'Gestione creata con successo'
        });
        
        // Imposta il ruolo del proprietario a gestore se non è già un admin
        await connection.query(
            `UPDATE Utente SET ruolo = 'gestore'
             WHERE idUtente = ? AND ruolo != 'admin'`,
            [idOwner]
        );
        
        await connection.commit();
        
        res.status(201).json({
            success: true,
            idGestione: result.insertId,
            message: 'Gestione creata con successo'
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Errore nella creazione della gestione:', error);
        res.status(500).json({ error: 'Errore del database' });
    } finally {
        connection.release();
    }
});

// Ottieni una gestione specifica
router.get('/:id', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const gestioneId = req.params.id;
        
        // Costruisci la query di base
        let query = `
            SELECT g.idGestione, g.nome
            FROM Gestione g
            WHERE g.idGestione = ?
        `;
        
        const params = [gestioneId];
        const [gestioni] = await connection.execute(query, params);
        
        if (gestioni.length === 0) {
            return res.status(404).json({ error: 'Gestione non trovata o non autorizzata' });
        }
        
        res.json(gestioni[0]);
    } catch (error) {
        console.error('Errore nel recupero dettagli gestione:', error);
        res.status(500).json({ error: 'Errore del database' });
    } finally {
        connection.release();
    }
});

// Aggiorna una gestione
router.put('/:id', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
        const gestioneId = req.params.id;
        const { nome } = req.body;
        
        // Verifica che la gestione esista
        let checkQuery = `SELECT idGestione FROM Gestione WHERE idGestione = ?`;
        let checkParams = [gestioneId];
        
        const [gestione] = await connection.execute(checkQuery, checkParams);
        
        if (gestione.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Gestione non trovata o non autorizzata' });
        }
        
        // Prepara la query di aggiornamento
        const updateFields = [];
        const updateParams = [];
        
        if (nome) {
            // Verifica che il nome non sia già in uso
            const [existingName] = await connection.query(
                `SELECT idGestione FROM Gestione WHERE nome = ? AND idGestione != ?`,
                [nome, gestioneId]
            );
            
            if (existingName.length > 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Esiste già una gestione con questo nome' });
            }
            
            updateFields.push(`nome = ?`);
            updateParams.push(nome);
        }
        
        // Solo admin può associare un nuovo utente
        if (utenteId !== undefined && userRole === 'admin') {
            // Verifica che l'utente esista
            const [userExists] = await connection.query(
                `SELECT idUtente FROM Utente WHERE idUtente = ?`,
                [utenteId]
            );
            
            if (userExists.length === 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'L\'utente specificato non esiste' });
            }
            
            // Imposta il ruolo dell'utente a gestore se non è già admin
            await connection.query(
                `UPDATE Utente SET ruolo = 'gestore'
                 WHERE idUtente = ? AND ruolo != 'admin'`,
                [utenteId]
            );
            
            // Crea o aggiorna l'associazione UtenteGestione
            await connection.query(`
                INSERT INTO UtenteGestione (utenteId, idGestione, username, password)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE utenteId = VALUES(utenteId)
            `, [utenteId, gestioneId, `user_${utenteId}`, `pass_${Date.now()}`]);
        }
          if (updateFields.length === 0 && utenteId === undefined) {
            await connection.rollback();
            return res.status(400).json({ error: 'Nessun campo da aggiornare' });
        }
        
        if (updateFields.length > 0) {
            // Esegui l'aggiornamento
            const updateQuery = `
                UPDATE Gestione
                SET ${updateFields.join(', ')}
                WHERE idGestione = ?
            `;
            
            await connection.execute(updateQuery, [...updateParams, gestioneId]);
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Gestione aggiornata con successo'
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Errore nell\'aggiornamento della gestione:', error);
        res.status(500).json({ error: 'Errore del database' });
    } finally {
        connection.release();
    }
});

// Elimina una gestione
router.delete('/:id', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
        const gestioneId = req.params.id;
        
        // Verifica che esistano prodotti associati
        const [prodotti] = await connection.query(
            `SELECT COUNT(*) as count FROM Prodotto WHERE proprietario = ?`,
            [gestioneId]
        );
        
        if (prodotti[0].count > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                error: 'Impossibile eliminare: la gestione ha prodotti associati' 
            });
        }
        
        // Elimina prima le associazioni UtenteGestione
        await connection.query(
            `DELETE FROM UtenteGestione WHERE idGestione = ?`,
            [gestioneId]
        );
        
        // Elimina la gestione
        const [result] = await connection.query(
            `DELETE FROM Gestione WHERE idGestione = ?`,
            [gestioneId]
        );
        
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Gestione non trovata' });
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Gestione eliminata con successo'
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Errore nell\'eliminazione della gestione:', error);
        res.status(500).json({ error: 'Errore del database' });    } finally {
        connection.release();
    }
});

// Associa utente a gestione
router.post('/:id/utenti', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
        const gestioneId = req.params.id;
        const { utenteId } = req.body;
        
        if (!utenteId) {
            await connection.rollback();
            return res.status(400).json({ error: 'ID utente obbligatorio' });
        }
        
        // Verifica che la gestione esista
        const [gestione] = await connection.query(
            `SELECT idGestione FROM Gestione WHERE idGestione = ?`,
            [gestioneId]
        );
        
        if (gestione.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Gestione non trovata' });
        }
        
        // Verifica che l'utente esista
        const [user] = await connection.query(
            `SELECT idUtente FROM Utente WHERE idUtente = ?`,
            [utenteId]
        );
        
        if (user.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Utente non trovato' });
        }
        
        // Imposta il ruolo dell'utente a gestore se non è già admin
        await connection.query(
            `UPDATE Utente SET ruolo = 'gestore'
             WHERE idUtente = ? AND ruolo != 'admin'`,
            [utenteId]
        );
        
        // Crea l'associazione UtenteGestione
        await connection.query(`
            INSERT INTO UtenteGestione (utenteId, idGestione, username, password)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE username = VALUES(username), password = VALUES(password)
        `, [utenteId, gestioneId, `user_${utenteId}`, `pass_${Date.now()}`]);
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Utente associato alla gestione con successo'
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Errore nell\'associazione utente-gestione:', error);
        res.status(500).json({ error: 'Errore del database' });
    } finally {
        connection.release();
    }
});

// Rimuovi utente da gestione
router.delete('/:id/utenti/:utenteId', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const gestioneId = req.params.id;
        const utenteId = req.params.utenteId;
        
        // Rimuovi l'associazione
        const [result] = await connection.query(`
            DELETE FROM UtenteGestione
            WHERE idGestione = ? AND utenteId = ?
        `, [gestioneId, utenteId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Associazione non trovata' });
        }
        
        res.json({
            success: true,
            message: 'Utente rimosso dalla gestione con successo'
        });
        
    } catch (error) {
        console.error('Errore nella rimozione utente-gestione:', error);
        res.status(500).json({ error: 'Errore del database' });
    } finally {
        connection.release();
    }
});

module.exports = router;