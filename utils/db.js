const mysql = require('mysql2/promise');
const { DB } = require('../config/config');


const pool = mysql.createPool(DB);
module.exports = pool;

/*
database structure

CREATE TABLE Classe (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                         uni varCHAR(3) NOT NULL UNIQUE
);

CREATE TABLE Utente (
                        idUtente INT AUTO_INCREMENT PRIMARY KEY,
                        mail VARCHAR(50) NOT NULL UNIQUE,
                        classe int not null,
                        bannato BOOLEAN NOT NULL DEFAULT false,
                        google_id VARCHAR(50) NOT NULL UNIQUE,
                        foto_url VARCHAR(255) UNIQUE,
                        ruolo ENUM('admin', 'terminale', 'prof', 'segreteria', 'paninaro', 'studente') NOT NULL,
                        FOREIGN KEY (classe) REFERENCES Classe(id)
);

CREATE TABLE Turno (
                       n INT,
                       giorno enum('lun', 'mar', 'mer', 'gio', 'ven', 'sab') NOT NULL,
                       oraInizioOrdine TIME NOT NULL,
                       oraFineOrdine TIME NOT NULL,
                       oraInizioRitiro TIME NOT NULL,
                       oraFineRitiro TIME NOT NULL,
                       PRIMARY KEY(n, giorno)
);

CREATE TABLE OrdineClasse (
                              idOrdine INT AUTO_INCREMENT PRIMARY KEY,
                              idResponsabile INT NOT NULL,
                              data DATE NOT NULL,
                              nTurno INT NOT NULL,
                              giorno enum('lun', 'mar', 'mer', 'gio', 'ven', 'sab') NOT NULL,
                              lastUpdate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                              confermato BOOLEAN NOT NULL DEFAULT false,
                              preparato BOOLEAN NOT NULL DEFAULT false,
                              oraRitiro TIME,
                              classe int NOT NULL,
                              FOREIGN KEY (nTurno, giorno) REFERENCES Turno(n, giorno),
                              FOREIGN KEY (idResponsabile) REFERENCES Utente(idUtente),
                              FOREIGN KEY (classe) REFERENCES Classe(id),
                              UNIQUE(data, nTurno, giorno, classe)
);

CREATE TABLE OrdineSingolo (
                               idOrdine INT AUTO_INCREMENT PRIMARY KEY,
                               data DATE NOT NULL,
                               nTurno INT NOT NULL,
                               giorno enum('lun', 'mar', 'mer', 'gio', 'ven', 'sab') NOT NULL,
                               confermato BOOLEAN NOT NULL DEFAULT true,
                               lastUpdate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                               user INT NOT NULL,
                               idOrdineClasse INT,
                               FOREIGN KEY (nTurno, giorno) REFERENCES Turno(n, giorno),
                               FOREIGN KEY (user) REFERENCES Utente(idUtente),
                               FOREIGN KEY (idOrdineClasse) REFERENCES OrdineClasse(idOrdine),
                               UNIQUE(data, nTurno, giorno, user)
);


CREATE TABLE Gestione (
                          idGestione INT AUTO_INCREMENT PRIMARY KEY,
                          nome VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE Prodotto (
                          idProdotto INT AUTO_INCREMENT PRIMARY KEY,
                          nome VARCHAR(100) NOT NULL UNIQUE,
                          prezzo DECIMAL(5,2) NOT NULL,
                          quantita INT NOT NULL,
                          img VARCHAR(255),
                          descrizione VARCHAR(100) NOT NULL,
                          temporaneo BOOLEAN NOT NULL DEFAULT false,
                          disponibilita INT NOT NULL DEFAULT 0,
                          attivo BOOLEAN NOT NULL DEFAULT true,
                          eliminato BOOLEAN NOT NULL DEFAULT false,
                          proprietario INT NOT NULL,
                          lastUpdate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                          FOREIGN KEY (proprietario) REFERENCES Gestione(idGestione)
);

CREATE TABLE Tag (
                    nome VARCHAR(20) PRIMARY KEY
);

CREATE TABLE Ingrediente (
                            nome VARCHAR(20) PRIMARY KEY
);

CREATE TABLE DettagliOrdineSingolo (
                                       id INT AUTO_INCREMENT PRIMARY KEY,
                                       idOrdineSingolo INT NOT NULL,
                                       idProdotto INT NOT NULL,
                                       quantita INT NOT NULL,
                                       preparato BOOLEAN NOT NULL DEFAULT false,
                                       FOREIGN KEY (idOrdineSingolo) REFERENCES OrdineSingolo(idOrdine),
                                       FOREIGN KEY (idProdotto) REFERENCES Prodotto(idProdotto)
);


CREATE TABLE ProdottoTag (
                             idProdotto INT,
                             tag VARCHAR(20),
                             FOREIGN KEY (idProdotto) REFERENCES Prodotto(idProdotto),
                             FOREIGN KEY (tag) REFERENCES Tag(nome),
                             PRIMARY KEY(idProdotto, tag)
);

CREATE TABLE ProdottoIngrediente (
                                     idProdotto INT,
                                     ingrediente VARCHAR(20),
                                     FOREIGN KEY (idProdotto) REFERENCES Prodotto(idProdotto),
                                     FOREIGN KEY (ingrediente) REFERENCES Ingrediente(nome),
                                     PRIMARY KEY(idProdotto, ingrediente)
);

CREATE TABLE QrCode (
                        token CHAR(32) PRIMARY KEY,
                        idOrdineClasse INT,
                        gestore INT NOT NULL,
                        ritirato BOOLEAN NOT NULL DEFAULT false,
                        FOREIGN KEY (idOrdineClasse) REFERENCES OrdineClasse(idOrdine),
                        FOREIGN KEY (gestore) REFERENCES Gestione(idGestione)
);

CREATE TABLE Preferiti (
                           idProdotto INT,
                           idUser INT NOT NULL,
                           FOREIGN KEY (idProdotto) REFERENCES Prodotto(idProdotto),
                           FOREIGN KEY (idUser) REFERENCES Utente(idUtente),
                           PRIMARY KEY(idProdotto, idUser)
);

CREATE TABLE UtenteGestione (
                                idUtenteGestione INT AUTO_INCREMENT PRIMARY KEY,
                                utenteId INT NOT NULL UNIQUE,
                                username VARCHAR(255) NOT NULL,
                                password VARCHAR(255) NOT NULL,
                                idGestione INT NOT NULL,
                                FOREIGN KEY (utenteId) REFERENCES Utente(idUtente),
                                FOREIGN KEY (idGestione) REFERENCES Gestione(idGestione)
                                );




*/