// ==========================================
// 0. ENVIRONMENT SETUP
// ==========================================
require('dotenv').config();

const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. MIDDLEWARE & SESSION SETUP
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session Middleware to remember logged-in users
app.use(session({
    secret: process.env.SESSION_SECRET || 'campuscode_super_secret_key', 
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day expiration
}));


// ==========================================
// 2. DATABASE INITIALIZATION (SQLite)
// ==========================================
const db = new sqlite3.Database('./campuscode.db', (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
    } else {
        console.log('✅ Connected to SQLite database.');
        
        db.serialize(() => {
            // Users Table (Updated with 'status' column)
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                fullName TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                collegeName TEXT,
                status TEXT DEFAULT 'active'
            )`);

            // OTPs Table
            db.run(`CREATE TABLE IF NOT EXISTS otps (
                email TEXT PRIMARY KEY,
                code TEXT NOT NULL,
                expiry INTEGER NOT NULL
            )`);

            // Colleges Table (Managed by Superadmin)
            db.run(`CREATE TABLE IF NOT EXISTS colleges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                status TEXT DEFAULT 'active',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Insert Default Superadmin Account (Run once)
            db.run(`INSERT OR IGNORE INTO users (role, fullName, email, password, status) 
                    VALUES ('superadmin', 'Platform Admin', 'super@campuscode.com', 'super123', 'active')`);
        });
    }
});

// ==========================================
// 3. EMAIL CONFIGURATION (Nodemailer)
// ==========================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  
    }
});

const authRoutes = require('./routes/auth')(db, transporter);
app.use('/auth', authRoutes);

// ==========================================
// 4. ROLE-BASED ACCESS MIDDLEWARE
// ==========================================
function requireRole(role) {
    return (req, res, next) => {
        const isApiRoute = req.originalUrl.startsWith('/api');

        // 1. Check if user is logged in
        if (!req.session.user) {
            if (isApiRoute) {
                return res.status(401).json({ success: false, error: 'Not logged in. Please log in again.' });
            }
            return res.redirect('/'); 
        }

        // 2. Check if user has the correct role
        if (req.session.user.role !== role) {
            if (isApiRoute) {
                return res.status(403).json({ success: false, error: 'Access Denied. Insufficient permissions.' });
            }
            return res.status(403).send('<h2>Access Denied</h2><p>You do not have permission to view this page.</p><a href="/">Go Home</a>');
        }

        next();
    };
}

// ==========================================
// 5. HTML PAGE ROUTES
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/college-register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'college-register.html')));

// Protected Dashboards
app.get('/superadmin-dashboard', requireRole('superadmin'), (req, res) => res.sendFile(path.join(__dirname, 'views', 'superadmin-dashboard.html')));
app.get('/college-dashboard', requireRole('admin'), (req, res) => res.sendFile(path.join(__dirname, 'views', 'college-dashboard.html')));
app.get('/faculty-dashboard', requireRole('faculty'), (req, res) => res.sendFile(path.join(__dirname, 'views', 'faculty-dashboard.html')));
app.get('/student-dashboard', requireRole('student'), (req, res) => res.sendFile(path.join(__dirname, 'views', 'student-dashboard.html')));

// ==========================================
// 6. AUTHENTICATION (Login, Signup, Logout)
// ==========================================
app.post('/auth/signup', (req, res) => {
    const { name, email, password, collegeName, role } = req.body;
    
    // Default to student if no role is provided. If faculty, set status to pending.
    const userRole = role || 'student';
    const status = userRole === 'faculty' ? 'pending' : 'active';

    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
        if (err) return res.status(500).send('Database error.');
        if (row) return res.status(400).send('User already exists. <a href="/">Go back</a>');

        db.run(`INSERT INTO users (role, fullName, email, password, collegeName, status) VALUES (?, ?, ?, ?, ?, ?)`, 
            [userRole, name, email, password, collegeName, status], 
            function(err) {
                if (err) return res.status(500).send('Failed to register user.');
                
                if (userRole === 'faculty') {
                    res.send(`
                        <div style="text-align: center; margin-top: 10vh; font-family: sans-serif; background: #f8fafc; padding: 40px; border-radius: 12px; max-width: 500px; margin: auto;">
                            <h2 style="color: #1E4A7A;">Registration Successful!</h2>
                            <p style="color: #475569;">Your faculty account has been created and is <b>pending approval</b> from your College Administrator.</p>
                            <br>
                            <a href="/" style="padding: 10px 20px; background: #1E4A7A; color: white; text-decoration: none; border-radius: 5px;">Return to Home</a>
                        </div>
                    `);
                } else {
                    // Students are automatically active
                    req.session.user = { id: this.lastID, role: userRole, email: email, name: name, collegeName: collegeName };
                    res.redirect('/student-dashboard');
                }
            }
        );
    });
});

