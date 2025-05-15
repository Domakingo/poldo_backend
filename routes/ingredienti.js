const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { authenticateJWT, authorizeRole } = require('../middlewares/authMiddleware');

// Ottieni tutti gli ingredienti
router.get('/', authenticateJWT, async (req, res) => {
    const connection = await pool.getConnection();

    const { orderDirection } = req.query;
    const validOrderDirections = ['ASC', 'DESC'];

    if (orderDirection && !validOrderDirections.includes(orderDirection)) {
        return res.status(400).json({ error: 'Direzione di ordinamento non valida' });
    }

    const orderBy = orderDirection ? orderDirection : 'ASC';

    try {
        const [rows] = await connection.query(`SELECT * FROM Ingrediente ORDER BY nome ${orderBy}`);
        
        if(rows.length === 0) {
            return res.status(404).json({ error: 'Nessun ingrediente trovato' });
        }
        
        res.json(rows);
    }
    catch (error) {
        console.error('Errore nel recupero degli ingredienti:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
});

// Aggiungi un nuovo ingrediente
router.post('/', authenticateJWT, authorizeRole(['gestore', 'admin']), async (req, res) => {
    const { nomeIngrediente } = req.body;

    console.log('Nome ingrediente:', nomeIngrediente);

    // Validazione dell'input
    if (typeof nomeIngrediente !== 'string') {
        return res.status(400).json({ error: "Il campo 'nomeIngrediente' deve essere una stringa non vuota" });
    }

    const connection = await pool.getConnection();
    try {
        const [_result] = await connection.query(
            'INSERT INTO Ingrediente (nome) VALUES (?)',
            [nomeIngrediente]
        );
        
        res.status(201).json({nomeIngrediente: nomeIngrediente});

    } catch (error) {
        console.error('Errore nella creazione dell\'ingrediente:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ 
                error: 'Ingrediente già presente nel database',
                details: `L'ingrediente "${nomeIngrediente}" esiste già`
            });
        } else {
            res.status(500).json({ 
                error: 'Errore interno del server',
                details: error.message 
            });
        }
    } finally {
        connection.release();
    }
});

// Modifica un ingrediente esistente
router.put('/:vecchioNome',
  authenticateJWT,
  authorizeRole(['gestore', 'admin']),
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
      // Verifica esistenza ingrediente originale (case-insensitive)
      const [existingIngredients] = await connection.query(
        'SELECT nome FROM `Ingrediente` WHERE LOWER(nome) = LOWER(?)',
        [vecchioNome]
      );
      if (existingIngredients.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Ingrediente non trovato',
          details: `Nessun ingrediente trovato con nome: "${vecchioNome}"`
        });
      }
      const vecchioNomeEsatto = existingIngredients[0].nome;

      // Controllo duplicati su nuovoNome
      const [duplicateCheck] = await connection.query(
        'SELECT 1 FROM `Ingrediente` WHERE LOWER(nome) = LOWER(?)',
        [nuovoNome]
      );
      if (duplicateCheck.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Nome già esistente',
          details: `Esiste già un ingrediente con nome: "${nuovoNome}"`
        });
      }

      // Esecuzione update (case-insensitive)
      const [result] = await connection.query(
        'UPDATE `Ingrediente` SET nome = ? WHERE LOWER(nome) = LOWER(?)',
        [nuovoNome, vecchioNome]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Ingrediente non trovato',
          details: 'L\'ingrediente potrebbe essere stato eliminato da un altro utente'
        });
      }

      // Risposta di successo
      return res.json({
        success: true,
        message: 'Ingrediente modificato con successo',
        dati: {
          vecchioNome: vecchioNomeEsatto,
          nuovoNome,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Errore modifica ingrediente:', error);
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

// Elimina un ingrediente
router.delete('/:nomeIngrediente', authenticateJWT, authorizeRole(['gestore', 'admin']), async (req, res) => {
    const nome = req.params.nomeIngrediente;

    // Validazione dell'input
    if (typeof nome !== 'string') {
        return res.status(400).json({ error: "Il campo 'nome' deve essere una stringa non vuota" });
    }

    const connection = await pool.getConnection();

    try {
        const [result] = await connection.query(
            'DELETE FROM Ingrediente WHERE nome = ?',
            [nome]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ingrediente non trovato' });
        }

        res.status(204).send();
    } catch (error) {
        console.error('Errore nell\'eliminazione dell\'ingrediente:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    } finally {
        connection.release();
    }
})

module.exports = router;