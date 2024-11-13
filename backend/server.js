const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');

dotenv.config();

const _dirname = path.resolve();
const app = express();

// In-memory cache to store the jokes
let jokesCache = {
  data: [],
  lastUpdated: null,
  isValid: false
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(_dirname, "/frontend/dist")));

// Create MySQL connection pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'joke'
});

// Function to check if cache is valid
const isCacheValid = () => {
  return jokesCache.isValid && 
         jokesCache.lastUpdated && 
         (Date.now() - jokesCache.lastUpdated) < CACHE_DURATION;
};

// Function to update cache
const updateCache = (data) => {
  jokesCache = {
    data: data,
    lastUpdated: Date.now(),
    isValid: true
  };
};

// Function to fetch jokes from database
const fetchJokesFromDB = () => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Error getting database connection:', err);
        reject(err);
        return;
      }

      connection.query('SELECT * FROM jokes', (error, results) => {
        connection.release();
        
        if (error) {
          reject(error);
          return;
        }

        resolve(results);
      });
    });
  });
};

// Main route handler for jokes
app.get('/post', async (req, res) => {
  try {
    // First check if we have valid cached data
    if (isCacheValid()) {
      console.log('Serving from cache');
      return res.json(jokesCache.data);
    }

    // If cache is invalid or expired, try to fetch from database
    const jokes = await fetchJokesFromDB();
    updateCache(jokes);
    
    // Set cache headers
    res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.json(jokes);

  } catch (error) {
    console.error('Error fetching jokes:', error);
    
    // If database is down but we have cached data (even if expired), use it
    if (jokesCache.data.length > 0) {
      console.log('Database error, serving stale cache');
      res.set('Cache-Control', 'public, max-age=60'); // Shorter cache time for stale data
      return res.json(jokesCache.data);
    }

    // If we have no cached data, return error
    res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Please try again later'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Please try again later'
  });
});

// Catch-all route for frontend
app.get('*', (req, res) => {
  res.sendFile(path.resolve(_dirname, "frontend", "dist", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
