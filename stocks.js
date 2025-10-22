const searchBtn = document.getElementById("searchBtn");
const searchInput = document.getElementById("searchInput");
const stockResults = document.getElementById("stockResults");

const simulatedStocks = [
  { id: 'RELIANCE', name: 'Reliance Industries Ltd.', price: 1466.80, change: '+3.53%' },
  { id: 'ICICIBANK', name: 'ICICI Bank Ltd.', price: 1390.30, change: '-3.22%' },
  { id: 'HDFCBANK', name: 'HDFC Bank Ltd.', price: 1002.95, change: '+0.04%' },
  { id: 'BHARTIARTL', name: 'Bharti Airtel Ltd.', price: 2051.50, change: '+1.96%' },
  { id: 'TCS', name: 'Tata Consultancy Services', price: 3300.25, change: '+0.88%' },
  { id: 'INFY', name: 'Infosys Ltd.', price: 1720.10, change: '-0.45%' },
  { id: 'LT', name: 'Larsen & Toubro', price: 3100.00, change: '+0.12%' },
  { id: 'SBIN', name: 'State Bank of India', price: 640.50, change: '+0.30%' },
  { id: 'AXISBANK', name: 'Axis Bank Ltd.', price: 930.10, change: '+1.10%' },
  { id: 'KOTAKBANK', name: 'Kotak Mahindra Bank', price: 1700.75, change: '-0.22%' },
  { id: 'ITC', name: 'ITC Ltd.', price: 450.00, change: '+0.60%' },
  { id: 'MARUTI', name: 'Maruti Suzuki India', price: 9200.90, change: '+0.15%' },
  { id: 'BAJAJ-AUTO', name: 'Bajaj Auto Ltd.', price: 3700.40, change: '+1.05%' },
  { id: 'JSWSTEEL', name: 'JSW Steel Ltd.', price: 710.20, change: '-0.10%' },
  { id: 'NESTLEIND', name: 'Nestle India Ltd.', price: 24500.00, change: '+0.90%' },
];

// Five real tickers you can change; Alpha Vantage will be used to fetch data when API key is set in config.js
const realTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];

// state for real data
const realDataCache = {};
let realIndex = 0; // rotates which real ticker to fetch next
let refreshIntervalId = null;
let resumeTimeoutId = null;
const realFetchTimestamps = {}; // ticker -> last fetch ms
// mini-sparkline animation state
const MINI_WINDOW = 12;
const miniDataMap = {};
let miniAnimIntervalId = null;
const miniAnimLocks = {};
const miniAnimCounters = {};
// baseline price per ticker used to compute % change shown on the card
const initialPriceMap = {};
// maximum percent displayed (absolute). If computed P/L% exceeds this, show a clipped label and full value in title.
const MAX_DISPLAY_PCT = 25; // percent (clamped per request)

// generate a smooth, realistic-looking price series around a baseline
function generateSimulatedSeries(baseline, length = 48) {
  const out = [];
  // parameters for smoothing/curvature
  const amp = 0.006 + Math.random() * 0.012; // sine amplitude
  const freq = 0.06 + Math.random() * 0.06; // sine frequency
  const noiseScale = baseline * (0.0015 + Math.random() * 0.004); // absolute noise
  let prev = baseline * (0.992 + Math.random() * 0.016);
  // low-pass coefficient
  const alpha = 0.12 + Math.random() * 0.08;
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const sine = Math.sin(i * freq + Math.random() * Math.PI * 2) * amp; // gentle wave
    const trend = baseline * (1 + sine);
    const noise = (Math.random() - 0.5) * 2 * noiseScale;
    const candidate = trend + noise;
    // low-pass filter toward candidate for smoothness
    prev = prev * (1 - alpha) + candidate * alpha;
    out.push(+prev.toFixed(2));
  }
  return out;
}
// simulated main-chart animator
let simMainIntervalId = null;
let simMainData = null;
let simMainName = null;
let simMainTickerId = null;
// API key handling (localStorage)
const STORAGE_KEY = 'ALPHA_VANTAGE_API_KEY_V1';
function getSavedKey(){ return window.localStorage.getItem(STORAGE_KEY) || (window.ALPHA_VANTAGE_API_KEY || '').trim(); }
function saveKey(k){ try{ window.localStorage.setItem(STORAGE_KEY, k); }catch(e){} window.ALPHA_VANTAGE_API_KEY = k; }

