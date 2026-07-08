const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function scrapeGrowwPage(url, type) {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process'
            ],
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            defaultViewport: { width: 1280, height: 800 }
        });

        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-IN,en;q=0.9' });

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait for the key selector based on page type
        try {
            if (type === 'Overview') {
                await page.waitForSelector('.ft785Table', { timeout: 10000 });
            } else if (type === 'News') {
                await page.waitForSelector('.mnc671ItemInnerDiv', { timeout: 10000 });
            } else {
                await page.waitForSelector('table', { timeout: 10000 });
            }
        } catch (e) {
            // Selector timed out — return empty result (matches extension behavior)
            console.warn(`Selector timeout for [${type}] ${url}`);
            return emptyResult();
        }

        const result = await page.evaluate((pageType) => {
            const result = {
                headers: [], rows: [], description: '',
                fundamentals: [], shareholding: [], shareholdingPeriod: null,
                price: null, news: []
            };

            if (pageType === 'News') {
                document.querySelectorAll('.mnc671ItemInnerDiv').forEach(item => {
                    const h = item.querySelector('.mnc671BoxHeaderText')?.textContent.trim() || '';
                    const t = item.querySelector('.mnc671BoxItemTitle')?.textContent.trim() || '';
                    if (t) result.news.push({ header: h, title: t });
                });
                result.news = result.news.slice(0, 5);
                return result;
            }

            if (pageType === 'Overview') {
                const priceEl = document.querySelector('.lpu38Pri div');
                if (priceEl) result.price = priceEl.textContent.trim();

                document.querySelectorAll('.ft785Table tr').forEach(tr => {
                    const k = tr.querySelector('.ft785Head');
                    const v = tr.querySelector('.ft785Value');
                    if (k && v) result.fundamentals.push([k.textContent.trim(), v.textContent.trim()]);
                });

                const shRows = document.querySelectorAll('.shp76Row');
                if (shRows.length > 0) {
                    const periodEl = document.querySelector('.shp76ToggleActive');
                    if (periodEl) result.shareholdingPeriod = periodEl.textContent.trim();
                    shRows.forEach(row => {
                        const l = row.querySelector('.bodyLarge');
                        const v = row.querySelector('.shp76TextRight');
                        if (l && v) result.shareholding.push([l.textContent.trim(), v.textContent.trim()]);
                    });
                }

                const allEls = Array.from(document.querySelectorAll('h2, div'));
                const abt = allEls.find(el =>
                    el.textContent.includes('About') || el.textContent.includes('Company Description')
                );
                if (abt) {
                    result.description = abt.parentElement.textContent.replace(abt.textContent, '').trim();
                }

                return result;
            }

            // All financial tables
            const tbl = document.querySelector('table');
            if (tbl) {
                tbl.querySelectorAll('th').forEach(h => result.headers.push(h.textContent.trim()));
                tbl.querySelectorAll('tbody tr').forEach(tr => {
                    const row = [];
                    tr.querySelectorAll('td').forEach(td => row.push(td.textContent.trim()));
                    if (row.length) result.rows.push(row);
                });
            }
            return result;
        }, type);

        return result;
    } finally {
        if (browser) await browser.close();
    }
}

function emptyResult() {
    return {
        headers: [], rows: [], description: '',
        fundamentals: [], shareholding: [], shareholdingPeriod: null,
        price: null, news: []
    };
}

module.exports = { scrapeGrowwPage };
