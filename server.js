// Main server file for the Integrated Management System.
// This project uses simple Express routes and MySQL queries for learning.
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'integrated_management_system',
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'student-project-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
    if (!req.session.user) return res.status(401).json({ message: 'Please sign in first.' });
    next();
}

function requireOwner(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'Owner') {
        return res.status(403).json({ message: 'Only the Owner can access this page.' });
    }
    next();
}

async function logActivity(userId, message) {
    await db.execute('INSERT INTO activity_logs (user_id, activity) VALUES (?, ?)', [userId || null, message]);
}

// SIGN UP: the first registered account becomes the Owner.
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        if (!fullName || !email || !password) return res.status(400).json({ message: 'Please complete all fields.' });
        if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });

        const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
        if (existing.length) return res.status(409).json({ message: 'That email is already registered.' });

        const [countRows] = await db.execute('SELECT COUNT(*) AS total FROM users');
        const role = countRows[0].total === 0 ? 'Owner' : 'Staff';
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
            [fullName.trim(), email.trim().toLowerCase(), hashedPassword, role]
        );
        req.session.user = { id: result.insertId, fullName: fullName.trim(), email: email.trim().toLowerCase(), role };
        await logActivity(result.insertId, 'Created an account');
        res.status(201).json({ message: `Account created. Your role is ${role}.`, user: req.session.user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Could not create account. Check your database connection.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [(email || '').trim().toLowerCase()]);
        if (!rows.length) return res.status(401).json({ message: 'Incorrect email or password.' });
        const validPassword = await bcrypt.compare(password || '', rows[0].password);
        if (!validPassword) return res.status(401).json({ message: 'Incorrect email or password.' });
        req.session.user = { id: rows[0].id, fullName: rows[0].full_name, email: rows[0].email, role: rows[0].role };
        await logActivity(rows[0].id, 'Signed in');
        res.json({ message: 'Welcome back!', user: req.session.user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Could not sign in. Check your database connection.' });
    }
});

app.post('/api/auth/logout', requireLogin, async (req, res) => {
    const userId = req.session.user.id;
    await logActivity(userId, 'Signed out');
    req.session.destroy(() => res.json({ message: 'Signed out successfully.' }));
});

app.get('/api/auth/me', (req, res) => res.json({ user: req.session.user || null }));

// DASHBOARD SUMMARY
app.get('/api/dashboard', requireLogin, async (req, res) => {
    try {
        const [[booking]] = await db.execute("SELECT COUNT(*) AS total FROM reservations WHERE status = 'Confirmed'");
        const [[sales]] = await db.execute('SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE DATE(created_at) = CURDATE()');
        const [[stock]] = await db.execute('SELECT COUNT(*) AS total FROM inventory');
        const [[low]] = await db.execute('SELECT COUNT(*) AS total FROM inventory WHERE quantity <= low_stock_level');
        const [activities] = await db.execute(
            'SELECT activity, created_at FROM activity_logs ORDER BY id DESC LIMIT 8'
        );
        res.json({ reservations: booking.total, salesToday: sales.total, inventoryItems: stock.total, lowStock: low.total, activities });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Could not load dashboard.' }); }
});

// RESERVATIONS
app.get('/api/reservations', requireLogin, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM reservations ORDER BY booking_date DESC, booking_time DESC');
    res.json(rows);
});