app.post('/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE email = ? AND password = ?`, [email, password], (err, user) => {
        if (err) return res.status(500).send('Database error.');
        if (!user) return res.status(401).send(`<h2>Invalid credentials.</h2><a href="/">Try again</a>`);

        // Check if faculty is still pending
        if (user.status === 'pending') {
            return res.send(`
                <div style="text-align: center; margin-top: 10vh; font-family: sans-serif; background: #f8fafc; padding: 40px; border-radius: 12px; max-width: 500px; margin: auto;">
                    <h2 style="color: #b45309;">Account Pending Approval</h2>
                    <p style="color: #475569;">Your faculty account is still waiting for verification from the College Admin. Please check back later.</p>
                    <br>
                    <a href="/" style="padding: 10px 20px; background: #1E4A7A; color: white; text-decoration: none; border-radius: 5px;">Return to Home</a>
                </div>
            `);
        }

        // Save user data to session
        req.session.user = { id: user.id, role: user.role, email: user.email, name: user.fullName, collegeName: user.collegeName };
        
        // Role-based redirect
        if (user.role === 'superadmin') {
            res.redirect('/superadmin-dashboard');
        } else if (user.role === 'admin') {
            res.redirect('/college-dashboard');
        } else if (user.role === 'faculty') {
            res.redirect('/faculty-dashboard');
        } else if (user.role === 'student') {
            res.redirect('/student-dashboard');
        } else {
            res.redirect('/');
        }
    });
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ==========================================
// 7. SUPERADMIN APIs (Manage Colleges)
// ==========================================
app.get('/api/superadmin/colleges', requireRole('superadmin'), (req, res) => {
    db.all(`SELECT * FROM colleges ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, colleges: rows });
    });
});

app.post('/api/superadmin/colleges', requireRole('superadmin'), (req, res) => {
    const { name } = req.body;
    db.run(`INSERT INTO colleges (name) VALUES (?)`, [name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ success: false, error: 'College already exists' });
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, id: this.lastID, message: 'College added successfully' });
    });
});

app.delete('/api/superadmin/colleges/:id', requireRole('superadmin'), (req, res) => {
    db.run(`DELETE FROM colleges WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: 'College deleted successfully' });
    });
});

// PUBLIC API (For Dropdowns in Signup Forms)
app.get('/api/public/colleges', (req, res) => {
    db.all(`SELECT id, name FROM colleges WHERE status = 'active' ORDER BY name ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, colleges: rows });
    });
});

// ==========================================
// 8. ADMIN DASHBOARD APIs (Manage Users & Approvals)
// ==========================================

// --- Pending Faculty Approvals ---
app.get('/api/college/pending-faculty', requireRole('admin'), (req, res) => {
    db.all(`SELECT id, fullName, email FROM users WHERE collegeName = ? AND role = 'faculty' AND status = 'pending'`, 
    [req.session.user.collegeName], 
    (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, pending: rows });
    });
});

app.post('/api/college/approve-faculty/:id', requireRole('admin'), (req, res) => {
    db.run(`UPDATE users SET status = 'active' WHERE id = ? AND collegeName = ? AND role = 'faculty'`, 
    [req.params.id, req.session.user.collegeName], 
    function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// --- Standard CRUD for Active Users ---
app.get('/api/admin/users', requireRole('admin'), (req, res) => {
    const collegeName = req.session.user.collegeName;
    db.all(`SELECT id, role, fullName, email FROM users WHERE role IN ('student', 'faculty') AND status = 'active' AND collegeName = ? ORDER BY role ASC, id DESC`, [collegeName], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: rows });
    });
});

app.post('/api/admin/users', requireRole('admin'), (req, res) => {
    const { role, fullName, email, password } = req.body;
    const collegeName = req.session.user.collegeName;
    db.run(`INSERT INTO users (role, fullName, email, password, collegeName, status) VALUES (?, ?, ?, ?, ?, 'active')`, 
        [role, fullName, email, password, collegeName], 
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, id: this.lastID, message: 'User added successfully' });
        });
});

app.put('/api/admin/users/:id', requireRole('admin'), (req, res) => {
    const { fullName, email, role, password } = req.body;
    if (password) {
        db.run(`UPDATE users SET fullName = ?, email = ?, role = ?, password = ? WHERE id = ?`, 
            [fullName, email, role, password, req.params.id], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, message: 'User updated successfully' });
            });
    } else {
        db.run(`UPDATE users SET fullName = ?, email = ?, role = ? WHERE id = ?`, 
            [fullName, email, role, req.params.id], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, message: 'User updated successfully' });
            });
    }
});

app.delete('/api/admin/users/:id', requireRole('admin'), (req, res) => {
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: 'User deleted successfully' });
    });
});

// ==========================================
// 9. OTP & INSTITUTION REGISTRATION (Admin creation)
// ==========================================
app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000; 
    
    db.run(`INSERT INTO otps (email, code, expiry) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET code=excluded.code, expiry=excluded.expiry`, 
        [email, otp, expiry], 
        async (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Database error saving OTP.' });
            try {
                await transporter.sendMail({
                    from: `"CampusCode Security" <${process.env.EMAIL_USER}>`, 
                    to: email,
                    subject: 'Verify your CampusCode Institution Account',
                    html: `<h2>Welcome!</h2><p>Your OTP for admin registration is: <b>${otp}</b></p>`
                });
                res.json({ success: true, message: 'OTP sent successfully!' });
            } catch (error) {
                res.status(500).json({ success: false, message: 'Failed to send OTP.' });
            }
        }
    );
});

app.post('/auth/register-institution', (req, res) => {
    const { role, fullName, collegeName, email, otp, password } = req.body;

    db.get(`SELECT * FROM otps WHERE email = ?`, [email], (err, row) => {
        if (err || !row || Date.now() > row.expiry || row.code !== otp) {
            return res.status(400).send('<h3>Invalid or Expired OTP.</h3><a href="/college-register">Try again</a>');
        }

        db.run(`INSERT INTO users (role, fullName, email, password, collegeName, status) VALUES (?, ?, ?, ?, ?, 'active')`,
            ['admin', fullName, email, password, collegeName],
            function(err) {
                if (err) return res.status(500).send('Registration failed. Email might exist.');

                db.run(`DELETE FROM otps WHERE email = ?`, [email]);
                
                // Automatically log the admin in
                req.session.user = { id: this.lastID, role: 'admin', email: email, name: fullName, collegeName: collegeName };
                res.redirect('/college-dashboard');
            }
        );
    });
});

// ==========================================
// 10. START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`👉 SuperAdmin Login: super@campuscode.com / super123`);
});