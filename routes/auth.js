const express = require('express');

module.exports = (db, transporter) => {
    const router = express.Router();

    // ==========================================
    // 1. SEND OTP FOR STUDENT/FACULTY SIGNUP
    // ==========================================
    router.post('/send-signup-otp', (req, res) => {
        const { email } = req.body;
        
        if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

        // First, check if the email is already registered
        db.get(`SELECT email FROM users WHERE email = ?`, [email], async (err, row) => {
            if (err) return res.status(500).json({ success: false, message: 'Database error.' });
            if (row) return res.status(400).json({ success: false, message: 'Email is already registered.' });

            // Generate a 6-digit OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
            
            db.run(`INSERT INTO otps (email, code, expiry) VALUES (?, ?, ?) 
                    ON CONFLICT(email) DO UPDATE SET code=excluded.code, expiry=excluded.expiry`, 
                [email, otp, expiry], 
                async (err) => {
                    if (err) return res.status(500).json({ success: false, message: 'Database error saving OTP.' });
                    
                    try {
                        await transporter.sendMail({
                            from: `"CampusCode Security" <${process.env.EMAIL_USER}>`, 
                            to: email,
                            subject: 'Verify your CampusCode Account',
                            html: `
                                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                                    <h2>Welcome to CampusCode!</h2>
                                    <p>Your One-Time Password (OTP) to verify your email is:</p>
                                    <h1 style="color: #1E4A7A; letter-spacing: 5px; background: #f4f4f4; padding: 10px; display: inline-block; border-radius: 5px;">${otp}</h1>
                                    <p>This code is valid for 10 minutes. Do not share it with anyone.</p>
                                </div>
                            `
                        });
                        res.json({ success: true, message: 'OTP sent successfully!' });
                    } catch (error) {
                        console.error("Email Error:", error);
                        res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
                    }
                }
            );
        });
    });

    // ==========================================
    // 2. USER SIGN UP (With OTP Verification)
    // ==========================================
    router.post('/signup', (req, res) => {
        const { name, email, password, collegeName, role, otp } = req.body;
        
        const userRole = role || 'student';
        const status = userRole === 'faculty' ? 'pending' : 'active';

        // Verify the OTP first
        db.get(`SELECT * FROM otps WHERE email = ?`, [email], (err, row) => {
            if (err || !row || Date.now() > row.expiry || row.code !== otp) {
                return res.status(400).send(`
                    <div style="text-align: center; margin-top: 10vh; font-family: sans-serif;">
                        <h2 style="color: red;">Invalid or Expired OTP.</h2>
                        <p>Please try signing up again.</p>
                        <a href="/">Go back</a>
                    </div>
                `);
            }

            // OTP is valid, insert the user
            db.run(`INSERT INTO users (role, fullName, email, password, collegeName, status) VALUES (?, ?, ?, ?, ?, ?)`, 
                [userRole, name, email, password, collegeName, status], 
                function(err) {
                    if (err) return res.status(500).send('Failed to register user. Email might already exist.');
                    
                    // Delete the used OTP
                    db.run(`DELETE FROM otps WHERE email = ?`, [email]);
                    
                    if (userRole === 'faculty') {
                        res.send(`
                            <div style="text-align: center; margin-top: 10vh; font-family: sans-serif; background: #f8fafc; padding: 40px; border-radius: 12px; max-width: 500px; margin: auto;">
                                <h2 style="color: #1E4A7A;">Registration Successful!</h2>
                                <p style="color: #475569;">Your faculty account has been verified and is <b>pending approval</b> from your College Administrator.</p>
                                <br>
                                <a href="/" style="padding: 10px 20px; background: #1E4A7A; color: white; text-decoration: none; border-radius: 5px;">Return to Home</a>
                            </div>
                        `);
                    } else {
                        // Students are active immediately
                        req.session.user = { id: this.lastID, role: userRole, email: email, name: name, collegeName: collegeName };
                        res.redirect('/student-dashboard');
                    }
                }
            );
        });
    });

    // ==========================================
    // 3. USER LOG IN
    // ==========================================
    router.post('/login', (req, res) => {
        const { email, password } = req.body;
        
        db.get(`SELECT * FROM users WHERE email = ? AND password = ?`, [email, password], (err, user) => {
            if (err) return res.status(500).send('Database error.');
            if (!user) return res.status(401).send(`<h2>Invalid credentials.</h2><a href="/">Try again</a>`);

            if (user.status === 'pending') {
                return res.send(`
                    <div style="text-align: center; margin-top: 10vh; font-family: sans-serif; background: #f8fafc; padding: 40px; border-radius: 12px; max-width: 500px; margin: auto;">
                        <h2 style="color: #b45309;">Account Pending Approval</h2>
                        <p style="color: #475569;">Your faculty account is still waiting for verification from the College Admin.</p>
                        <br>
                        <a href="/" style="padding: 10px 20px; background: #1E4A7A; color: white; text-decoration: none; border-radius: 5px;">Return to Home</a>
                    </div>
                `);
            }

            req.session.user = { id: user.id, role: user.role, email: user.email, name: user.fullName, collegeName: user.collegeName };
            
            if (user.role === 'superadmin') res.redirect('/superadmin-dashboard');
            else if (user.role === 'admin') res.redirect('/college-dashboard');
            else if (user.role === 'faculty') res.redirect('/faculty-dashboard');
            else if (user.role === 'student') res.redirect('/student-dashboard');
            else res.redirect('/');
        });
    });

    // ==========================================
    // 4. LOG OUT
    // ==========================================
    router.get('/logout', (req, res) => {
        req.session.destroy();
        res.redirect('/');
    });

    // ==========================================
    // 5. INSTITUTION REGISTRATION (OTP Verification)
    // ==========================================
    router.post('/register-institution', (req, res) => {
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
                    
                    req.session.user = { id: this.lastID, role: 'admin', email: email, name: fullName, collegeName: collegeName };
                    res.redirect('/college-dashboard');
                }
            );
        });
    });

    return router;
};