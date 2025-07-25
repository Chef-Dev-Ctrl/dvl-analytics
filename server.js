const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const WebSocket = require('ws');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3002;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server on the same port
const wss = new WebSocket.Server({ server });

// Initialize SQLite database
const db = new sqlite3.Database('./analytics.db');

// Create tables if they don't exist
db.serialize(() => {
  // Performance metrics table
  db.run(`CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_url TEXT,
    load_time REAL,
    fcp REAL,
    lcp REAL,
    cls REAL,
    fid REAL,
    ttfb REAL,
    dom_ready REAL,
    device_type TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // SEO metrics table
  db.run(`CREATE TABLE IF NOT EXISTS seo_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_url TEXT,
    title TEXT,
    meta_description TEXT,
    h1_count INTEGER,
    lighthouse_score REAL,
    images_without_alt INTEGER,
    internal_links INTEGER,
    external_links INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Form submissions table
  db.run(`CREATE TABLE IF NOT EXISTS form_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_type TEXT,
    page_url TEXT,
    referrer TEXT,
    device_type TEXT,
    conversion_source TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // User analytics table
  db.run(`CREATE TABLE IF NOT EXISTS user_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    page_url TEXT,
    referrer TEXT,
    device_type TEXT,
    screen_resolution TEXT,
    user_agent TEXT,
    time_on_page INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Key validation middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validKeys = ['dvl-media-main', 'dvl-media-dev'];
  
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  
  next();
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'DVL Analytics API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'DVL Analytics API',
    status: 'online',
    endpoints: {
      health: '/api/health',
      dashboard: '/dashboard',
      tracking: '/dvl-analytics.js'
    }
  });
});

