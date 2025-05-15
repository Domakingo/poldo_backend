require('dotenv').config({ path: 'secrets.env' });
const cors = require('cors');
const express = require('express');
const cookieParser = require('cookie-parser');

const path = require('path');

const logger = require('./utils/logger');

const authRoutes = require('./routes/auth');
const classiRoutes = require('./routes/classi');
const utentiRoutes = require('./routes/utenti');
const productRoutes = require('./routes/prodotti');
const orderRoutes = require('./routes/ordini');
const ingredientsRoutes = require('./routes/ingredienti');
const tagRoutes = require('./routes/tag');
const turniRoutes = require('./routes/turni');
const qrRoutes = require('./routes/qr');
//const reportRoutes = require('./routes/reportRoutes');

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(cors({
  origin: 'http://l.figliolo.it:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
}));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.json());
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Routes
app.use("/v1/auth", authRoutes);
app.use("/v1/classi", classiRoutes);
app.use("/v1/utenti", utentiRoutes);
app.use("/v1/prodotti", productRoutes);
app.use('/v1/ordini', orderRoutes);
app.use('/v1/ingredienti', ingredientsRoutes);
app.use('/v1/tag', tagRoutes);
app.use('/v1/turni', turniRoutes);
app.use('/v1/qr', qrRoutes);
app.use('/image', express.static(path.join(__dirname, 'public/images/products')));
//app.use(reportRoutes);

// Error handling
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});


/*

admin: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NDgsInJ1b2xvIjoiYWRtaW4iLCJpYXQiOjE3NDQyNzk2ODMsImV4cCI6MTc3NTgzNzI4M30.AelK6BkvrydKSqNGuXbzWGzST4yctrHvdjy66XeoMHI"
paninaro: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTAsInJ1b2xvIjoicGFuaW5hcm8iLCJpYXQiOjE3NDQzMDc2ODgsImV4cCI6MTc3NTg2NTI4OH0.noyJJ5yLRAdZ4bxIOGdlYBjSZQElmXV4KOqGGVJHl_Q"
prof: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTEsInJ1b2xvIjoicHJvZiIsImlhdCI6MTc0NDMwNzY5NiwiZXhwIjoxNzc1ODY1Mjk2fQ.xIQOgTV14gvC77xNqLnStkyLtvi7n-ZB5lWZYY6AT80"
studente: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NDksInJ1b2xvIjoic3R1ZGVudGUiLCJpYXQiOjE3NDQzMDc3NjksImV4cCI6MTc3NTg2NTM2OX0.mdqnDVZpEotkEEXMaCj9f-rfYBx_b4WeJr97g3L6MP8"
gestore1: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZEdlc3Rpb25lIjoxLCJydW9sbyI6Imdlc3RvcmUiLCJpZCI6MTksImlhdCI6MTc0NDMwNzg0MiwiZXhwIjoxNzc1ODY1NDQyfQ.HMNTe1h81A80p-BawzVj44zSBGBVMYZRdp_vDxE2j9k"


*/