function renderStockList(list) {
  if (!stockResults) return;
  stockResults.innerHTML = list.map(s => `
    <div class="stock-card" data-id="${s.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <img class="logo-sm" src="assets/logos/${s.id}.svg" onerror="this.onerror=null;this.src='assets/logos/placeholder.svg'" alt="${s.id}">
        <div style="flex:1">
          <div class="sym">${s.id}</div>
          <div class="name">${s.name}</div>
        </div>
        <div class="mini-chart"><canvas id="mini-${s.id}" width="160" height="60"></canvas></div>
      </div>
      <div style="margin-top:8px">
        <div class="price" id="price-${s.id}">${s.price}</div>
  <div class="change" id="change-${s.id}">${s.change}</div>
        <div class="pnl" id="pnl-${s.id}">P/L: -</div>
        <div class="card-actions" style="margin-top:8px;display:flex;gap:8px">
          <button class="buy-btn" data-id="${s.id}">Buy</button>
          <button class="sell-btn" data-id="${s.id}">Sell</button>
        </div>
      </div>
    </div>
  `).join('');

  // initialize mini data arrays for sliding animation
  list.forEach(s => {
    const id = s.id;
      if (!miniDataMap[id]) {
      // seed from real cache if available, else from s.price or random base
      let seed = 0;
      if (realDataCache[id] && Array.isArray(realDataCache[id].data) && realDataCache[id].data.length) {
        const arr = realDataCache[id].data.slice(-MINI_WINDOW);
        miniDataMap[id] = arr.slice();
          // set baseline if not present
          if (!initialPriceMap[id]) initialPriceMap[id] = arr[0] || arr[arr.length-1] || 0;
        return;
      } else if (typeof s.price === 'number') seed = s.price;
      else seed = 100 + Math.round(Math.random() * 200);
      const arr = [];
      let cur = seed * (0.985 + Math.random() * 0.03);
      for (let i = 0; i < MINI_WINDOW; i++) {
        cur = +(cur * (0.995 + Math.random() * 0.01)).toFixed(2);
        arr.push(cur);
      }
      miniDataMap[id] = arr;
      if (!initialPriceMap[id]) initialPriceMap[id] = (typeof s.price === 'number' ? s.price : (arr[0] || arr[arr.length-1] || seed));
      // seed a longer, smoother simulated history for the API-shaped cache
      if (!realDataCache[id]) {
        const baseline = typeof s.price === 'number' ? s.price : arr[arr.length-1];
        const data = generateSimulatedSeries(baseline, 48);
        const now = Date.now();
        const labels = data.map((_, i) => new Date(now - (48 - i) * 60000).toISOString());
        realDataCache[id] = { labels, data: data.slice(), last: data[data.length - 1] };
        // also ensure miniDataMap has the last MINI_WINDOW points
        miniDataMap[id] = data.slice(-MINI_WINDOW);
      }
    }
  });

  // start the shared mini-chart animation loop (one interval for all cards)
  if (!miniAnimIntervalId && typeof startMiniAnimations === 'function') startMiniAnimations();

  // render small sparklines for simulated stocks (if chart helpers available)
  list.forEach(s => {
    // only for simulated stocks (objects with name property and numeric price)
    if (!s || typeof s.price !== 'number') return;
    const canvas = document.getElementById(`mini-${s.id}`);
    if (!canvas) return;
    // prefer cache-shaped data when available (simulated entries are seeded into realDataCache)
    const cached = realDataCache[s.id];
    if (cached && Array.isArray(cached.data) && cached.data.length) {
      const data = cached.data.slice(-8);
      const labels = Array(data.length).fill('');
      if (typeof renderSparklineOn === 'function') renderSparklineOn(canvas, s.id, data);
      else if (typeof renderChartOn === 'function') renderChartOn(canvas, s.id, data, labels);
    } else {
      // fallback small random walk
      const base = s.price;
      const data = [];
      let cur = base * (0.985 + Math.random() * 0.03);
      for (let i = 0; i < 8; i++) {
        cur = +(cur * (0.995 + Math.random() * 0.01)).toFixed(2);
        data.push(cur);
      }
      const labels = Array(data.length).fill('');
      if (typeof renderSparklineOn === 'function') renderSparklineOn(canvas, s.id, data);
      else if (typeof renderChartOn === 'function') renderChartOn(canvas, s.id, data, labels);
    }
  });

  // attach click handlers (cards are clickable)
  stockResults.querySelectorAll('.stock-card').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      // enter focused single-stock view
      enterFocusedView(id);
      // find simulated first
      let s = simulatedStocks.find(x => x.id === id);
      if (s) {
        if (typeof renderChart === 'function') {
          const base = Math.round(s.price);
          // generate a slightly longer series for the main chart
          const data = [base - 8, base - 4, base - 2, base, base + 6, base + 12, base + 8, base + 4];
            renderChart(s.name, data);
            // start a small animator to make the main chart go up/down for simulated stocks
            startSimulatedMainAnimation(s.id, data);
          // show main chart container when focused
          const chartWrap = document.querySelector('.chart-container');
          if (chartWrap) chartWrap.style.display = 'block';
        }
        return;
      }
      // otherwise it might be a real ticker id (e.g. "AAPL")
      s = realTickers.find(t => t === id);
      if (s) {
        if (typeof fetchAndRenderRealTicker === 'function') fetchAndRenderRealTicker(s);
        else if (typeof window.fetchAndRenderRealTicker === 'function') window.fetchAndRenderRealTicker(s);
      }
    });
  });

  // wire buy/sell handlers (stop propagation so they don't trigger focus)
  // Use event delegation so buy/sell work on cloned/focused cards and after re-renders
  if (!stockResults.dataset.buySellDelegated) {
    stockResults.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn || !stockResults.contains(btn)) return;
      if (btn.classList.contains('buy-btn')) {
        ev.stopPropagation();
        handleBuy(btn.dataset.id);
      } else if (btn.classList.contains('sell-btn')) {
        ev.stopPropagation();
        handleSell(btn.dataset.id);
      }
    });
    stockResults.dataset.buySellDelegated = '1';
  }

  // after rendering all cards, update P/L for each (simulated and real)
  list.forEach(s => {
    try { updatePnl(s.id, getPositionFor(s.id)); } catch (e) {}
  });
}

