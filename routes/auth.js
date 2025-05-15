const express = require('express');
const router = express.Router();
const passport = require('passport');
const pool = require('../utils/db');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    const connection = await pool.getConnection();
    //console.log(profile);
    try {
        const [rows] = await connection.execute(
            'SELECT idUtente as id, ruolo FROM Utente WHERE google_id = ?',
            [profile.id]
        );
        
        if (rows.length > 0) {
            return done(null, rows[0]);
        }

        const ruolo = profile.emails[0].value.endsWith('@studenti.marconiverona.it') ? 'studente' : 'prof';
        
        const classe = 0; 
        
        const [newUser] = await connection.execute(
            'INSERT INTO Utente (mail, google_id, ruolo, foto_url, classe) VALUES (?, ?, ?, ?, ?)',
            [profile.emails[0].value, profile.id, ruolo, profile.photos[0].value, classe]
        );

        newUser.id = newUser.insertId;
        newUser.ruolo = ruolo;

        done(null, newUser);
        
    } catch (err) {
        done(err);
    } finally {
        connection.release();
    }
}));



router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login', session: false }), (req, res) => {
    const token = jwt.sign(
        { id: req.user.id, ruolo: req.user.ruolo },
        process.env.JWT_SECRET,
        { expiresIn: '1y' }
    );
    
    //TODO: cambiare
    //res.status(200).json({token: token});
    res.cookie('jwt', token, {
        httpOnly: true,
        secure: false,
        sameSite: 'Lax', //TODO: cambiare lax-->domini diversi, strict-->dominio uguale
        maxAge: 1000 * 60 * 30,
    });
    //res.redirect(`http://localhost:5173/callback#token=${token}`);
    res.status(200).redirect('http://l.figliolo.it:5173/');
});

// Google OAuth
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email'], 
    session: false
}));

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.execute(
            'SELECT utenteId as id, idUtenteGestione as idGestione, password FROM UtenteGestione WHERE username = ?',
            [username]
        );

        //TODO: da criptare e cambiare if

        // if (!rows[0] || !bcrypt.compareSync(password, rows[0].password)) {
        //     return res.status(401).json({ message: 'Credenziali non valide' });
        // }

        if(!rows[0] || rows[0].password !== password) {
            return res.status(401).json({ message: 'Credenziali non valide' });
        }
        
        const token = jwt.sign(
            { idGestione: rows[0].idGestione, ruolo: 'gestore', id: rows[0].id },
            process.env.JWT_SECRET,
            { expiresIn: '1y' }
        );
        res.json({ token });
    } finally {
        connection.release();
    }
});


router.get('/logout', (req, res) => {
    res.clearCookie('jwt');
    res.status(200).json({ message: 'Logout effettuato' });
});

router.get('/check', async (req, res) => {
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

        const [userData] = await connection.query(
            'SELECT nome, foto_url, ruolo FROM Utente WHERE idUtente = ?',
            [req.user.id]
        );

        res.status(200).json(userData[0]);
        
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
}
);

module.exports = router;
