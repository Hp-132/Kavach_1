const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const simulator = require('./gpsSimulator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(session({
    secret: 'kavach_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Simple Database Initialization (Local Prototype)
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Error connecting to Database:', err);
    else console.log('Connected to Local SQLite Database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT,
        phone TEXT,
        isTrusted BOOLEAN,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS location_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude REAL,
        longitude REAL,
        timestamp TEXT
    )`);
});

// --- API ROUTES ---

// 1. User Authentication
app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: 'Encryption error' });
        
        const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
        db.run(query, [name, email, hash], function(err) {
            if (err) return res.status(400).json({ error: 'Email already exists' });
            res.status(201).json({ message: 'User registered successfully' });
        });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const query = `SELECT * FROM users WHERE email = ?`;
    
    db.get(query, [email], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid email or password' });
        
        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                req.session.userId = user.id;
                req.session.userName = user.name;
                res.json({ message: 'Login successful', user: { id: user.id, name: user.name, email: user.email } });
            } else {
                res.status(401).json({ error: 'Invalid email or password' });
            }
        });
    });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

app.get('/api/auth/session', (req, res) => {
    if (req.session.userId) {
        res.json({ user: { id: req.session.userId, name: req.session.userName } });
    } else {
        res.status(401).json({ error: 'No session' });
    }
});

// 2. Location Tracking (GPS Simulation / Hardware Integration)

// GET Latest Location
app.get('/api/location', (req, res) => {
    const location = simulator.getLatestLocation();
    res.json(location);
});

// POST Hardware Location Update (ESP32 Endpoint)
app.post('/api/location', (req, res) => {
    const { deviceId, latitude, longitude, timestamp } = req.body;
    console.log(`Hardware data from ${deviceId || 'Kavach Device'}: LAT: ${latitude}, LNG: ${longitude}`);
    
    simulator.updateRealLocation(latitude, longitude);
    
    // Save to location history
    const query = `INSERT INTO location_history (latitude, longitude, timestamp) VALUES (?, ?, ?)`;
    db.run(query, [latitude, longitude, new Date().toISOString()]);
    
    res.json({ status: 'success', message: 'Coordinate updated' });
});

// GET Location History
app.get('/api/location/history', (req, res) => {
    db.all(`SELECT * FROM location_history ORDER BY id DESC LIMIT 20`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database read error' });
        res.json(rows);
    });
});

// 3. Emergency Contacts
app.get('/api/contacts', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    db.all(`SELECT * FROM contacts WHERE user_id = ?`, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

app.post('/api/contacts', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { name, phone } = req.body;
    db.run(`INSERT INTO contacts (user_id, name, phone, isTrusted) VALUES (?, ?, ?, ?)`, 
    [req.session.userId, name, phone, true], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.status(201).json({ id: this.lastID, name, phone, isTrusted: true });
    });
});

app.delete('/api/contacts/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    db.run(`DELETE FROM contacts WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ status: 'deleted' });
    });
});

// 4. SOS Emergency System (Simulation)
app.post('/api/sos/trigger', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const location = simulator.getLatestLocation();
    const mapLink = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
    
    db.all(`SELECT * FROM contacts WHERE user_id = ? AND isTrusted = 1`, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        const message = `🚨 EMERGENCY ALERT: I might be in danger! View my live location sent from my KAVACH device: ${mapLink}\nTime: ${location.timestamp}`;
        
        // Simulating the SMS alerts
        const sentLogs = rows.map(contact => ({
            contact: contact.name,
            phone: contact.phone,
            message: message,
            status: 'Delivered (Simulated)'
        }));

        res.json({
            status: 'danger',
            message: 'SOS Alerts sent!',
            location,
            logs: sentLogs
        });
    });
});

// Handle all other requests by serving the index.html for the single-page experience
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
