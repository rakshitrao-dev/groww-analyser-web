// Update this URL after deploying the backend to Render
const BACKEND_URL = 'https://groww-scraper-api.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // --- UI Elements ---
    const companyInput = document.getElementById('companyInput');
    const listLabelInput = document.getElementById('listLabel');
    const addBtn = document.getElementById('addBtn');
    const watchlistUl = document.getElementById('watchlist');
    const downloadBtn = document.getElementById('downloadBtn');
    const statusDiv = document.getElementById('status');
    const serverStatusDiv = document.getElementById('serverStatus');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const pdfInput = document.getElementById('pdfInput');
    const apiKeyInput = document.getElementById('apiKey');
    const resultArea = document.getElementById('resultArea');
    const suggestionList = document.getElementById('suggestionList');
    const tabBtns = document.querySelectorAll('.tab-btn');

    let allInstruments = [];
    let selectedGrowwID = '';
    let currentActiveListId = 'list1';

    // ============================================================
    // 1. STATE & STORAGE (localStorage replaces chrome.storage)
    // ============================================================
    function getMultiWatchlist() {
        return JSON.parse(localStorage.getItem('multiWatchlist')) || {
            list1: { label: '', stocks: [] },
            list2: { label: '', stocks: [] },
            list3: { label: '', stocks: [] }
        };
    }

    function setMultiWatchlist(data) {
        localStorage.setItem('multiWatchlist', JSON.stringify(data));
    }

    function loadFullState() {
        const data = getMultiWatchlist();
        const savedActive = localStorage.getItem('activeListId');
        if (savedActive) currentActiveListId = savedActive;

        const savedKey = localStorage.getItem('geminiApiKey');
        if (savedKey) apiKeyInput.value = savedKey;

        tabBtns.forEach(btn => {
            if (btn.dataset.list === currentActiveListId) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        if (listLabelInput) listLabelInput.value = data[currentActiveListId].label || '';
        renderList(data[currentActiveListId].stocks || []);

        if (!localStorage.getItem('multiWatchlist')) setMultiWatchlist(data);
    }

    function saveLabel() {
        const labelValue = listLabelInput.value.trim();
        const data = getMultiWatchlist();
        data[currentActiveListId].label = labelValue;
        setMultiWatchlist(data);
    }

    apiKeyInput.addEventListener('input', () => {
        localStorage.setItem('geminiApiKey', apiKeyInput.value.trim());
    });

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentActiveListId = btn.dataset.list;
            localStorage.setItem('activeListId', currentActiveListId);
            loadFullState();
        });
    });

    if (listLabelInput) listLabelInput.addEventListener('input', saveLabel);

    // ============================================================
    // 2. AUTOCOMPLETE LOGIC
    // ============================================================
    fetch('filtered_instruments.json')
        .then(res => res.json())
        .then(data => { allInstruments = data.Stocks || []; })
        .catch(err => console.error('Error loading instruments:', err));

    companyInput.addEventListener('input', () => {
        const query = companyInput.value.toLowerCase().trim();
        suggestionList.innerHTML = '';
        selectedGrowwID = '';

        if (query.length < 2) { suggestionList.style.display = 'none'; return; }

        const matches = allInstruments.filter(item => item.Name.toLowerCase().includes(query)).slice(0, 10);

        if (matches.length > 0) {
            matches.forEach(match => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.textContent = match.Name;
                div.addEventListener('click', () => {
                    companyInput.value = match.Name;
                    selectedGrowwID = match.GrowwID;
                    suggestionList.style.display = 'none';
                    addCompany(selectedGrowwID);
                });
                suggestionList.appendChild(div);
            });
            suggestionList.style.display = 'block';
        } else { suggestionList.style.display = 'none'; }
    });

    document.addEventListener('click', (e) => {
        if (e.target !== companyInput) suggestionList.style.display = 'none';
    });

    // ============================================================
    // 3. WATCHLIST ACTIONS
    // ============================================================
    addBtn.addEventListener('click', () => {
        const val = companyInput.value.trim();
        if (!val) return;
        const manualMatch = allInstruments.find(i => i.Name.toLowerCase() === val.toLowerCase());
        const slugToAdd = selectedGrowwID || (manualMatch ? manualMatch.GrowwID : val);
        if (slugToAdd) addCompany(slugToAdd);
    });

    function addCompany(slug) {
        const data = getMultiWatchlist();
        if (!data[currentActiveListId].stocks.includes(slug)) {
            data[currentActiveListId].stocks.push(slug);
            setMultiWatchlist(data);
            companyInput.value = '';
            selectedGrowwID = '';
            loadFullState();
        }
    }

    function removeCompany(slug) {
        const data = getMultiWatchlist();
        data[currentActiveListId].stocks = data[currentActiveListId].stocks.filter(s => s !== slug);
        setMultiWatchlist(data);
        loadFullState();
    }

    function renderList(list) {
        watchlistUl.innerHTML = '';
        list.forEach(slug => {
            const li = document.createElement('li');
            li.textContent = slug;
            const remove = document.createElement('span');
            remove.textContent = 'X';
            remove.className = 'remove-btn';
            remove.onclick = () => removeCompany(slug);
            li.appendChild(remove);
            watchlistUl.appendChild(li);
        });
    }

    // ============================================================
    // 4. BACKEND WAKE-UP HELPERS
    // ============================================================
    async function waitForServer(timeoutMs = 60000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const r = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(4000) });
                if (r.ok) return;
            } catch {}
            await new Promise(r => setTimeout(r, 3000));
        }
        throw new Error('Server did not wake up. Please try again in a moment.');
    }

    async function scrapePageFromTab(url, type) {
        const response = await fetch(`${BACKEND_URL}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, type })
        });
        if (!response.ok) throw new Error(`Scrape failed: HTTP ${response.status}`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Scrape error');
        return json.data;
    }

    // ============================================================
    // 5. PDF GENERATION LOGIC (Watchlist Report)
    // ============================================================
    downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        serverStatusDiv.textContent = 'Checking server...';

        try {
            const healthRes = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(5000) });
            if (!healthRes.ok) throw new Error('not ok');
            serverStatusDiv.textContent = '';
        } catch {
            serverStatusDiv.textContent = 'Waking up server (may take ~30 seconds)...';
            try {
                await waitForServer(60000);
                serverStatusDiv.textContent = 'Server ready!';
                await new Promise(r => setTimeout(r, 800));
                serverStatusDiv.textContent = '';
            } catch (e) {
                serverStatusDiv.textContent = e.message;
                downloadBtn.disabled = false;
                return;
            }
        }

        await startDownloadProcess();
    });

    async function startDownloadProcess() {
        statusDiv.textContent = 'Initializing PDF...';
        try {
            const currentData = getMultiWatchlist()[currentActiveListId];
            const companies = currentData.stocks || [];
            const listLabel = currentData.label || `Watchlist_${currentActiveListId}`;

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            let yPos = 15;

            doc.setFontSize(10); doc.setTextColor(150);
            doc.text(`Category: ${listLabel}`, 14, 10);

            for (const company of companies) {
                statusDiv.textContent = `Processing: ${company}...`;
                if (companies.indexOf(company) > 0) { doc.addPage(); yPos = 15; }

                const urls = [
                    { type: 'Overview', url: `https://groww.in/stocks/${company}` },
                    { type: 'News', url: `https://groww.in/stocks/${company}/market-news` },
                    { type: 'Financials (Quarterly)', url: `https://groww.in/stocks/${company}/company-financial` },
                    { type: 'Financials (Yearly)', url: `https://groww.in/stocks/${company}/results/yearly` },
                    { type: 'Balance Sheet', url: `https://groww.in/stocks/${company}/company-financial/balance-sheet` },
                    { type: 'Cash Flow', url: `https://groww.in/stocks/${company}/company-financial/cash-flow` }
                ];

                for (const link of urls) {
                    try {
                        const data = await scrapePageFromTab(link.url, link.type);
                        if (link.type === 'Overview') {
                            doc.setFontSize(16); doc.setTextColor(0, 208, 156);
                            doc.text(company.toUpperCase().replace(/-/g, ' '), 14, yPos); yPos += 12;
                            if (data.description) {
                                doc.setFontSize(9); doc.setTextColor(60, 60, 60);
                                const desc = doc.splitTextToSize(sanitizeText(data.description), 180);
                                doc.text(desc, 14, yPos); yPos += (desc.length * 4) + 12;
                            }
                            yPos = checkPageBreak(doc, yPos, 40); doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'bold'); doc.text('Fundamentals', 14, yPos); yPos += 6;
                            if (data.price) data.fundamentals.unshift(['Current Price', data.price]);
                            if (data.fundamentals.length > 0) { doc.autoTable({ startY: yPos, head: [['Key', 'Value']], body: data.fundamentals.map(r => r.map(c => sanitizeText(c))), theme: 'grid', styles: { fontSize: 8, cellPadding: 1.5 }, margin: { top: 5 } }); yPos = doc.lastAutoTable.finalY + 18; }
                            if (data.shareholding && data.shareholding.length > 0) { let shTitle = 'Shareholding Pattern'; if (data.shareholdingPeriod) shTitle += ` (${data.shareholdingPeriod})`; yPos = checkPageBreak(doc, yPos, 60); doc.setFontSize(11); doc.text(shTitle, 14, yPos); yPos += 8; const shLabels = [], shValues = []; data.shareholding.forEach(r => { shLabels.push(r[0]); shValues.push(parseFloat(r[1].replace('%', '')) || 0); }); drawHorizontalChart(doc, shLabels, shValues, 14, yPos, 180, shLabels.length * 7 + 5); yPos += shLabels.length * 7 + 18; }
                        } else if (link.type === 'News' && data.news && data.news.length > 0) {
                            yPos = checkPageBreak(doc, yPos, 30);
                            const newsRows = data.news.map(item => [`${item.title}\n\n${item.header}`]);
                            doc.autoTable({ startY: yPos, head: [['Report News']], body: newsRows, theme: 'grid', headStyles: { fillColor: [0, 208, 156], textColor: 255, fontStyle: 'bold', fontSize: 10, cellPadding: 2, halign: 'left' }, styles: { fontSize: 9, cellPadding: 6, valign: 'middle', overflow: 'linebreak', cellWidth: 'auto' }, tableWidth: 'auto', margin: { left: 14, right: 14 }, showHead: 'firstPage', rowPageBreak: 'avoid' });
                            yPos = doc.lastAutoTable.finalY + 15;
                        } else if (!link.type.includes('Overview') && !link.type.includes('News')) {
                            let rowToChart = null, chartTitle = '', hasChart = false;
                            if (link.type.includes('Financials')) { rowToChart = data.rows.find(r => r[0].toLowerCase().includes('revenue')); chartTitle = link.type.includes('Yearly') ? 'Revenue Trend (Yearly)' : 'Revenue Trend (Quarterly)'; }
                            else if (link.type === 'Cash Flow') { rowToChart = data.rows.find(r => r[0].toLowerCase().includes('operating')); chartTitle = 'Operating Cash Flow Trend'; }
                            else if (link.type === 'Balance Sheet') { rowToChart = data.rows.find(r => r[0].toLowerCase().includes('total assets')); chartTitle = 'Total Assets Trend'; }
                            if (rowToChart && data.headers) { const v = rowToChart.slice(1).map(v => parseFloat(v.replace(/,/g, '')) || 0); if (v.some(x => x !== 0)) hasChart = true; }
                            yPos = checkPageBreak(doc, yPos, hasChart ? 75 : 25); doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.text(link.type, 14, yPos); yPos += 8;
                            if (hasChart && rowToChart) { const l = data.headers.slice(1).map(h => sanitizeText(h)); const v = rowToChart.slice(1).map(x => parseFloat(x.replace(/,/g, '')) || 0); doc.setFontSize(8); doc.setTextColor(100); doc.text(chartTitle, 14, yPos); yPos += 4; drawVerticalBarChart(doc, l, v, 14, yPos, 180, 40); yPos += 55; }
                            if (data.rows.length > 0) { doc.autoTable({ startY: yPos, head: [data.headers.map(h => sanitizeText(h))], body: data.rows.map(r => r.map(c => sanitizeText(c))), theme: 'striped', styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [0, 208, 156], fontSize: 7 }, margin: { top: 5 }, pageBreak: 'auto' }); yPos = doc.lastAutoTable.finalY + 15; }
                        }
                    } catch (e) { console.error(e); }
                }
            }
            doc.save('Watchlist_Report.pdf');
            statusDiv.textContent = 'Download Complete!';
        } catch (e) { statusDiv.textContent = 'Error: ' + e.message; } finally { downloadBtn.disabled = false; }
    }

    // ============================================================
    // 6. GEMINI ANALYSIS & MERGED PDF
    // ============================================================
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            const apiKey = apiKeyInput.value.trim();
            if (!apiKey) { statusDiv.textContent = '⚠️ Enter API Key.'; statusDiv.style.color = 'red'; return; }
            if (!pdfInput.files.length) { statusDiv.textContent = '⚠️ Select PDF.'; statusDiv.style.color = 'red'; return; }

            statusDiv.textContent = 'Analyzing with Gemini 2.5...';
            statusDiv.style.color = '#00d09c';
            resultArea.style.display = 'none';
            analyzeBtn.disabled = true;

            try {
                const promptRes = await fetch('prompt.md');
                if (!promptRes.ok) throw new Error('Missing prompt.md');
                const promptText = await promptRes.text();

                const file = pdfInput.files[0];
                const base64Data = await readFileAsBase64(file);

                const analysisText = await callGeminiAPI(apiKey, promptText, base64Data);

                resultArea.textContent = analysisText;
                resultArea.style.display = 'block';

                statusDiv.textContent = 'Merging PDFs...';

                const analysisPdfBytes = await createAnalysisPdfBytes(file.name, analysisText);
                const originalPdfBytes = await file.arrayBuffer();
                await mergeAndDownload(originalPdfBytes, analysisPdfBytes, file.name);

                statusDiv.textContent = 'Analysis & Download Complete!';
            } catch (e) {
                console.error(e);
                statusDiv.textContent = 'Error: ' + e.message;
                statusDiv.style.color = 'red';
            } finally {
                analyzeBtn.disabled = false;
            }
        });
    }

    // ============================================================
    // 7. ANALYSIS PDF BUILDER
    // ============================================================
    async function createAnalysisPdfBytes(originalFileName, analysisText) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let yPos = 20;

        doc.setFontSize(18);
        doc.setTextColor(0, 208, 156);
        doc.text('AI Analysis Report', 14, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Source: ${originalFileName}`, 14, yPos);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, yPos + 5);
        yPos += 15;
        doc.setDrawColor(220);
        doc.line(14, yPos, 196, yPos);
        yPos += 10;

        const lines = analysisText.split('\n');
        let tableBuffer = [];
        let inTable = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            if (line.includes('|') && line.length > 5) {
                tableBuffer.push(line);
                inTable = true;
                continue;
            } else if (inTable) {
                renderMarkdownTable(doc, tableBuffer, yPos);
                yPos = doc.lastAutoTable.finalY + 10;
                tableBuffer = [];
                inTable = false;
            }

            if (!line) continue;

            if (yPos > 280) { doc.addPage(); yPos = 20; }

            if (line.startsWith('#') || (line.startsWith('**') && line.endsWith('**'))) {
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(0, 208, 156);
                const text = line.replace(/[#*]/g, '').trim();
                doc.text(text, 14, yPos);
                yPos += 7;
                doc.setFont(undefined, 'normal');
                doc.setTextColor(0);
                doc.setFontSize(10);
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
                const text = '• ' + line.replace(/^[\*\-]\s*/, '');
                const splitText = doc.splitTextToSize(text, 170);
                doc.text(splitText, 18, yPos);
                yPos += (splitText.length * 5) + 2;
            } else {
                const text = line.replace(/\*\*/g, '');
                const splitText = doc.splitTextToSize(text, 180);
                doc.text(splitText, 14, yPos);
                yPos += (splitText.length * 5) + 2;
            }
        }

        if (inTable && tableBuffer.length > 0) {
            renderMarkdownTable(doc, tableBuffer, yPos);
        }

        return doc.output('arraybuffer');
    }

    function renderMarkdownTable(doc, rows, startY) {
        const body = [];
        let head = [];

        rows.forEach((row, index) => {
            const cols = row.split('|').map(c => c.trim()).filter(c => c !== '');
            if (row.includes('---')) return;
            if (index === 0) head.push(cols);
            else body.push(cols);
        });

        if (head.length === 0) return;

        doc.autoTable({
            startY: startY,
            head: head,
            body: body,
            theme: 'striped',
            headStyles: { fillColor: [50, 50, 50], fontSize: 9 },
            styles: { fontSize: 8, cellPadding: 2 },
            margin: { left: 14, right: 14 }
        });
    }

    async function mergeAndDownload(originalBytes, analysisBytes, filename) {
        const { PDFDocument } = PDFLib;
        const pdf1 = await PDFDocument.load(originalBytes);
        const pdf2 = await PDFDocument.load(analysisBytes);
        const mergedPdf = await PDFDocument.create();
        const pages1 = await mergedPdf.copyPages(pdf1, pdf1.getPageIndices());
        pages1.forEach(page => mergedPdf.addPage(page));
        const pages2 = await mergedPdf.copyPages(pdf2, pdf2.getPageIndices());
        pages2.forEach(page => mergedPdf.addPage(page));
        const mergedPdfBytes = await mergedPdf.save();
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename.replace('.pdf', '') + '_Analyzed.pdf';
        link.click();
    }

    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function callGeminiAPI(apiKey, prompt, base64Pdf) {
        const model = 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'application/pdf', data: base64Pdf } }] }] };

        const maxRetries = 3;
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (response.status === 429) {
                    attempt++; await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt))); continue;
                }
                if (!response.ok) { const err = await response.json(); throw new Error(err.error?.message || 'API Error'); }
                const data = await response.json();
                return data.candidates[0].content.parts[0].text;
            } catch (e) {
                if (attempt === maxRetries - 1) throw e;
                attempt++;
            }
        }
    }

    // ============================================================
    // 8. PDF CHART HELPERS
    // ============================================================
    function checkPageBreak(doc, y, space) { return (y + space > doc.internal.pageSize.height - 20) ? (doc.addPage(), 15) : y; }
    function sanitizeText(s) { return s ? s.toString().replace(/₹/g, 'Rs. ').trim() : ''; }

    function drawVerticalBarChart(doc, l, v, x, y, w, h) {
        const max = Math.max(...v), min = Math.min(...v); let zY = y + h, sc = h; if (min < 0) { sc = h / (max - min); zY = y + (max / (max - min)) * h; } else { sc = (h * 0.85) / max; } const sW = w / v.length, bW = sW * 0.4;
        doc.setDrawColor(200); doc.line(x, zY, x + w, zY);
        v.forEach((val, i) => { const H = Math.abs(val) * sc, xP = x + (i * sW) + (sW - bW) / 2; doc.setFillColor(val >= 0 ? 0 : 235, val >= 0 ? 208 : 87, val >= 0 ? 156 : 87); doc.rect(xP, val >= 0 ? zY - H : zY, bW, H, 'F'); doc.setFontSize(7); doc.text(val.toLocaleString(), xP, val >= 0 ? zY - H - 2 : zY + H + 3); doc.text(l[i] || '', xP, y + h + 4); });
    }

    function drawHorizontalChart(doc, l, v, x, y, w, h) {
        const rH = h / l.length, bMW = w * 0.6; v.forEach((val, i) => { const bW = (val / 100) * bMW, yP = y + (i * rH) + 2; doc.setFontSize(8); doc.text(l[i], x, yP + 4); doc.setFillColor(245, 245, 245); doc.rect(x + 75, yP, bMW, 5, 'F'); doc.setFillColor(0, 150, 136); doc.rect(x + 75, yP, bW, 5, 'F'); doc.setFontSize(7); doc.text(val + '%', x + 75 + bW + 2, yP + 3.5); });
    }

    loadFullState();
}
