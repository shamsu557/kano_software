const mysql = require('mysql');

const db = mysql.createConnection({
  host:     process.env.DB_HOST     || 'mysql-shamsu557.alwaysdata.net',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'shamsu557',
  password: process.env.DB_PASSWORD || '@Shamsu1440',
  database: process.env.DB_NAME     || 'shamsu557_ksrms_db',
  multipleStatements: true
});

db.connect((err) => {
  if (err) { console.error('DB connection error:', err); throw err; }
  console.log('Connected to MySQL database');
});

module.exports = db;
