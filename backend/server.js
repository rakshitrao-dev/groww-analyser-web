const express = require('express');
const cors = require('cors');
const { scrapeGrowwPage } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : '*';

app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/scrape', async (req, res) => {
    const { url, type } = req.body;

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing url' });
    }
    if (!url.startsWith('https://groww.in/stocks/')) {
        return res.status(400).json({ success: false, error: 'Only groww.in/stocks/ URLs are allowed' });
    }

    try {
        const data = await scrapeGrowwPage(url, type || 'Overview');
        res.json({ success: true, data });
    } catch (err) {
        console.error(`Scrape error [${type}] ${url}:`, err.message);
        res.json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Groww scraper API running on port ${PORT}`);
});