app.post('/api/reservations', requireLogin, async (req, res) => {
    try {
        const { customerName, bookingDate, bookingTime, guestCount, depositAmount, paymentStatus } = req.body;
        if (!customerName || !bookingDate || !bookingTime || Number(guestCount) < 1) return res.status(400).json({ message: 'Please complete the reservation details.' });
        const [conflicts] = await db.execute(
            "SELECT id FROM reservations WHERE booking_date = ? AND booking_time = ? AND status = 'Confirmed'",
            [bookingDate, bookingTime]
        );
        if (conflicts.length) return res.status(409).json({ message: 'That date and time are already booked. Please choose another slot.' });
        const [result] = await db.execute(
            'INSERT INTO reservations (customer_name, booking_date, booking_time, guest_count, deposit_amount, payment_status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [customerName.trim(), bookingDate, bookingTime, Number(guestCount), Number(depositAmount || 0), paymentStatus || 'Unpaid', req.session.user.id]
        );
        await logActivity(req.session.user.id, `Added reservation #${result.insertId}`);
        res.status(201).json({ message: 'Reservation added.' });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Could not save reservation.' }); }
});

app.put('/api/reservations/:id', requireLogin, async (req, res) => {
    try {
        const { customerName, bookingDate, bookingTime, guestCount, depositAmount, paymentStatus } = req.body;
        const [conflicts] = await db.execute(
            "SELECT id FROM reservations WHERE booking_date = ? AND booking_time = ? AND status = 'Confirmed' AND id <> ?",
            [bookingDate, bookingTime, req.params.id]
        );
        if (conflicts.length) return res.status(409).json({ message: 'That date and time are already booked.' });
        await db.execute(
            'UPDATE reservations SET customer_name=?, booking_date=?, booking_time=?, guest_count=?, deposit_amount=?, payment_status=? WHERE id=?',
            [customerName, bookingDate, bookingTime, Number(guestCount), Number(depositAmount), paymentStatus, req.params.id]
        );
        await logActivity(req.session.user.id, `Updated reservation #${req.params.id}`);
        res.json({ message: 'Reservation updated.' });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Could not update reservation.' }); }
});

app.patch('/api/reservations/:id/cancel', requireLogin, async (req, res) => {
    await db.execute("UPDATE reservations SET status='Cancelled' WHERE id=?", [req.params.id]);
    await logActivity(req.session.user.id, `Cancelled reservation #${req.params.id}`);
    res.json({ message: 'Reservation cancelled.' });
});

// INVENTORY
app.get('/api/inventory', requireLogin, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM inventory ORDER BY item_name');
    res.json(rows);
});

app.post('/api/inventory', requireLogin, async (req, res) => {
    try {
        const { itemName, quantity, lowStockLevel } = req.body;
        if (!itemName || Number(quantity) < 0 || Number(lowStockLevel) < 0) return res.status(400).json({ message: 'Enter valid inventory details.' });
        await db.execute('INSERT INTO inventory (item_name, quantity, low_stock_level) VALUES (?, ?, ?)', [itemName.trim(), Number(quantity), Number(lowStockLevel)]);
        await logActivity(req.session.user.id, `Added inventory item: ${itemName.trim()}`);
        res.status(201).json({ message: 'Inventory item added.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That inventory item already exists.' });
        console.error(error); res.status(500).json({ message: 'Could not add inventory item.' });
    }
});

app.put('/api/inventory/:id', requireLogin, async (req, res) => {
    const { itemName, quantity, lowStockLevel } = req.body;
    try {
        await db.execute('UPDATE inventory SET item_name=?, quantity=?, low_stock_level=? WHERE id=?', [itemName.trim(), Number(quantity), Number(lowStockLevel), req.params.id]);
        await logActivity(req.session.user.id, `Updated inventory item #${req.params.id}`);
        res.json({ message: 'Inventory updated.' });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Could not update inventory.' }); }
});

app.delete('/api/inventory/:id', requireLogin, async (req, res) => {
    await db.execute('DELETE FROM inventory WHERE id=?', [req.params.id]);
    await logActivity(req.session.user.id, `Deleted inventory item #${req.params.id}`);
    res.json({ message: 'Inventory item deleted.' });
});

// SALES: if the sold item matches an inventory item, its stock is deducted.
app.get('/api/sales', requireLogin, async (req, res) => {
    const [rows] = await db.execute('SELECT sales.*, users.full_name AS recorded_by_name FROM sales LEFT JOIN users ON sales.recorded_by=users.id ORDER BY sales.id DESC');
    res.json(rows);
});

app.post('/api/sales', requireLogin, async (req, res) => {
    const { itemName, quantity, unitPrice } = req.body;
    const qty = Number(quantity);
    const price = Number(unitPrice);
    if (!itemName || !Number.isInteger(qty) || qty < 1 || !Number.isFinite(price) || price <= 0) return res.status(400).json({ message: 'Enter a valid item, quantity, and price.' });
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [items] = await connection.execute('SELECT * FROM inventory WHERE LOWER(item_name)=LOWER(?) FOR UPDATE', [itemName.trim()]);
        if (items.length && items[0].quantity < qty) {
            await connection.rollback();
            return res.status(400).json({ message: `Not enough stock. Available quantity: ${items[0].quantity}.` });
        }
        if (items.length) await connection.execute('UPDATE inventory SET quantity = quantity - ? WHERE id = ?', [qty, items[0].id]);
        const total = qty * price;
        await connection.execute('INSERT INTO sales (item_name, quantity, unit_price, total_amount, recorded_by) VALUES (?, ?, ?, ?, ?)', [itemName.trim(), qty, price, total, req.session.user.id]);
        await connection.commit();
        await logActivity(req.session.user.id, `Recorded a sale: ${itemName.trim()}`);
        res.status(201).json({ message: 'Sale recorded.', total });
    } catch (error) {
        await connection.rollback(); console.error(error); res.status(500).json({ message: 'Could not record sale.' });
    } finally { connection.release(); }
});

// REPORTS
app.get('/api/reports', requireLogin, async (req, res) => {
    const period = req.query.period || 'today';
    let condition = 'DATE(created_at) = CURDATE()';
    if (period === 'week') condition = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    if (period === 'month') condition = 'YEAR(created_at)=YEAR(CURDATE()) AND MONTH(created_at)=MONTH(CURDATE())';
    const [sales] = await db.execute(`SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS transactions FROM sales WHERE ${condition}`);
    let bookingCondition = 'booking_date = CURDATE()';
    if (period === 'week') bookingCondition = 'booking_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND booking_date <= CURDATE()';
    if (period === 'month') bookingCondition = 'YEAR(booking_date)=YEAR(CURDATE()) AND MONTH(booking_date)=MONTH(CURDATE())';
    const [bookings] = await db.execute(`SELECT COUNT(*) AS total FROM reservations WHERE ${bookingCondition} AND status='Confirmed'`);
    res.json({ totalSales: sales[0].total, transactions: sales[0].transactions, bookings: bookings[0].total, period });
});

// USER MANAGEMENT AND ACTIVITY LOG: Owner only.
app.get('/api/users', requireOwner, async (req, res) => {
    const [users] = await db.execute('SELECT id, full_name, email, role, created_at FROM users ORDER BY id');
    const [logs] = await db.execute('SELECT activity_logs.activity, activity_logs.created_at, users.full_name FROM activity_logs LEFT JOIN users ON activity_logs.user_id=users.id ORDER BY activity_logs.id DESC LIMIT 50');
    res.json({ users, logs });
});

// A friendly home route.
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function startServer() {
    try {
        await db.query('SELECT 1');
        console.log('Connected to MySQL database.');
        app.listen(PORT, () => console.log(`System is running at http://localhost:${PORT}`));
    } catch (error) {
        console.error('Could not connect to MySQL. Import database/database.sql and check your .env settings.');
        console.error(error.message);
        process.exit(1);
    }
}

startServer();
