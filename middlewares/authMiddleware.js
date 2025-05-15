const jwt = require('jsonwebtoken');
const pool = require('../utils/db');

module.exports = {
    authenticateJWT: async (req, res, next) => {
        // const authHeader = req.headers.authorization;
        
        // if (!authHeader) {
        //     return res.sendStatus(401);
        // }

        //const token = authHeader.split(' ')[1];
        const token = req.cookies.jwt;
        if (!token) {
            return res.status(401).json({ error: 'Token non fornito' });
        }
        const connection = await pool.getConnection();

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            const [users] = await connection.query(
                'SELECT bannato, ruolo FROM Utente WHERE idUtente = ?', 
                [decoded.id]
            );

            if (users.length === 0) {
                return res.status(404).json({ error: 'Utente non trovato' });
            }

            const user = users[0];

            if (user.bannato === 1) {
                return res.status(403).json({ error: 'Utente bannato' });
            }

            req.user = {
                ...decoded,
                ruolo: user.ruolo,
                bannato: user.bannato
            };

            next();
            
        } catch (error) {
            console.error(error);
            
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token scaduto' });
            }
            
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ error: 'Token non valido' });
            }

            res.status(500).json({ error: 'Errore del server' });
        } finally {
            connection.release();
        }
    },

    authorizeRole: (roles) => (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Non autorizzato' });
            }

            const userRole = req.user.ruolo;
            
            if (roles.includes(userRole) || 
               (roles.includes('studente') && userRole === 'paninaro')) {
                return next();
            }

            console.log(roles);
            console.log(userRole);

            res.status(403).json({ error: 'Accesso negato' });

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Errore del server' });
        }
    }
};