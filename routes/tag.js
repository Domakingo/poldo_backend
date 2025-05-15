const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { authenticateJWT, authorizeRole } = require('../middlewares/authMiddleware');

// Ottieni tutti i tag
router.get('/', authenticateJWT, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const [rows] = await pool.query('SELECT * FROM Tag');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});

// Aggiungi un nuovo tag
router.post('/', authenticateJWT, authorizeRole(['admin', 'gestore']), async (req, res) => {
    const { nomeTag } = req.body;

    console.log('Nome tag:', nomeTag);

    if (typeof nomeTag !== 'string') {
        return res.status(400).json({ error: "Il campo 'nomeTag' deve essere una stringa non vuota" });
    }

    try {
        const [result] = await pool.query('INSERT INTO Tag (nome) VALUES (?)', [nomeTag]);
        res.status(201).json({ id: result.insertId, nomeTag });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Tag già esistente' });
        }
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});

// Modifica un tag esistente
router.put('/:vecchioNome',
  authenticateJWT,
  authorizeRole(['admin', 'gestore']),
  async (req, res) => {
    const { nuovoNome } = req.body;
    const vecchioNome = req.params.vecchioNome;

    // Validazione input
    if (typeof nuovoNome !== 'string' || nuovoNome.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Nome non valido',
        details: 'Il campo deve essere una stringa non vuota'
      });
    }
    if (vecchioNome.toLowerCase() === nuovoNome.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Nomi identici',
        details: 'Il nuovo nome non può essere uguale al vecchio'
      });
    }

    const connection = await pool.getConnection();
    try {
      // Verifica esistenza tag originale (case-insensitive)
      const [existingTags] = await connection.query(
        'SELECT nome FROM `Tag` WHERE LOWER(nome) = LOWER(?)',
        [vecchioNome]
      );
      if (existingTags.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Tag non trovato',
          details: `Nessun tag trovato con nome: "${vecchioNome}"`
        });
      }
      const vecchioNomeEsatto = existingTags[0].nome;

      // Controllo duplicati su nuovoNome
      const [duplicateCheck] = await connection.query(
        'SELECT 1 FROM `Tag` WHERE LOWER(nome) = LOWER(?)',
        [nuovoNome]
      );
      if (duplicateCheck.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Nome già esistente',
          details: `Esiste già un tag con nome: "${nuovoNome}"`
        });
      }

      // Esecuzione update (case-insensitive)
      const [result] = await connection.query(
        'UPDATE `Tag` SET nome = ? WHERE LOWER(nome) = LOWER(?)',
        [nuovoNome, vecchioNome]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Tag non trovato',
          details: 'Il tag potrebbe essere stato eliminato da un altro utente'
        });
      }

      // Risposta di successo
      return res.json({
        success: true,
        message: 'Tag modificato con successo',
        dati: {
          vecchioNome: vecchioNomeEsatto,
          nuovoNome,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Errore modifica tag:', error);
      let status = 500;
      const response = {
        success: false,
        error: 'Errore interno del server',
        details: `Referenza errore: ERR-${Date.now()}`
      };
      if (error.code === 'ER_DUP_ENTRY') {
        status = 409;
        response.error = 'Conflitto di dati';
        response.details = 'Il nome esiste già nel database';
      } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        status = 400;
        response.error = 'Vincolo di integrità';
        response.details = 'Impossibile modificare per relazioni esistenti';
      }
      return res.status(status).json(response);

    } finally {
      connection.release();
    }
  }
);

// Elimina un tag
router.delete('/:tagName', authenticateJWT, authorizeRole(['admin']), async (req, res) => {
    const tagName = req.params.tagName;

    try {
        const [rows] = await pool.query('SELECT idProdotto FROM ProdottoTag WHERE tag = ?', [tagName]);

        if (rows.length > 0) {
            return res.status(400).json({ error: 'Il tag non può essere eliminato perché associato a prodotti' });
        }

        const [result] = await pool.query('DELETE FROM Tag WHERE nome = ?', [tagName]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Tag non trovato' });
        }
        res.status(204).end();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});

module.exports = router;