const mysql = require('mysql');
// const mysql = require('mysql2/promise');
const {mySQL} = require('../config');
const util = require('util');

const client = mysql.createConnection({
    host: mySQL.host,
    user: mySQL.username,
    port:mySQL.port,
    database:mySQL.database,
    password: mySQL.password
});

client.query = util.promisify(client.query).bind(client);

const connectDBClient = async () => {
    let connectedClient = new Promise((resolve, reject) => {
        client.connect((error)=>{
            if(error) return reject(error);
            return resolve(client);
        });
    });
    return connectedClient;
};

const pool = mysql.createPool({
    connectionLimit: 50,
    host: mySQL.host,
    user: mySQL.username,
    port:mySQL.port,
    database:mySQL.database,
    password: mySQL.password
});

pool.query = util.promisify(pool.query).bind(pool);

const connectionDBPool = () => {
    let connectedClient = new Promise((resolve, reject) => {
        pool.getConnection((error, connection)=>{
            if(error) return reject(error);
            connection.query = util.promisify(connection.query).bind(connection);
            return resolve(connection);
        });
    });
    return connectedClient;
};

const breakDBConnection = () => {
    client.end(function(err) {
        if (err) {
            return console.log('error:' + err.message);
        }
        console.log('Closed the database connection.');
    });
}

module.exports =  {
    connectionDBPool,
    connectDBClient,
    breakDBConnection
};