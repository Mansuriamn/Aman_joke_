// const express = require('express');
// const cors = require('cors');
// const dotenv = require('dotenv');
// const path = require('path');
// const mysql = require('mysql');

// dotenv.config();

// const _dirname = path.resolve();
// const app = express();

// // In-memory cache to store the jokes
// let jokesCache = {
//   data: [],
//   lastUpdated: null,
//   isValid: false
// };

// // Cache duration in milliseconds (5 minutes)
// const CACHE_DURATION = 5 * 60 * 1000;

// app.use(express.json());
// app.use(cors());
// app.use(express.static(path.join(_dirname, "/frontend/dist")));

// // Create MySQL connection pool
// const pool = mysql.createPool({
//   connectionLimit: 10,
//   host: process.env.DB_HOST || 'localhost',
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASSWORD || 'root',
//   database: process.env.DB_NAME || 'joke'
// });

// // Function to check if cache is valid
// const isCacheValid = () => {
//   return jokesCache.isValid && 
//          jokesCache.lastUpdated && 
//          (Date.now() - jokesCache.lastUpdated) < CACHE_DURATION;
// };

// // Function to update cache
// const updateCache = (data) => {
//   jokesCache = {
//     data: data,
//     lastUpdated: Date.now(),
//     isValid: true
//   };
// };

// // Function to fetch jokes from database
// const fetchJokesFromDB = () => {
//   return new Promise((resolve, reject) => {
//     pool.getConnection((err, connection) => {
//       if (err) {
//         console.error('Error getting database connection:', err);
//         reject(err);
//         return;
//       }

//       connection.query('SELECT * FROM jokes', (error, results) => {
//         connection.release();
        
//         if (error) {
//           reject(error);
//           return;
//         }

//         resolve(results);
//       });
//     });
//   });
// };

// // Main route handler for jokes
// app.get('/post', async (req, res) => {
//   try {
//     // First check if we have valid cached data
//     if (isCacheValid()) {
//       console.log('Serving from cache');
//       return res.json(jokesCache.data);
//     }

//     // If cache is invalid or expired, try to fetch from database
//     const jokes = await fetchJokesFromDB();
//     updateCache(jokes);
    
//     // Set cache headers
//     res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
//     res.json(jokes);

//   } catch (error) {
//     console.error('Error fetching jokes:', error);
    
//     // If database is down but we have cached data (even if expired), use it
//     if (jokesCache.data.length > 0) {
//       console.log('Database error, serving stale cache');
//       res.set('Cache-Control', 'public, max-age=60'); // Shorter cache time for stale data
//       return res.json(jokesCache.data);
//     }

//     // If we have no cached data, return error
//     res.status(503).json({
//       error: 'Service temporarily unavailable',
//       message: 'Please try again later'
//     });
//   }
// });

// // Error handling middleware
// app.use((err, req, res, next) => {
//   console.error('Server error:', err);
//   res.status(500).json({
//     error: 'Internal server error',
//     message: 'Please try again later'
//   });
// });

// // Catch-all route for frontend
// app.get('*', (req, res) => {
//   res.sendFile(path.resolve(_dirname, "frontend", "dist", "index.html"));
// });

// const port = process.env.PORT || 3000;
// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });



const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');
const compression = require('compression');

dotenv.config();

const _dirname = path.resolve();
const app = express();

// In-memory cache with separate mobile and desktop versions
let jokesCache = {
  mobile: {
    data: [],
    lastUpdated: null,
    isValid: false
  },
  desktop: {
    data: [],
    lastUpdated: null,
    isValid: false
  }
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(compression()); // Compress responses
app.use(express.static(path.join(_dirname, "/frontend/dist"), {
  maxAge: '1h' // Cache static files for 1 hour
}));

// Create MySQL connection pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'joke',
  connectTimeout: 10000, // 10 second timeout
  waitForConnections: true,
  queueLimit: 0
});

// Function to check if cache is valid
const isCacheValid = (deviceType) => {
  return jokesCache[deviceType].isValid && 
         jokesCache[deviceType].lastUpdated && 
         (Date.now() - jokesCache[deviceType].lastUpdated) < CACHE_DURATION;
};

// Function to update cache
const updateCache = (data, deviceType) => {
  jokesCache[deviceType] = {
    data: data,
    lastUpdated: Date.now(),
    isValid: true
  };
};

// Function to optimize data for mobile
const optimizeForMobile = (jokes) => {
  return jokes.map(joke => ({
    id: joke.id,
    title: joke.title,
    content: joke.content.substring(0, 100) + (joke.content.length > 100 ? '...' : ''),
    timestamp: joke.timestamp
  }));
};

// Function to detect mobile devices using user agent
const isMobileDevice = (userAgent) => {
  return /Mobile|iP(hone|od|ad)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i.test(userAgent);
};

// Function to fetch jokes from database
const fetchJokesFromDB = async (limit = null) => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Error getting database connection:', err);
        reject(err);
        return;
      }

      let query = 'SELECT * FROM jokes';
      if (limit) {
        query += ` LIMIT ${limit}`;
      }

      connection.query(query, (error, results) => {
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

// Main route handler for jokes with device detection
app.get('/post', async (req, res) => {
  const deviceType = isMobileDevice(req.headers['user-agent']) ? 'mobile' : 'desktop';
  const page = parseInt(req.query.page) || 1;
  const limit = deviceType === 'mobile' ? 10 : 20; // Fewer items for mobile
  
  try {
    // Check for valid cached data
    if (isCacheValid(deviceType)) {
      console.log(`Serving from ${deviceType} cache`);
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginatedData = jokesCache[deviceType].data.slice(start, end);
      
      return res.json({
        data: paginatedData,
        page,
        totalPages: Math.ceil(jokesCache[deviceType].data.length / limit)
      });
    }

    // Fetch from database
    let jokes = await fetchJokesFromDB();

    // Optimize data based on device type
    if (deviceType === 'mobile') {
      jokes = optimizeForMobile(jokes);
    }

    // Update cache
    updateCache(jokes, deviceType);
    
    // Implement pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedData = jokes.slice(start, end);

    // Set cache headers
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      data: paginatedData,
      page,
      totalPages: Math.ceil(jokes.length / limit)
    });

  } catch (error) {
    console.error('Error fetching jokes:', error);
    
    // Serve stale cache if available
    if (jokesCache[deviceType].data.length > 0) {
      console.log(`Database error, serving stale ${deviceType} cache`);
      res.set('Cache-Control', 'public, max-age=60');
      const start = (page - 1) * limit;
      const end = start + limit;
      return res.json({
        data: jokesCache[deviceType].data.slice(start, end),
        page,
        totalPages: Math.ceil(jokesCache[deviceType].data.length / limit),
        fromStaleCache: true
      });
    }

    res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Please try again later'
    });
  }
});

// API health check endpoint
app.get('/health', (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) {
      return res.status(500).json({
        status: 'error',
        message: 'Database connection failed',
        timestamp: new Date().toISOString()
      });
    }
    
    connection.release();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Please try again later',
    timestamp: new Date().toISOString()
  });
});

// Catch-all route for frontend
app.get('*', (req, res) => {
  res.sendFile(path.resolve(_dirname, "frontend", "dist", "index.html"));
});

// Explicitly set port for Render.com
const port = process.env.PORT || 3000;

// Start server and listen on all network interfaces
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Server is listening on http://localhost:${port}`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});