// Tracking endpoint (requires API key)
app.post('/api/track', validateApiKey, (req, res) => {
  const { type, data } = req.body;
  
  try {
    switch (type) {
      case 'performance':
        db.run(`INSERT INTO performance_metrics 
          (page_url, load_time, fcp, lcp, cls, fid, ttfb, dom_ready, device_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [data.pageUrl, data.loadTime, data.fcp, data.lcp, data.cls, data.fid, data.ttfb, data.domReady, data.deviceType]
        );
        break;
        
      case 'seo':
        db.run(`INSERT INTO seo_metrics 
          (page_url, title, meta_description, h1_count, lighthouse_score, images_without_alt, internal_links, external_links) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [data.pageUrl, data.title, data.metaDescription, data.h1Count, data.lighthouseScore, data.imagesWithoutAlt, data.internalLinks, data.externalLinks]
        );
        break;
        
      case 'form':
        db.run(`INSERT INTO form_submissions 
          (form_type, page_url, referrer, device_type, conversion_source) 
          VALUES (?, ?, ?, ?, ?)`,
          [data.formType, data.pageUrl, data.referrer, data.deviceType, data.conversionSource]
        );
        break;
        
      case 'user':
        db.run(`INSERT INTO user_analytics 
          (session_id, page_url, referrer, device_type, screen_resolution, user_agent, time_on_page) 
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [data.sessionId, data.pageUrl, data.referrer, data.deviceType, data.screenResolution, data.userAgent, data.timeOnPage]
        );
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid tracking type' });
    }
    
    res.json({ success: true, message: 'Data tracked successfully' });
  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).json({ error: 'Failed to track data' });
  }
});

// Dashboard data endpoints
app.get('/api/dashboard', (req, res) => {
  const stats = {};
  
  // Get performance stats
  db.get('SELECT COUNT(*) as total, AVG(load_time) as avg_load_time FROM performance_metrics WHERE date(timestamp) = date("now")', (err, perfRow) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    stats.performance = perfRow;
    
    // Get form submissions
    db.get('SELECT COUNT(*) as total FROM form_submissions WHERE date(timestamp) = date("now")', (err, formRow) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      stats.forms = formRow;
      
      // Get user sessions
      db.get('SELECT COUNT(DISTINCT session_id) as unique_sessions FROM user_analytics WHERE date(timestamp) = date("now")', (err, userRow) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        stats.users = userRow;
        
        res.json({
          timestamp: new Date().toISOString(),
          stats
        });
      });
    });
  });
});

app.get('/api/performance', (req, res) => {
  db.all('SELECT * FROM performance_metrics ORDER BY timestamp DESC LIMIT 100', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.get('/api/seo', (req, res) => {
  db.all('SELECT * FROM seo_metrics ORDER BY timestamp DESC LIMIT 100', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.get('/api/forms', (req, res) => {
  db.all('SELECT * FROM form_submissions ORDER BY timestamp DESC LIMIT 100', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM user_analytics ORDER BY timestamp DESC LIMIT 100', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// Web dashboard
app.get('/dashboard', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DVL Analytics Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #0a0a0a; 
            color: #ffffff; 
            padding: 20px;
        }
        .header { 
            text-align: center; 
            margin-bottom: 30px; 
            border-bottom: 2px solid #00ff88;
            padding-bottom: 20px;
        }
        .header h1 { 
            color: #00ff88; 
            font-size: 2.5em; 
            margin-bottom: 10px;
        }
        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px;
        }
        .stat-card { 
            background: #1a1a1a; 
            padding: 20px; 
            border-radius: 10px; 
            border-left: 4px solid #00ff88;
            box-shadow: 0 4px 6px rgba(0, 255, 136, 0.1);
        }
        .stat-card h3 { 
            color: #00ff88; 
            margin-bottom: 10px; 
        }
        .stat-value { 
            font-size: 2em; 
            font-weight: bold; 
            margin-bottom: 5px;
        }
        .status { 
            background: #1a1a1a; 
            padding: 20px; 
            border-radius: 10px; 
            margin-top: 20px;
            text-align: center;
        }
        .online { color: #00ff88; }
        .loading { color: #ffaa00; }
        .error { color: #ff4444; }
        .refresh-btn {
            background: #00ff88;
            color: #0a0a0a;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            margin: 20px auto;
            display: block;
        }
        .refresh-btn:hover { background: #00cc6a; }
    </style>
</head>
<body>
    <div class="header">
        <h1>DVL Analytics</h1>
        <p>Real-time Website Analytics Dashboard</p>
        <p style="color: #888;">analytics.dvlmedia.co.za</p>
    </div>
    
    <div class="stats-grid" id="statsGrid">
        <div class="stat-card">
            <h3>🚀 Performance</h3>
            <div class="stat-value" id="perfCount">Loading...</div>
            <p>Page loads today</p>
        </div>
        
        <div class="stat-card">
            <h3>📝 Forms</h3>
            <div class="stat-value" id="formCount">Loading...</div>
            <p>Submissions today</p>
        </div>
        
        <div class="stat-card">
            <h3>👥 Users</h3>
            <div class="stat-value" id="userCount">Loading...</div>
            <p>Unique sessions today</p>
        </div>
        
        <div class="stat-card">
            <h3>⚡ Avg Load Time</h3>
            <div class="stat-value" id="avgLoad">Loading...</div>
            <p>Milliseconds</p>
        </div>
    </div>
    
    <button class="refresh-btn" onclick="loadData()">Refresh Data</button>
    
    <div class="status">
        <h3>System Status</h3>
        <p id="status" class="loading">Connecting...</p>
        <p id="lastUpdate">Last updated: Never</p>
    </div>

    <script>
        async function loadData() {
            try {
                document.getElementById('status').innerHTML = '<span class="loading">Loading...</span>';
                
                const response = await fetch('/api/dashboard');
                const data = await response.json();
                
                document.getElementById('perfCount').textContent = data.stats.performance.total || 0;
                document.getElementById('formCount').textContent = data.stats.forms.total || 0;
                document.getElementById('userCount').textContent = data.stats.users.unique_sessions || 0;
                
                const avgLoad = data.stats.performance.avg_load_time;
                document.getElementById('avgLoad').textContent = avgLoad ? Math.round(avgLoad) + 'ms' : 'No data';
                
                document.getElementById('status').innerHTML = '<span class="online">● Online</span>';
                document.getElementById('lastUpdate').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
                
            } catch (error) {
                console.error('Error loading data:', error);
                document.getElementById('status').innerHTML = '<span class="error">● Connection Error</span>';
            }
        }
        
        // WebSocket connection for real-time updates
        let ws = null;
        function connectWebSocket() {
            try {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = protocol + '//' + window.location.host;
                ws = new WebSocket(wsUrl);
                
                ws.onopen = function() {
                    console.log('WebSocket connected');
                    document.getElementById('status').innerHTML = '<span class="online">● Online (Real-time)</span>';
                };
                
                ws.onmessage = function(event) {
                    console.log('Real-time update received');
                    loadData(); // Refresh data when real-time update received
                };
                
                ws.onclose = function() {
                    console.log('WebSocket disconnected');
                    document.getElementById('status').innerHTML = '<span class="error">● Disconnected</span>';
                    // Try to reconnect after 5 seconds
                    setTimeout(connectWebSocket, 5000);
                };
                
                ws.onerror = function(error) {
                    console.log('WebSocket error:', error);
                    document.getElementById('status').innerHTML = '<span class="error">● Connection Error</span>';
                };
            } catch (error) {
                console.log('WebSocket connection failed:', error);
            }
        }
        
        // Load data on page load
        loadData();
        
        // Connect WebSocket for real-time updates
        connectWebSocket();
        
        // Auto-refresh every 30 seconds as fallback
        setInterval(loadData, 30000);
    </script>
</body>
</html>
  `);
});

// Serve tracking script
app.get('/dvl-analytics.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
(function() {
    // DVL Analytics Tracking Script
    const DVL_CONFIG = window.DVL_CONFIG || {
        apiKey: 'dvl-media-main',
        apiUrl: 'https://analytics.dvlmedia.co.za/api/track',
        trackPageViews: true,
        trackPerformance: true,
        trackForms: true,
        trackUserBehavior: true
    };
    
    // Generate session ID
    let sessionId = sessionStorage.getItem('dvl_session_id');
    if (!sessionId) {
        sessionId = 'dvl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('dvl_session_id', sessionId);
    }
    
    // Device detection
    function getDeviceType() {
        const width = window.innerWidth;
        if (width <= 768) return 'mobile';
        if (width <= 1024) return 'tablet';
        return 'desktop';
    }
    
    // Send tracking data
    function sendTracking(type, data) {
        if (!DVL_CONFIG.apiKey || !DVL_CONFIG.apiUrl) return;
        
        fetch(DVL_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': DVL_CONFIG.apiKey
            },
            body: JSON.stringify({ type, data })
        }).catch(err => console.debug('DVL Analytics error:', err));
    }
    
    // Page view tracking
    if (DVL_CONFIG.trackPageViews) {
        const pageData = {
            sessionId: sessionId,
            pageUrl: window.location.href,
            referrer: document.referrer || 'direct',
            deviceType: getDeviceType(),
            screenResolution: screen.width + 'x' + screen.height,
            userAgent: navigator.userAgent
        };
        
        sendTracking('user', pageData);
    }
    
    // Performance tracking
    if (DVL_CONFIG.trackPerformance) {
        window.addEventListener('load', function() {
            setTimeout(function() {
                const perfData = performance.getEntriesByType('navigation')[0];
                if (perfData) {
                    const data = {
                        pageUrl: window.location.href,
                        loadTime: perfData.loadEventEnd - perfData.loadEventStart,
                        domReady: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
                        ttfb: perfData.responseStart - perfData.requestStart,
                        deviceType: getDeviceType()
                    };
                    
                    sendTracking('performance', data);
                }
            }, 1000);
        });
    }
    
    // Form tracking
    if (DVL_CONFIG.trackForms) {
        document.addEventListener('submit', function(e) {
            const form = e.target;
            if (form.tagName === 'FORM') {
                const formData = {
                    formType: form.name || form.id || 'unnamed',
                    pageUrl: window.location.href,
                    referrer: document.referrer || 'direct',
                    deviceType: getDeviceType(),
                    conversionSource: sessionStorage.getItem('dvl_referrer') || 'direct'
                };
                
                sendTracking('form', formData);
            }
        });
    }
    
    console.log('DVL Analytics initialized for', window.location.hostname);
})();
  `);
});

// WebSocket server for real-time updates
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    console.log('Received:', message);
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Favicon endpoint
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No content
});

// Start HTTP server
server.listen(PORT, () => {
  console.log('DVL Analytics API running on port ' + PORT);
  console.log('WebSocket server running on same port');
  console.log('Dashboard: http://localhost:' + PORT + '/dashboard');
});