// Aggregate trades for a ticker into a net position using FIFO reduction
function getPositionFor(ticker) {
  const key = 'SW_PORTFOLIO_POSITIONS_V1';
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const arr = JSON.parse(raw).filter(r => r && r.id === ticker).sort((a,b)=> (a.created||0)-(b.created||0));
  if (!arr.length) return null;
  // maintain buy lots
  const lots = [];
  for (const rec of arr) {
    const q = Number(rec.qty) || 0;
    const p = Number(rec.avgPrice) || 0;
    if (q > 0) {
      lots.push({ qty: q, price: p });
    } else if (q < 0) {
      // sell: consume from lots FIFO
      let toSell = -q;
      while (toSell > 0 && lots.length) {
        const lot = lots[0];
        if (lot.qty > toSell) {
          lot.qty -= toSell;
          toSell = 0;
        } else {
          toSell -= lot.qty;
          lots.shift();
        }
      }
      // if sells exceed buys, ignore excess (no short tracking)
    }
  }
  const netQty = lots.reduce((s, l) => s + l.qty, 0);
  if (netQty <= 0) return null;
  const totalCost = lots.reduce((s, l) => s + l.qty * l.price, 0);
  const avgPrice = totalCost / netQty;
  return { qty: netQty, avgPrice };
}

function handleBuy(id) {
  try {
    const qty = parseFloat(prompt(`Enter quantity to BUY for ${id}`, '1')) || 0;
    if (!qty || qty <= 0) return alert('Invalid quantity');
    // use latest chart-derived price as trade price
    const price = getLatestPrice(id) || 0;
    if (!price || price <= 0) return alert('Could not determine current price. Try again later.');
    const cost = qty * price;
    const balance = (typeof window.getVcash === 'function') ? window.getVcash() : (window.VCASH || 0);
    if (balance < cost) return alert('Insufficient VCASH. You have ₹' + balance.toFixed(2));
    if (typeof window.changeVcash === 'function') window.changeVcash(-cost);
    const key = 'SW_PORTFOLIO_POSITIONS_V1';
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
  arr.push({ id, qty, avgPrice: price, created: Date.now() });
    window.localStorage.setItem(key, JSON.stringify(arr));
    try { updatePnl(id, getPositionFor(id)); } catch (e) {}
    const newBal = (typeof window.getVcash === 'function') ? window.getVcash() : (window.VCASH || 0);
    alert('Bought ' + qty + ' of ' + id + ' at ' + price + '. New VCASH: ₹' + newBal.toFixed(2));
  } catch (e) { console.error(e); alert('Failed to save position'); }
}

function handleSell(id) {
  try {
    const qty = parseFloat(prompt(`Enter quantity to SELL for ${id}`, '1')) || 0;
    if (!qty || qty <= 0) return alert('Invalid quantity');
    // use latest chart-derived price as trade price
    const price = getLatestPrice(id) || 0;
    if (!price || price <= 0) return alert('Could not determine current price. Try again later.');
    const revenue = qty * price;
    if (typeof window.changeVcash === 'function') window.changeVcash(revenue);
    const key = 'SW_PORTFOLIO_POSITIONS_V1';
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
  arr.push({ id, qty: -Math.abs(qty), avgPrice: price, created: Date.now() });
    window.localStorage.setItem(key, JSON.stringify(arr));
    try { updatePnl(id, getPositionFor(id)); } catch (e) {}
    const newBal = (typeof window.getVcash === 'function') ? window.getVcash() : (window.VCASH || 0);
    alert('Sold ' + qty + ' of ' + id + '. New VCASH: ₹' + newBal.toFixed(2));
  } catch (e) { console.error(e); alert('Failed to save position'); }
}

