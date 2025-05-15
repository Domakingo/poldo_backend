require('dotenv').config({ path: 'secrets.env' });;

module.exports = {
    DB: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        charset: 'utf8mb4'
    }
};