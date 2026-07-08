const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { scrapeGrowwPage } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'groww-secret-2026';
const ADMIN_USER = process.env.ADMIN_USER || 'rakshitrao@yahoo.in';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Rakshit@Admin2026';

// ── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['https://groww-analyser-web.vercel.app', 'http://localhost:5500', 'http://127.0.0.1:5500'];

app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '2mb' }));

// ── MONGODB ──────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI).then(() => console.log('MongoDB connected')).catch(e => console.error('MongoDB error:', e));

// ── SCHEMAS ──────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now }
});

const watchlistSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lists: {
        list1: { label: { type: String, default: '' }, stocks: [String] },
        list2: { label: { type: String, default: '' }, stocks: [String] },
        list3: { label: { type: String, default: '' }, stocks: [String] },
        list4: { label: { type: String, default: '' }, stocks: [String] },
        list5: { label: { type: String, default: '' }, stocks: [String] },
        list6: { label: { type: String, default: '' }, stocks: [String] }
    },
    updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Watchlist = mongoose.model('Watchlist', watchlistSchema);

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
        if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) return res.status(409).json({ error: 'Email already registered' });

        const hashed = await bcrypt.hash(password, 12);
        const user = await User.create({ email, password: hashed, name });

        // Create default watchlist
        await Watchlist.create({ userId: user._id });

        const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

        const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user: { id: user._id, email: user.email, name: user.name } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── WATCHLIST ROUTES ──────────────────────────────────────────────────────────
app.get('/watchlist', authMiddleware, async (req, res) => {
    try {
        let wl = await Watchlist.findOne({ userId: req.user.id });
        if (!wl) wl = await Watchlist.create({ userId: req.user.id });
        res.json({ lists: wl.lists });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/watchlist', authMiddleware, async (req, res) => {
    try {
        const { lists } = req.body;
        if (!lists) return res.status(400).json({ error: 'lists required' });

        const wl = await Watchlist.findOneAndUpdate(
            { userId: req.user.id },
            { lists, updatedAt: new Date() },
            { new: true, upsert: true }
        );
        res.json({ lists: wl.lists });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── SCRAPE ROUTE ──────────────────────────────────────────────────────────────
app.post('/scrape', authMiddleware, async (req, res) => {
    const { url, type } = req.body;
    if (!url || typeof url !== 'string') return res.status(400).json({ success: false, error: 'Missing url' });
    if (!url.startsWith('https://groww.in/stocks/')) return res.status(400).json({ success: false, error: 'Only groww.in/stocks/ URLs allowed' });

    try {
        const data = await scrapeGrowwPage(url, type || 'Overview');
        res.json({ success: true, data });
    } catch (err) {
        console.error(`Scrape error [${type}] ${url}:`, err.message);
        res.json({ success: false, error: err.message });
    }
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) return res.status(401).json({ error: 'Unauthorized' });
    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
    res.status(401).json({ error: 'Invalid credentials' });
}

app.get('/admin/stats', adminAuth, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalWatchlists = await Watchlist.countDocuments();
        const recentUsers = await User.find().sort({ createdAt: -1 }).limit(10).select('-password');
        res.json({ totalUsers, totalWatchlists, recentUsers });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/admin/users', adminAuth, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).select('-password');
        res.json({ users });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/admin/users/:id/watchlist', adminAuth, async (req, res) => {
    try {
        const wl = await Watchlist.findOne({ userId: req.params.id });
        res.json({ watchlist: wl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/admin/users/:id', adminAuth, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        await Watchlist.findOneAndDelete({ userId: req.params.id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