// Only wire up search handlers if the elements exist on the page
if (searchBtn && searchInput && stockResults) {
  function setLoading(isLoading) {
    if (isLoading) {
      searchBtn.disabled = true;
      searchBtn.textContent = "Searching...";
    } else {
      searchBtn.disabled = false;
      searchBtn.textContent = "Search";
    }
  }

  function doSearch() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      // empty search: keep the real cards visible and show a hint in results
      showTopRealsHint();
      // hide main chart
      const chartWrap = document.querySelector('.chart-container');
      if (chartWrap) chartWrap.style.display = 'none';
      return;
    }
    setLoading(true);

    // Simulated async search
    setTimeout(() => {
      const matchSim = simulatedStocks.filter(s => s.name.toLowerCase().includes(query));
      const matchReal = realTickers.filter(t => t.toLowerCase().includes(query)).map(t => ({ id: t, name: t, price: '-', change: '-' }));
      const match = [...matchSim, ...matchReal];

      if (match && match.length) {
        renderStockList(match);
        // auto-render first match's chart: prefer real if present
        const first = match[0];
        if (realTickers.includes(first.id)) fetchAndRenderRealTicker(first.id);
        else if (typeof renderChart === "function") {
          const base = Math.round(first.price);
          const data = [base - 5, base - 2, base + 1, base + 10, base + 6];
          renderChart(first.name, data);
        }
      } else {
        stockResults.innerHTML = `<p>No stock found. Try searching "Simulated 15".</p>`;
        if (typeof clearChart === "function") clearChart();
      }

      setLoading(false);
    }, 350);
  }

  searchBtn.addEventListener("click", doSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });

  // initial render: show top 5 real tickers first in the results grid
  const topReals = realTickers.map(t => ({ id: t, name: t, price: '-', change: '-' }));
  // render the combined list with real tickers first then simulated ones
  renderStockList(topReals.concat(simulatedStocks));

  // If no API key or until data arrives, render a small placeholder sparkline for each real card
  // ensure mini-charts for the top real tickers are present (they are rendered as part of renderStockList)
  // if no API key, create placeholder sparklines for each top real
  if (!window.ALPHA_VANTAGE_API_KEY || !window.ALPHA_VANTAGE_API_KEY.trim()) {
    realTickers.forEach(ticker => {
      const canvas = document.getElementById(`mini-${ticker}`);
      const priceEl = document.querySelector(`.stock-card[data-id="${ticker}"] .price`);
      if (canvas) {
        const base = 100 + Math.round(Math.random() * 200);
        const data = Array.from({ length: 8 }, (_, i) => +(base * (0.98 + Math.random() * 0.04)).toFixed(2));
        if (typeof renderChartOn === 'function') renderChartOn(canvas, ticker, data, Array(data.length).fill(''));
        if (priceEl) priceEl.textContent = data[data.length - 1].toFixed(2);
      }
    });
  }

  // expose a small console helper to manually fetch and render a real ticker (for debug)
  window.fetchTickerNow = async function(ticker) {
    if (!ticker) return console.warn('ticker required');
    try {
      if (typeof fetchAndRenderRealTicker === 'function') {
        await fetchAndRenderRealTicker(ticker);
        console.log('fetched', ticker);
      } else {
        console.warn('fetchAndRenderRealTicker not available');
      }
    } catch (e) { console.error(e); }
  };

  // debugging helper: dump positions and cached data for a ticker
  window.dumpTradingState = function(ticker) {
    try {
      const key = 'SW_PORTFOLIO_POSITIONS_V1';
      const raw = window.localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      console.log('Positions for', ticker, arr.filter(r=>r.id===ticker));
      console.log('realDataCache entry', realDataCache[ticker]);
      console.log('miniDataMap entry', miniDataMap[ticker]);
      console.log('initialPriceMap', initialPriceMap[ticker]);
    } catch (e) { console.error(e); }
  };

  // Debug panel: shows live price, position and P/L for a selected ticker
  let debugPanelEl = null;
  let debugPanelInterval = null;
  function createDebugPanel() {
    if (debugPanelEl) return debugPanelEl;
    const el = document.createElement('div');
    el.id = 'debug-panel';
    el.style.position = 'fixed';
    el.style.right = '12px';
    el.style.bottom = '12px';
    el.style.width = '300px';
    el.style.maxWidth = 'calc(100% - 24px)';
    el.style.background = 'rgba(20,20,24,0.95)';
    el.style.color = '#ddd';
    el.style.border = '1px solid rgba(255,255,255,0.06)';
    el.style.padding = '10px';
    el.style.borderRadius = '8px';
    el.style.zIndex = 9999;
    el.style.fontSize = '13px';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>Debug</strong>
        <button id="debug-close" style="background:#222;border:1px solid #333;color:#fff;padding:4px 6px;border-radius:4px">×</button>
      </div>
      <div style="margin-bottom:8px">
        <select id="debug-ticker" style="width:100%;padding:6px;border-radius:4px;background:#111;color:#fff;border:1px solid #333"></select>
      </div>
      <div id="debug-body">
        <div>Latest price: <span id="debug-latest">-</span></div>
        <div>Position: <span id="debug-pos">-</span></div>
        <div>P/L: <span id="debug-pl">-</span></div>
        <div style="margin-top:6px;font-size:11px;color:#aaa">Open DevTools to see console debug logs.</div>
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
        <input id="debug-shock-amt" type="number" value="-50" style="width:80px;padding:6px;border-radius:4px;background:#111;color:#fff;border:1px solid #333" />
        <button id="debug-shock-btn" style="flex:1;padding:6px;border-radius:4px;background:#7a1f1f;color:#fff;border:none">Apply Shock</button>
      </div>
    `;
    document.body.appendChild(el);
    document.getElementById('debug-close').addEventListener('click', () => toggleDebugPanel(false));
    const sel = el.querySelector('#debug-ticker');
    const all = simulatedStocks.map(s=>s.id).concat(realTickers);
    all.forEach(t=>{ const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o); });
    sel.value = all[0] || '';
    debugPanelEl = el;
    // shock control wiring
    const shockBtn = el.querySelector('#debug-shock-btn');
    const shockAmtInput = el.querySelector('#debug-shock-amt');
    shockBtn && shockBtn.addEventListener('click', () => {
      const t = sel.value; if (!t) return;
      const pct = parseFloat(shockAmtInput.value) || -50;
      applyShock(t, pct);
    });
    return el;
  }

  function updateDebugPanel() {
    if (!debugPanelEl) return;
    const ticker = debugPanelEl.querySelector('#debug-ticker').value;
    if (!ticker) return;
    const latest = getLatestPrice(ticker) || 0;
    const pos = getPositionFor(ticker);
    document.getElementById('debug-latest').textContent = latest.toFixed(2);
    document.getElementById('debug-pos').textContent = pos ? `${pos.qty} @ ₹${pos.avgPrice.toFixed(2)}` : 'none';
    if (pos) {
      const val = (latest - pos.avgPrice) * pos.qty;
      const pct = pos.avgPrice ? ((latest - pos.avgPrice) / pos.avgPrice) * 100 : 0;
      document.getElementById('debug-pl').textContent = `${val >=0 ? '+' : '-'}₹${Math.abs(val).toFixed(2)} (${val>=0?'+':''}${pct.toFixed(2)}%)`;
      document.getElementById('debug-pl').style.color = val>=0 ? '#8fd19e' : '#f77';
    } else {
      document.getElementById('debug-pl').textContent = '-';
      document.getElementById('debug-pl').style.color = '';
    }
  }

  window.toggleDebugPanel = function(show=true) {
    if (!debugPanelEl) createDebugPanel();
    if (!show) {
      if (debugPanelEl) debugPanelEl.remove();
      debugPanelEl = null;
      if (debugPanelInterval) { clearInterval(debugPanelInterval); debugPanelInterval = null; }
      return;
    }
    if (debugPanelInterval) return;
    debugPanelInterval = setInterval(updateDebugPanel, 700);
    updateDebugPanel();
  };

  // auto-open debug panel for you
  window.toggleDebugPanel(true);

  // simulate a price shock (pct is e.g. -50 for -50%) - mutates cache and updates UI
  function applyShock(ticker, pct) {
    try {
      if (!ticker) return;
      if (!realDataCache[ticker] || !Array.isArray(realDataCache[ticker].data)) {
        alert('Ticker has no cached series to shock');
        return;
      }
      const factor = 1 + pct / 100;
      const data = realDataCache[ticker].data.map(v => +((v * factor).toFixed(2)));
      realDataCache[ticker].data = data;
      realDataCache[ticker].last = data[data.length - 1];
      // sync mini and DOM
      miniDataMap[ticker] = data.slice(-MINI_WINDOW);
      const canvas = document.getElementById(`mini-${ticker}`);
      if (canvas && typeof renderSparklineOn === 'function') renderSparklineOn(canvas, ticker, miniDataMap[ticker]);
      const priceEl = document.getElementById(`price-${ticker}`) || document.querySelector(`.stock-card[data-id="${ticker}"] .price`);
      if (priceEl) priceEl.textContent = realDataCache[ticker].last.toFixed(2);
      // update percent and pnl
      try { updatePnl(ticker, getPositionFor(ticker)); } catch(e) {}
      const changeEl = document.getElementById(`change-${ticker}`) || document.querySelector(`.stock-card[data-id="${ticker}"] .change`);
      const base = initialPriceMap[ticker] || data[0] || realDataCache[ticker].last;
      const pctNow = base ? ((realDataCache[ticker].last - base) / base) * 100 : 0;
      if (changeEl) {
        const clippedNow = Math.abs(pctNow) > MAX_DISPLAY_PCT;
        const dispNow = clippedNow ? (pctNow > 0 ? MAX_DISPLAY_PCT : -MAX_DISPLAY_PCT) : pctNow;
        changeEl.textContent = `${dispNow >= 0 ? '+' : '-'}${Math.abs(dispNow).toFixed(2)}%`;
        changeEl.title = clippedNow ? `Full: ${pctNow.toFixed(2)}%` : `Change: ${pctNow.toFixed(2)}%`;
        changeEl.style.color = pctNow>=0? '#8fd19e' : '#f77';
      }
      console.log('Applied shock', ticker, pct, '-> last', realDataCache[ticker].last);
    } catch (e) { console.error(e); alert('Failed to apply shock'); }
  }
  window.applyShock = applyShock;

  // Wire API key input/save UI
  const apiInput = document.getElementById('apiKeyInput');
  const saveBtn = document.getElementById('saveKeyBtn');
  if (apiInput) {
    apiInput.value = getSavedKey() || '';
    saveBtn && saveBtn.addEventListener('click', () => {
      const v = apiInput.value.trim();
      if (!v) return alert('Enter an API key');
      saveKey(v);
      alert('API key saved to localStorage');
    });
  }

  function updatePnl(ticker, position) {
    const pnlEl = document.getElementById(`pnl-${ticker}`);
    const price = getLatestPrice(ticker) || 0;
    if (!pnlEl) return;
    if (!position) { pnlEl.textContent = 'P/L: -'; pnlEl.style.color = ''; return; }
  const val = (price - position.avgPrice) * position.qty;
  const pct = position.avgPrice ? ((price - position.avgPrice) / position.avgPrice) * 100 : 0;
  const sign = val >= 0 ? '+' : '-';
  // debug: log values to help diagnose fixed P/L issues
  try { console.debug('[P/L]', ticker, { price, avgPrice: position.avgPrice, qty: position.qty, val: +val.toFixed(2), pct: +pct.toFixed(2) }); } catch(e) {}
  // clamp percent for display so extremely large values don't mislead UX
  const absPct = Math.abs(pct);
  let displayPct = pct;
  let clipped = false;
  if (absPct > MAX_DISPLAY_PCT) { clipped = true; displayPct = (pct > 0 ? MAX_DISPLAY_PCT : -MAX_DISPLAY_PCT); }
  const pctText = `${displayPct >= 0 ? '+' : '-'}${Math.abs(displayPct).toFixed(2)}%${clipped? ' (±'+MAX_DISPLAY_PCT+'% clipped)':''}`;
  pnlEl.textContent = `P/L: ${sign}₹${Math.abs(val).toFixed(2)} (${pctText})`;
  pnlEl.title = clipped ? `Full P/L%: ${pct.toFixed(2)}%` : `P/L%: ${pct.toFixed(2)}%`;
  pnlEl.style.color = val >= 0 ? '#8fd19e' : '#f77';
  }

// try to get the most authoritative latest price for a ticker from chart data
function getLatestPrice(ticker) {
  // prefer mini sparkline data when available
  try {
    // prefer realDataCache (API-shaped) when present
    if (realDataCache[ticker]) {
      if (typeof realDataCache[ticker].last !== 'undefined') return Number(realDataCache[ticker].last);
      if (Array.isArray(realDataCache[ticker].data) && realDataCache[ticker].data.length) return Number(realDataCache[ticker].data[realDataCache[ticker].data.length - 1]);
    }
    if (miniDataMap[ticker] && miniDataMap[ticker].length) return Number(miniDataMap[ticker][miniDataMap[ticker].length - 1]);
    // if the main simulated chart is for this ticker, use its last point
    if (simMainTickerId && simMainTickerId === ticker && Array.isArray(simMainData) && simMainData.length) return Number(simMainData[simMainData.length - 1]);
    // fallback to DOM price element
    const priceEl = document.getElementById(`price-${ticker}`) || document.querySelector(`.stock-card[data-id="${ticker}"] .price`);
    if (priceEl) return parseFloat((priceEl.textContent||'').replace(/[^0-9.\-]/g, '')) || 0;
  } catch (e) { console.error(e); }
  return 0;
}

  // initially render first simulated stock chart
  if (simulatedStocks.length && typeof renderChart === 'function') {
    const s = simulatedStocks[0];
    const base = Math.round(s.price);
    const data = [base - 5, base - 2, base + 1, base + 10, base + 6];
    // don't render main chart by default (only on click)
    // renderChart(s.name, data);
  }

  // Focused view helpers
  function enterFocusedView(id) {
    // hide all other cards, render a single focused card in results
    const all = Array.from(stockResults.children);
    const target = all.find(c => c.dataset && c.dataset.id === id);
    if (!target) return;
    // save current contents so we can restore
    stockResults.dataset._backup = stockResults.innerHTML;
    stockResults.innerHTML = '';
    const focused = target.cloneNode(true);
    focused.classList.add('focused-card');
    // add back button
    const btn = document.createElement('button');
    btn.id = 'backBtn';
    btn.textContent = 'Back';
    btn.addEventListener('click', () => exitFocusedView());
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.appendChild(btn);
    focused.appendChild(controls);
    stockResults.appendChild(focused);
    // show chart container
    const chartWrap = document.querySelector('.chart-container');
    if (chartWrap) chartWrap.style.display = 'block';
  }

  function exitFocusedView() {
    // restore previous html and hide main chart
    if (stockResults.dataset._backup) {
      stockResults.innerHTML = stockResults.dataset._backup;
      delete stockResults.dataset._backup;
      // re-run renderStockList to reattach handlers and mini-charts
      renderStockList(simulatedStocks.concat(realTickers.map(t => ({ id: t, name: t, price: '-', change: '-' }))));
    }
    const chartWrap = document.querySelector('.chart-container');
    if (chartWrap) chartWrap.style.display = 'none';
    // clear main chart
    if (typeof clearChart === 'function') clearChart();
    // stop any simulated main-chart animator
    stopSimulatedMainAnimation();
  }

// simulated main chart helpers: shift window and randomly nudge values so the chart appears to move
function startSimulatedMainAnimation(idOrName, initialData) {
  try {
    stopSimulatedMainAnimation();
    simMainName = idOrName;
    simMainTickerId = idOrName;
    // prefer using the cached API-shaped data if present so we update the same source
    if (realDataCache[idOrName] && Array.isArray(realDataCache[idOrName].data) && realDataCache[idOrName].data.length) {
      simMainData = realDataCache[idOrName].data.slice();
    } else {
      simMainData = Array.isArray(initialData) ? initialData.slice() : [100, 102, 101, 103];
    }
    let tick = 0;
    const phase = Math.random() * Math.PI * 2;
    // interval drives gentle tail nudging to create a curved front (bend)
    simMainIntervalId = setInterval(() => {
      try {
        tick += 1;
        const last = simMainData[simMainData.length - 1] || 100;
        // combine a very slow sine + tiny noise to form a soft target
        const freq = 0.06;
        const amp = 0.006; // ~0.6%
        const sine = Math.sin(tick * freq + phase) * amp;
        const noise = (Math.random() - 0.5) * 0.002;
        const target = +(last * (1 + sine + noise)).toFixed(2);
        // nudge the last few points toward target to create a smooth bend
        nudgeTail(simMainData, target, 6, 0.14);
        // occasionally advance the window by pushing a new point
        const pushEvery = 3;
        if (tick % pushEvery === 0) {
          simMainData.push(simMainData[simMainData.length - 1]);
          while (simMainData.length > 24) simMainData.shift();
        }
        if (typeof renderChart === 'function') {
          renderChart(simMainName, simMainData);
          // write back into cache if present so P/L/readers use the same moving data
          if (simMainTickerId && realDataCache[simMainTickerId]) {
            realDataCache[simMainTickerId].data = simMainData.slice();
            realDataCache[simMainTickerId].last = simMainData[simMainData.length - 1];
            // sync mini view
            miniDataMap[simMainTickerId] = simMainData.slice(-MINI_WINDOW);
            // update DOM price for the card
            const priceEl = document.getElementById(`price-${simMainTickerId}`) || document.querySelector(`.stock-card[data-id="${simMainTickerId}"] .price`);
            if (priceEl) priceEl.textContent = realDataCache[simMainTickerId].last.toFixed(2);
          }
          try { if (simMainTickerId) updatePnl(simMainTickerId, getPositionFor(simMainTickerId)); } catch(e) {}
        }
      } catch (inner) { console.error(inner); }
    }, 550);
  } catch (e) { console.error(e); }
}

function stopSimulatedMainAnimation() {
  try { if (simMainIntervalId) { clearInterval(simMainIntervalId); simMainIntervalId = null; simMainData = null; simMainName = null; } } catch(e){}
}

  // Real data fetcher and renderer
  async function fetchRealTicker(ticker) {
    if (!window.ALPHA_VANTAGE_API_KEY || window.ALPHA_VANTAGE_API_KEY.trim() === '') return { error: 'NO_KEY' };
    // simple throttle: don't fetch the same ticker more than once every 12s
    const now = Date.now();
    const last = realFetchTimestamps[ticker] || 0;
    if (now - last < 12000) return { error: 'TOO_SOON' };
    realFetchTimestamps[ticker] = now;
    try {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(ticker)}&interval=5min&apikey=${window.ALPHA_VANTAGE_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) return { error: 'HTTP', status: res.status };
      const json = await res.json();
      // detect rate-limit or error messages from Alpha Vantage
      if (json.Note) return { error: 'RATE_LIMIT', message: json.Note };
      if (json['Error Message']) return { error: 'API_ERROR', message: json['Error Message'] };
      const series = json['Time Series (5min)'] || json['Time Series (1min)'];
      if (!series) return { error: 'NO_DATA' };
      const labels = Object.keys(series).slice(0, 10).reverse();
      const data = labels.map(l => parseFloat(series[l]['4. close']));
      return { labels, data };
    } catch (e) { return { error: 'EXCEPTION', message: e.message }; }
  }

  async function fetchAndRenderRealTicker(ticker) {
    // use cache if available
    if (realDataCache[ticker]) {
      const { labels, data, last } = realDataCache[ticker];
      const mini = document.getElementById(`mini-${ticker}`);
      if (mini && typeof renderSparklineOn === 'function') renderSparklineOn(mini, ticker, data.slice(-8));
      const priceEl = document.querySelector(`.stock-card[data-id="${ticker}"] .price`);
      if (priceEl && last) priceEl.textContent = last.toFixed(2);
    }
    const fetched = await fetchRealTicker(ticker);
    const priceEl = document.querySelector(`.stock-card[data-id="${ticker}"] .price`);
    const mini = document.getElementById(`mini-${ticker}`);
    if (!fetched) {
      if (priceEl) priceEl.textContent = '-';
      return;
    }
    if (fetched.error) {
      // show a clear state on the card instead of inserting into results
      if (priceEl) {
        if (fetched.error === 'NO_KEY') priceEl.textContent = 'API key missing';
        else if (fetched.error === 'RATE_LIMIT') priceEl.textContent = 'Rate limit';
        else if (fetched.error === 'TOO_SOON') priceEl.textContent = '-';
        else priceEl.textContent = '-';
        priceEl.style.color = fetched.error === 'RATE_LIMIT' ? '#f6b26b' : '';
      }
      // if rate limit, pause rotation briefly to avoid flooding
      if (fetched.error === 'RATE_LIMIT') {
        if (refreshIntervalId) { clearInterval(refreshIntervalId); refreshIntervalId = null; }
        if (resumeTimeoutId) clearTimeout(resumeTimeoutId);
        resumeTimeoutId = setTimeout(() => {
          // resume rotation after delay
          startRealRotation();
          resumeTimeoutId = null;
        }, 60000); // wait 60s before resuming
      }
      return;
    }
    // successful fetch - update mini sparkline and price in the grid
    realDataCache[ticker] = { labels: fetched.labels, data: fetched.data, last: fetched.data[fetched.data.length - 1] };
    if (mini) {
      if (typeof renderSparklineOn === 'function') renderSparklineOn(mini, ticker, fetched.data.slice(-8));
      else if (typeof renderChartOn === 'function') renderChartOn(mini, ticker, fetched.data.slice(-8), fetched.labels.slice(-8));
    }
    if (priceEl && fetched.data && fetched.data.length) {
      const latest = fetched.data[fetched.data.length - 1];
      priceEl.textContent = latest.toFixed(2);
      // set baseline for this ticker if missing
      if (!initialPriceMap[ticker]) initialPriceMap[ticker] = fetched.data[0] || latest;
      // update percent change
      const base = initialPriceMap[ticker] || fetched.data[0] || latest;
      const pct = base ? ((latest - base) / base) * 100 : 0;
      const changeEl = document.getElementById(`change-${ticker}`) || document.querySelector(`.stock-card[data-id="${ticker}"] .change`);
      if (changeEl) {
        const sign = pct >= 0 ? '+' : '-';
  const clipped = Math.abs(pct) > MAX_DISPLAY_PCT;
  const disp = clipped ? (pct > 0 ? MAX_DISPLAY_PCT : -MAX_DISPLAY_PCT) : pct;
  changeEl.textContent = `${disp >= 0 ? '+' : '-'}${Math.abs(disp).toFixed(2)}%`;
  changeEl.title = clipped ? `Full: ${pct.toFixed(2)}%` : `Change: ${pct.toFixed(2)}%`;
  changeEl.style.color = pct >= 0 ? '#8fd19e' : '#f77';
      }
      priceEl.style.color = '';
      try { updatePnl(ticker, getPositionFor(ticker)); } catch (e) {}
    }
  }

  // rotate real data fetches to respect rate limits; Alpha Vantage free tier is 5 requests/min
  function startRealRotation() {
    if (refreshIntervalId) clearInterval(refreshIntervalId);
    // fetch one real ticker immediately then rotate every 13s
    fetchAndRenderRealTicker(realTickers[realIndex]);
    refreshIntervalId = setInterval(() => {
      realIndex = (realIndex + 1) % realTickers.length;
      fetchAndRenderRealTicker(realTickers[realIndex]);
    }, 13000);
  }

  // expose starter so external initializers can start/stop the rotation
  window.startRealRotation = startRealRotation;

  // begin rotation only if API key is present

// helper: show top real tickers in the results area (used when search is empty)
function showTopRealsHint() {
  if (!stockResults) return;
  stockResults.innerHTML = `<p class="hint">Showing top 5 real stocks — use the search box to find more stocks.</p>`;
}

// Mini-chart animation helpers
function updateMiniCharts() {
  // for each mini array, nudge the last few points toward a computed target to create a smooth bend
  Object.keys(miniDataMap).forEach(id => {
    // Prefer API-shaped cache data when available so simulated and real tickers share the same source
    let arr = miniDataMap[id];
    let fromCache = false;
    if (realDataCache[id] && Array.isArray(realDataCache[id].data)) {
      arr = realDataCache[id].data;
      fromCache = true;
    }
    if (!arr || !arr.length) return;
    const lastIdx = arr.length - 1;
    const last = arr[lastIdx];
    const noise = (Math.random() - 0.5) * 0.006; // ±0.3%
    const target = +(last * (1 + noise)).toFixed(2);
    // nudge the tail (last few points) toward target
    nudgeTail(arr, target, 4, 0.14);
    const canvas = document.getElementById(`mini-${id}`);
    if (canvas) {
      if (typeof renderSparklineOn === 'function') renderSparklineOn(canvas, id, arr.slice(-8));
      else if (typeof renderChartOn === 'function') renderChartOn(canvas, id, arr.slice(-8), Array(arr.slice(-8).length).fill(''));
    }
    const priceEl = document.getElementById(`price-${id}`) || document.querySelector(`.stock-card[data-id="${id}"] .price`);
    if (priceEl) {
      const latest = arr[arr.length - 1];
      priceEl.textContent = latest.toFixed(2);
      // if we updated a cache-backed array, also persist last and keep miniDataMap synced
      if (fromCache) {
        realDataCache[id].last = latest;
        miniDataMap[id] = arr.slice(-MINI_WINDOW);
      }
      // update P/L display live for this ticker
      try { updatePnl(id, getPositionFor(id)); } catch (e) {}
      // update percent change relative to baseline
      const base = initialPriceMap[id] || arr[0] || latest;
      const pct = base ? ((latest - base) / base) * 100 : 0;
      const changeEl = document.getElementById(`change-${id}`) || document.querySelector(`.stock-card[data-id="${id}"] .change`);
      if (changeEl) {
        const sign = pct >= 0 ? '+' : '-';
  const clipped = Math.abs(pct) > MAX_DISPLAY_PCT;
  const disp = clipped ? (pct > 0 ? MAX_DISPLAY_PCT : -MAX_DISPLAY_PCT) : pct;
  changeEl.textContent = `${disp >= 0 ? '+' : '-'}${Math.abs(disp).toFixed(2)}%`;
  changeEl.title = clipped ? `Full: ${pct.toFixed(2)}%` : `Change: ${pct.toFixed(2)}%`;
  changeEl.style.color = pct >= 0 ? '#8fd19e' : '#f77';
      }
    }
    // occasionally advance the window to create forward motion
    miniAnimCounters[id] = (miniAnimCounters[id] || 0) + 1;
    if (miniAnimCounters[id] >= 6) {
      arr.push(arr[arr.length - 1]);
      while (arr.length > MINI_WINDOW) arr.shift();
      // if we modified a cache-backed array, write it back (already mutated in place) and sync miniDataMap
      if (fromCache) {
        realDataCache[id].data = arr.slice();
        miniDataMap[id] = arr.slice(-MINI_WINDOW);
      }
      miniAnimCounters[id] = 0;
    }
  });
}

// gently move the last `seg` points toward `target` with strength `alpha` (0..1)
function nudgeTail(arr, target, seg = 4, alpha = 0.12) {
  if (!Array.isArray(arr) || arr.length === 0) return;
  const n = arr.length;
  const startIdx = Math.max(0, n - seg);
  for (let i = startIdx; i < n; i++) {
    const t = (i - startIdx + 1) / (n - startIdx + 1); // 0..1 across the tail
    const strength = alpha * t; // tail-end stronger
    arr[i] = +(arr[i] * (1 - strength) + target * strength).toFixed(2);
  }
}

function startMiniAnimations() {
  // run at ~1s cadence for smooth motion
  miniAnimIntervalId = setInterval(() => {
    try { updateMiniCharts(); } catch(e) { console.error(e); }
  }, 900);
}

// modify doSearch earlier reference: we changed logic inside the guarded block; ensure it's accessible - re-open file to patch doSearch behavior
  // rotation not started automatically; use fetch-on-click or call startRealRotation() manually
}
