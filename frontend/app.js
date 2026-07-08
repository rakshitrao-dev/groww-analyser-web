const BACKEND_URL = 'https://groww-scraper-api.onrender.com';

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
const authToken = localStorage.getItem('authToken');
const authUser  = JSON.parse(localStorage.getItem('authUser') || 'null');
if (!authToken || !authUser) {
    window.location.href = 'auth.html';
}

document.addEventListener('DOMContentLoaded', () => initializeApp());

function initializeApp() {
    // ── UI ELEMENTS ────────────────────────────────────────────────────────────
    const companyInput     = document.getElementById('companyInput');
    const listLabelInput   = document.getElementById('listLabel');
    const addBtn           = document.getElementById('addBtn');
    const watchlistUl      = document.getElementById('watchlist');
    const downloadBtn      = document.getElementById('downloadBtn');
    const statusDiv        = document.getElementById('status');
    const serverStatusDiv  = document.getElementById('serverStatus');
    const analyzeBtn       = document.getElementById('analyzeBtn');
    const pdfInput         = document.getElementById('pdfInput');
    const apiKeyInput      = document.getElementById('apiKey');
    const resultArea       = document.getElementById('resultArea');
    const suggestionList   = document.getElementById('suggestionList');
    const tabBtns          = document.querySelectorAll('.tab-btn');
    const themeToggle      = document.getElementById('themeToggle');
    const logoutBtn        = document.getElementById('logoutBtn');
    const stockCountBadge  = document.getElementById('stockCountBadge');
    const statStocks       = document.getElementById('statStocks');
    const statPages        = document.getElementById('statPages');
    const watchlistEmpty   = document.getElementById('watchlistEmpty');
    const fileLabel        = document.getElementById('fileLabel');
    const userGreeting     = document.getElementById('userGreeting');
    const syncStatus       = document.getElementById('syncStatus');

    let allInstruments     = [];
    let selectedGrowwID    = '';
    let currentListId      = 'list1';
    let syncTimer          = null;

    // ── THEME ──────────────────────────────────────────────────────────────────
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
    themeToggle.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        themeToggle.textContent = next === 'dark' ? '🌙' : '☀️';
    });

    // ── USER GREETING & LOGOUT ─────────────────────────────────────────────────
    if (authUser && userGreeting) {
        userGreeting.textContent = `Hi, ${authUser.name.split(' ')[0]}`;
        userGreeting.style.display = '';
    }
    if (logoutBtn) {
        logoutBtn.style.display = '';
        logoutBtn.title = 'Sign out';
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
            window.location.href = 'auth.html';
        });
    }

    // ── FILE LABEL ─────────────────────────────────────────────────────────────
    if (pdfInput && fileLabel) {
        pdfInput.addEventListener('change', () => {
            fileLabel.textContent = pdfInput.files[0] ? pdfInput.files[0].name : 'No file selected';
        });
    }

    // ── GEMINI KEY PERSISTENCE ─────────────────────────────────────────────────
    const savedKey = localStorage.getItem('geminiApiKey');
    if (savedKey) apiKeyInput.value = savedKey;
    apiKeyInput.addEventListener('input', () => {
        localStorage.setItem('geminiApiKey', apiKeyInput.value.trim());
    });

    // ── STATE: default 6 watchlists ────────────────────────────────────────────
    function defaultLists() {
        return {
            list1: { label: '', stocks: [] },
            list2: { label: '', stocks: [] },
            list3: { label: '', stocks: [] },
            list4: { label: '', stocks: [] },
            list5: { label: '', stocks: [] },
            list6: { label: '', stocks: [] }
        };
    }

    function getLocalLists() {
        return JSON.parse(localStorage.getItem('multiWatchlist')) || defaultLists();
    }

    function setLocalLists(data) {
        localStorage.setItem('multiWatchlist', JSON.stringify(data));
    }

    // ── DB SYNC ────────────────────────────────────────────────────────────────
    async function syncToDB(lists) {
        if (!authToken) return;
        try {
            syncStatus.textContent = '⏳ Saving...';
            await fetch(`${BACKEND_URL}/watchlist`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ lists })
            });
            syncStatus.textContent = '✅ Saved';
            setTimeout(() => { syncStatus.textContent = ''; }, 2000);
        } catch {
            syncStatus.textContent = '⚠️ Offline';
        }
    }

    function scheduleSave(lists) {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => syncToDB(lists), 1200);
    }

    async function loadFromDB() {
        try {
            const res = await fetch(`${BACKEND_URL}/watchlist`, {
                headers: { Authorization: `Bearer ${authToken}` }
            });
            if (res.status === 401) {
                localStorage.removeItem('authToken');
                localStorage.removeItem('authUser');
                window.location.href = 'auth.html';
                return;
            }
            if (!res.ok) throw new Error();
            const data = await res.json();
            const merged = { ...defaultLists(), ...data.lists };
            setLocalLists(merged);
            renderUI();
        } catch {
            renderUI(); // fall back to local
        }
    }

    // ── RENDER ──────────────────────────────────────────────────────────────────
    function renderUI() {
        const data = getLocalLists();
        const savedActive = localStorage.getItem('activeListId') || 'list1';
        currentListId = savedActive;

        tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.list === currentListId);
        });

        listLabelInput.value = data[currentListId]?.label || '';
        renderList(data[currentListId]?.stocks || []);
    }

    function renderList(list) {
        watchlistUl.innerHTML = '';
        const count = list.length;
        if (watchlistEmpty) watchlistEmpty.style.display = count === 0 ? 'flex' : 'none';
        if (stockCountBadge) stockCountBadge.textContent = `${count} stock${count !== 1 ? 's' : ''}`;
        if (statStocks) statStocks.textContent = count;
        if (statPages) statPages.textContent = count * 6;

        list.forEach(slug => {
            const li = document.createElement('li');

            const nameSpan = document.createElement('span');
            nameSpan.className = 'stock-slug';
            nameSpan.textContent = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            const remove = document.createElement('button');
            remove.innerHTML = '✕';
            remove.className = 'remove-btn';
            remove.title = 'Remove';
            remove.onclick = () => removeCompany(slug);

            li.appendChild(nameSpan);
            li.appendChild(remove);
            watchlistUl.appendChild(li);
        });
    }

    // ── TABS ───────────────────────────────────────────────────────────────────
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentListId = btn.dataset.list;
            localStorage.setItem('activeListId', currentListId);
            renderUI();
        });
    });

    // ── LABEL SAVE ─────────────────────────────────────────────────────────────
    listLabelInput.addEventListener('input', () => {
        const data = getLocalLists();
        data[currentListId].label = listLabelInput.value.trim();
        setLocalLists(data);
        scheduleSave(data);
    });

    // ── AUTOCOMPLETE ───────────────────────────────────────────────────────────
    fetch('filtered_instruments.json')
        .then(r => r.json())
        .then(d => { allInstruments = d.Stocks || []; })
        .catch(() => {});

    companyInput.addEventListener('input', () => {
        const q = companyInput.value.toLowerCase().trim();
        suggestionList.innerHTML = '';
        selectedGrowwID = '';
        if (q.length < 2) { suggestionList.style.display = 'none'; return; }

        const matches = allInstruments.filter(i => i.Name.toLowerCase().includes(q)).slice(0, 10);
        if (!matches.length) { suggestionList.style.display = 'none'; return; }

        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = m.Name;
            div.addEventListener('click', () => {
                companyInput.value = m.Name;
                selectedGrowwID = m.GrowwID;
                suggestionList.style.display = 'none';
                addCompany(m.GrowwID);
            });
            suggestionList.appendChild(div);
        });
        suggestionList.style.display = 'block';
    });

    document.addEventListener('click', e => {
        if (e.target !== companyInput) suggestionList.style.display = 'none';
    });

    // ── ADD / REMOVE ───────────────────────────────────────────────────────────
    addBtn.addEventListener('click', () => {
        const val = companyInput.value.trim();
        if (!val) return;
        const match = allInstruments.find(i => i.Name.toLowerCase() === val.toLowerCase());
        const slug = selectedGrowwID || (match ? match.GrowwID : val.toLowerCase().replace(/\s+/g, '-'));
        if (slug) addCompany(slug);
    });

    function addCompany(slug) {
        const data = getLocalLists();
        if (!data[currentListId].stocks.includes(slug)) {
            data[currentListId].stocks.push(slug);
            setLocalLists(data);
            scheduleSave(data);
            companyInput.value = '';
            selectedGrowwID = '';
            renderUI();
        }
    }

    function removeCompany(slug) {
        const data = getLocalLists();
        data[currentListId].stocks = data[currentListId].stocks.filter(s => s !== slug);
        setLocalLists(data);
        scheduleSave(data);
        renderUI();
    }

    // ── SCRAPE VIA BACKEND ─────────────────────────────────────────────────────
    async function waitForServer(timeoutMs = 60000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const r = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(4000) });
                if (r.ok) return;
            } catch {}
            await new Promise(r => setTimeout(r, 3000));
        }
        throw new Error('Server did not wake up. Please try again.');
    }

    async function scrapePage(url, type) {
        const res = await fetch(`${BACKEND_URL}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ url, type })
        });
        if (!res.ok) throw new Error(`Scrape failed: HTTP ${res.status}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Scrape error');
        return json.data;
    }

    // ── DOWNLOAD PDF ───────────────────────────────────────────────────────────
    downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        serverStatusDiv.innerHTML = '<span class="spinner"></span> Checking server...';
        try {
            const h = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(5000) });
            if (!h.ok) throw new Error();
            serverStatusDiv.innerHTML = '';
        } catch {
            serverStatusDiv.innerHTML = '<span class="spinner"></span> Waking up server (~30s)...';
            try {
                await waitForServer(60000);
                serverStatusDiv.innerHTML = '✅ Server ready!';
                await new Promise(r => setTimeout(r, 600));
                serverStatusDiv.innerHTML = '';
            } catch (e) {
                serverStatusDiv.innerHTML = '❌ ' + e.message;
                downloadBtn.disabled = false;
                return;
            }
        }
        await generatePDF();
    });

    async function generatePDF() {
        statusDiv.textContent = 'Initializing PDF...';
        try {
            const listData = getLocalLists()[currentListId];
            const companies = listData.stocks || [];
            const listLabel = listData.label || `Watchlist ${currentListId.replace('list', '')}`;

            if (!companies.length) {
                statusDiv.textContent = '⚠️ No stocks in this watchlist.';
                downloadBtn.disabled = false;
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            let yPos = 15;

            doc.setFontSize(10); doc.setTextColor(150);
            doc.text(`Category: ${listLabel}`, 14, 10);

            for (const company of companies) {
                statusDiv.textContent = `Scraping: ${company} (${companies.indexOf(company)+1}/${companies.length})...`;
                if (companies.indexOf(company) > 0) { doc.addPage(); yPos = 15; }

                const urls = [
                    { type: 'Overview',               url: `https://groww.in/stocks/${company}` },
                    { type: 'News',                   url: `https://groww.in/stocks/${company}/market-news` },
                    { type: 'Financials (Quarterly)', url: `https://groww.in/stocks/${company}/company-financial` },
                    { type: 'Financials (Yearly)',    url: `https://groww.in/stocks/${company}/results/yearly` },
                    { type: 'Balance Sheet',          url: `https://groww.in/stocks/${company}/company-financial/balance-sheet` },
                    { type: 'Cash Flow',              url: `https://groww.in/stocks/${company}/company-financial/cash-flow` }
                ];

                for (const link of urls) {
                    try {
                        const data = await scrapePage(link.url, link.type);
                        if (link.type === 'Overview') {
                            doc.setFontSize(16); doc.setTextColor(0, 208, 156);
                            doc.text(company.toUpperCase().replace(/-/g, ' '), 14, yPos); yPos += 12;
                            if (data.description) {
                                doc.setFontSize(9); doc.setTextColor(60, 60, 60);
                                const desc = doc.splitTextToSize(sanitizeText(data.description), 180);
                                doc.text(desc, 14, yPos); yPos += (desc.length * 4) + 12;
                            }
                            yPos = pageBreak(doc, yPos, 40);
                            doc.setFontSize(11); doc.setTextColor(0,0,0); doc.setFont(undefined,'bold');
                            doc.text('Fundamentals', 14, yPos); yPos += 6; doc.setFont(undefined,'normal');
                            if (data.price) data.fundamentals.unshift(['Current Price', data.price]);
                            if (data.fundamentals.length) {
                                doc.autoTable({ startY: yPos, head: [['Key','Value']], body: data.fundamentals.map(r => r.map(sanitizeText)), theme:'grid', styles:{fontSize:8,cellPadding:1.5}, margin:{top:5} });
                                yPos = doc.lastAutoTable.finalY + 18;
                            }
                            if (data.shareholding?.length) {
                                let title = 'Shareholding Pattern';
                                if (data.shareholdingPeriod) title += ` (${data.shareholdingPeriod})`;
                                yPos = pageBreak(doc, yPos, 60);
                                doc.setFontSize(11); doc.text(title, 14, yPos); yPos += 8;
                                const sl = [], sv = [];
                                data.shareholding.forEach(r => { sl.push(r[0]); sv.push(parseFloat(r[1].replace('%',''))||0); });
                                drawHBar(doc, sl, sv, 14, yPos, 180, sl.length*7+5);
                                yPos += sl.length*7+18;
                            }
                        } else if (link.type === 'News' && data.news?.length) {
                            yPos = pageBreak(doc, yPos, 30);
                            doc.autoTable({ startY: yPos, head:[['Report News']], body: data.news.map(i => [`${i.title}\n\n${i.header}`]), theme:'grid', headStyles:{fillColor:[0,208,156],textColor:255,fontStyle:'bold',fontSize:10,cellPadding:2,halign:'left'}, styles:{fontSize:9,cellPadding:6,overflow:'linebreak'}, margin:{left:14,right:14}, showHead:'firstPage', rowPageBreak:'avoid' });
                            yPos = doc.lastAutoTable.finalY + 15;
                        } else if (!link.type.includes('Overview') && !link.type.includes('News')) {
                            let rowToChart = null, chartTitle = '', hasChart = false;
                            if (link.type.includes('Financials')) { rowToChart = data.rows.find(r => r[0].toLowerCase().includes('revenue')); chartTitle = link.type.includes('Yearly') ? 'Revenue Trend (Yearly)' : 'Revenue Trend (Quarterly)'; }
                            else if (link.type === 'Cash Flow') { rowToChart = data.rows.find(r => r[0].toLowerCase().includes('operating')); chartTitle = 'Operating Cash Flow Trend'; }
                            else if (link.type === 'Balance Sheet') { rowToChart = data.rows.find(r => r[0].toLowerCase().includes('total assets')); chartTitle = 'Total Assets Trend'; }
                            if (rowToChart && data.headers) { const v = rowToChart.slice(1).map(v => parseFloat(v.replace(/,/g,''))||0); if (v.some(x=>x!==0)) hasChart = true; }
                            yPos = pageBreak(doc, yPos, hasChart?75:25);
                            doc.setFontSize(11); doc.setTextColor(0,0,0); doc.text(link.type, 14, yPos); yPos += 8;
                            if (hasChart && rowToChart) {
                                const l = data.headers.slice(1).map(sanitizeText);
                                const v = rowToChart.slice(1).map(x => parseFloat(x.replace(/,/g,''))||0);
                                doc.setFontSize(8); doc.setTextColor(100); doc.text(chartTitle, 14, yPos); yPos += 4;
                                drawVBar(doc, l, v, 14, yPos, 180, 40); yPos += 55;
                            }
                            if (data.rows.length) {
                                doc.autoTable({ startY:yPos, head:[data.headers.map(sanitizeText)], body:data.rows.map(r=>r.map(sanitizeText)), theme:'striped', styles:{fontSize:7,cellPadding:1.5}, headStyles:{fillColor:[0,208,156],fontSize:7}, margin:{top:5}, pageBreak:'auto' });
                                yPos = doc.lastAutoTable.finalY + 15;
                            }
                        }
                    } catch (e) { console.error(link.type, e); }
                }
            }
            doc.save(`${listLabel.replace(/\s+/g,'_')}_Report.pdf`);
            statusDiv.textContent = '✅ Download Complete!';
        } catch (e) {
            statusDiv.textContent = '❌ Error: ' + e.message;
        } finally {
            downloadBtn.disabled = false;
        }
    }

    // ── GEMINI ANALYSIS ────────────────────────────────────────────────────────
    analyzeBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) { statusDiv.textContent = '⚠️ Enter API Key.'; return; }
        if (!pdfInput.files.length) { statusDiv.textContent = '⚠️ Select PDF.'; return; }

        statusDiv.textContent = 'Analyzing with Gemini 2.5...';
        resultArea.style.display = 'none';
        analyzeBtn.disabled = true;

        try {
            const promptRes = await fetch('prompt.md');
            if (!promptRes.ok) throw new Error('Missing prompt.md');
            const promptText = await promptRes.text();
            const file = pdfInput.files[0];
            const base64Data = await toBase64(file);
            const analysisText = await callGemini(apiKey, promptText, base64Data);

            resultArea.textContent = analysisText;
            resultArea.style.display = 'block';
            statusDiv.textContent = 'Merging PDFs...';

            const analysisPdfBytes = await buildAnalysisPdf(file.name, analysisText);
            const originalPdfBytes = await file.arrayBuffer();
            await mergePdfs(originalPdfBytes, analysisPdfBytes, file.name);
            statusDiv.textContent = '✅ Analysis & Download Complete!';
        } catch (e) {
            statusDiv.textContent = '❌ Error: ' + e.message;
        } finally {
            analyzeBtn.disabled = false;
        }
    });

    // ── PDF HELPERS ────────────────────────────────────────────────────────────
    function pageBreak(doc, y, space) {
        return (y + space > doc.internal.pageSize.height - 20) ? (doc.addPage(), 15) : y;
    }

    function sanitizeText(s) {
        return s ? s.toString().replace(/₹/g, 'Rs. ').trim() : '';
    }

    function drawVBar(doc, l, v, x, y, w, h) {
        const max=Math.max(...v), min=Math.min(...v);
        let zY=y+h, sc=h;
        if (min<0) { sc=h/(max-min); zY=y+(max/(max-min))*h; } else { sc=(h*0.85)/max; }
        const sW=w/v.length, bW=sW*0.4;
        doc.setDrawColor(200); doc.line(x,zY,x+w,zY);
        v.forEach((val,i) => {
            const H=Math.abs(val)*sc, xP=x+(i*sW)+(sW-bW)/2;
            doc.setFillColor(val>=0?0:235, val>=0?208:87, val>=0?156:87);
            doc.rect(xP, val>=0?zY-H:zY, bW, H, 'F');
            doc.setFontSize(7);
            doc.text(val.toLocaleString(), xP, val>=0?zY-H-2:zY+H+3);
            doc.text(l[i]||'', xP, y+h+4);
        });
    }

    function drawHBar(doc, l, v, x, y, w, h) {
        const rH=h/l.length, bMW=w*0.6;
        v.forEach((val,i) => {
            const bW=(val/100)*bMW, yP=y+(i*rH)+2;
            doc.setFontSize(8); doc.text(l[i], x, yP+4);
            doc.setFillColor(245,245,245); doc.rect(x+75, yP, bMW, 5, 'F');
            doc.setFillColor(0,150,136); doc.rect(x+75, yP, bW, 5, 'F');
            doc.setFontSize(7); doc.text(val+'%', x+75+bW+2, yP+3.5);
        });
    }

    async function buildAnalysisPdf(originalFileName, analysisText) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let yPos = 20;

        doc.setFontSize(18); doc.setTextColor(0,208,156);
        doc.text('AI Analysis Report', 14, yPos); yPos += 8;
        doc.setFontSize(10); doc.setTextColor(100);
        doc.text(`Source: ${originalFileName}`, 14, yPos);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, yPos+5);
        yPos += 15;
        doc.setDrawColor(220); doc.line(14, yPos, 196, yPos); yPos += 10;

        const lines = analysisText.split('\n');
        let tableBuffer = [], inTable = false;

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (line.includes('|') && line.length > 5) { tableBuffer.push(line); inTable = true; continue; }
            if (inTable) {
                renderMdTable(doc, tableBuffer, yPos);
                yPos = doc.lastAutoTable.finalY + 10;
                tableBuffer = []; inTable = false;
            }
            if (!line) continue;
            if (yPos > 280) { doc.addPage(); yPos = 20; }
            if (line.startsWith('#') || (line.startsWith('**') && line.endsWith('**'))) {
                doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.setTextColor(0,208,156);
                doc.text(line.replace(/[#*]/g,'').trim(), 14, yPos); yPos += 7;
                doc.setFont(undefined,'normal'); doc.setTextColor(0); doc.setFontSize(10);
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
                const t = '• ' + line.replace(/^[\*\-]\s*/,'');
                const sp = doc.splitTextToSize(t, 170);
                doc.text(sp, 18, yPos); yPos += (sp.length*5)+2;
            } else {
                const sp = doc.splitTextToSize(line.replace(/\*\*/g,''), 180);
                doc.text(sp, 14, yPos); yPos += (sp.length*5)+2;
            }
        }
        if (inTable && tableBuffer.length) renderMdTable(doc, tableBuffer, yPos);
        return doc.output('arraybuffer');
    }

    function renderMdTable(doc, rows, startY) {
        const body = []; let head = [];
        rows.forEach((row, i) => {
            const cols = row.split('|').map(c=>c.trim()).filter(c=>c!=='');
            if (row.includes('---')) return;
            if (i===0) head.push(cols); else body.push(cols);
        });
        if (!head.length) return;
        doc.autoTable({ startY, head, body, theme:'striped', headStyles:{fillColor:[50,50,50],fontSize:9}, styles:{fontSize:8,cellPadding:2}, margin:{left:14,right:14} });
    }

    async function mergePdfs(originalBytes, analysisBytes, filename) {
        const { PDFDocument } = PDFLib;
        const [pdf1, pdf2] = await Promise.all([PDFDocument.load(originalBytes), PDFDocument.load(analysisBytes)]);
        const merged = await PDFDocument.create();
        (await merged.copyPages(pdf1, pdf1.getPageIndices())).forEach(p => merged.addPage(p));
        (await merged.copyPages(pdf2, pdf2.getPageIndices())).forEach(p => merged.addPage(p));
        const bytes = await merged.save();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
        a.download = filename.replace('.pdf','') + '_Analyzed.pdf';
        a.click();
    }

    function toBase64(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]);
            r.onerror = rej;
            r.readAsDataURL(file);
        });
    }

    async function callGemini(apiKey, prompt, base64Pdf) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const payload = { contents:[{ parts:[{text:prompt},{inline_data:{mime_type:'application/pdf',data:base64Pdf}}] }] };
        let attempt = 0;
        while (attempt < 3) {
            const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
            if (res.status === 429) { attempt++; await new Promise(r=>setTimeout(r, 2000*Math.pow(2,attempt))); continue; }
            if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'API Error'); }
            const d = await res.json();
            return d.candidates[0].content.parts[0].text;
        }
        throw new Error('Gemini rate limit. Try again later.');
    }

    // ── BOOT ───────────────────────────────────────────────────────────────────
    renderUI();
    loadFromDB();
}
