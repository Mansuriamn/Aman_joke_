const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');

dotenv.config();

const _dirname = path.resolve();
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(_dirname, "/frontend/dist")));

// Create MySQL connection pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Middleware to handle database errors
const handleDatabaseError = (err, req, res, next) => {
  console.error('Database error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Please try again later'
  });
};

app.get('/post', async (req, res, next) => {
  try {
    const [results] = await pool.query('SELECT * FROM jokes');

    // Set cache headers
    res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.json(results);
  } catch (error) {
    next(error);
  }
});

app.use(handleDatabaseError);

// Catch-all route for frontend
app.get('*', (req, res) => {
  res.sendFile(path.resolve(_dirname, "frontend", "dist", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
