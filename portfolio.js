// Portfolio now prefers persisted user positions in localStorage.
// If none exist, show an empty state and offer a small CTA to add a demo holding.
const DEFAULT_KEY = 'SW_PORTFOLIO_POSITIONS_V1';
const demoPositions = [
  { id: 'DEMO', qty: 10, avgPrice: 10, created: Date.now() }
];

const portfolioList = document.getElementById("portfolioList");
const portfolioCanvas = document.getElementById("portfolioChart");
const REFRESH_BTN_ID = 'refreshPricesBtn';

function formatAmt(v){ return '₹' + (Number(v)||0).toFixed(2); }

function loadPositions() {
  try {
    const raw = window.localStorage.getItem(DEFAULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch (e) { return null; }
}

function savePositions(arr) {
  try { window.localStorage.setItem(DEFAULT_KEY, JSON.stringify(arr)); } catch (e) {}
}

function renderEmptyState() {
  if (!portfolioList) return;
  portfolioList.innerHTML = `
    <div class="empty-portfolio">
      <h3>No holdings yet</h3>
      <p>You haven't purchased any stocks. When you add positions they'll appear here.</p>
      <div style="margin-top:12px">
        <button id="addDemoBtn" class="add-demo">Add a demo holding</button>
      </div>
    </div>
  `;
  const btn = document.getElementById('addDemoBtn');
  if (btn) btn.addEventListener('click', () => {
    // save demo positions and re-render
    savePositions(demoPositions);
    renderPositions(demoPositions);
    renderChartFor(demoPositions);
  });
}

// compute unrealized and realized P/L from the raw trades array
function computePL(trades) {
  // returns map: id -> { qty, avgPrice, unrealized, realized }
  const result = new Map();
  const groups = (trades||[]).slice().sort((a,b)=> (a.created||0)-(b.created||0));
  for (const t of groups) {
    const id = t.id;
    if (!result.has(id)) result.set(id, { lots: [], realized: 0 });
    const entry = result.get(id);
    const q = Number(t.qty)||0;
    const p = Number(t.avgPrice)||0;
    if (q > 0) {
      entry.lots.push({ qty: q, price: p });
    } else if (q < 0) {
      // sell: consume from lots FIFO and compute realized
      let toSell = -q;
      while (toSell > 0 && entry.lots.length) {
        const lot = entry.lots[0];
        if (lot.qty > toSell) {
          // partial consume
          const realized = toSell * (p - lot.price);
          entry.realized += realized;
          lot.qty -= toSell;
          toSell = 0;
        } else {
          const realized = lot.qty * (p - lot.price);
          entry.realized += realized;
          toSell -= lot.qty;
          entry.lots.shift();
        }
      }
      // if sells exceed buys, ignore excess
    }
  }
  // summarize
  const out = {};
  for (const [id, e] of result.entries()) {
    const qty = e.lots.reduce((s,l)=> s + l.qty, 0);
    const totalCost = e.lots.reduce((s,l)=> s + l.qty * l.price, 0);
    const avg = qty ? (totalCost/qty) : 0;
    out[id] = { qty, avgPrice: avg, realized: e.realized||0 };
  }
  return out;
}

function renderPositions(list) {
  // list is the holdings summary array
  if (!portfolioList) return;
  // build a nice table
  const rows = list.map(s => `
    <tr data-id="${s.id}">
      <td>${s.id}</td>
      <td><canvas id="spark-${s.id}" class="sparkline"></canvas></td>
      <td class="qty">${s.qty}</td>
      <td class="val">${formatAmt(s.avgPrice)}</td>
      <td class="val">${formatAmt(s.marketValue)}</td>
      <td class="pnl-pos" style="color:${s.unrealized>=0? '#8fd19e' : '#f77'}">${formatAmt(s.unrealized)}</td>
      <td class="pnl-pos" style="color:${s.realized>=0? '#8fd19e' : '#f77'}">${formatAmt(s.realized)}</td>
      <td style="display:flex;gap:8px"><button class="small buy-row" data-id="${s.id}">Buy</button><button class="small sell-row" data-id="${s.id}">Sell</button></td>
    </tr>
  `).join('');

  const html = `
    <table class="portfolio-table">
      <thead><tr><th>Symbol</th><th class="qty">Qty</th><th>Avg Price</th><th>Market Value</th><th>Unrealized</th><th>Realized</th><th></th></tr></thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
  portfolioList.innerHTML = html;

  // render sparklines if helper present
  list.forEach(s => {
    const canvas = document.getElementById(`spark-${s.id}`);
    if (!canvas) return;
    // prefer cached series
    if (window.realDataCache && window.realDataCache[s.id] && Array.isArray(window.realDataCache[s.id].data)) {
      const data = window.realDataCache[s.id].data.slice(-16);
      if (typeof renderSparklineOn === 'function') renderSparklineOn(canvas, s.id, data);
      else if (typeof renderChartOn === 'function') renderChartOn(canvas, s.id, data, Array(data.length).fill(''));
    } else {
      // fallback random small walk
      const base = s.avgPrice || 100;
      const data = Array.from({length:12}, (_,i)=> +(base * (0.98 + Math.random()*0.04)).toFixed(2));
      if (typeof renderSparklineOn === 'function') renderSparklineOn(canvas, s.id, data);
      else if (typeof renderChartOn === 'function') renderChartOn(canvas, s.id, data, Array(data.length).fill(''));
    }
  });

  // wire row-level sell buttons
  // wire sell buttons to open trade modal
  portfolioList.querySelectorAll('.sell-row').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      const id = btn.dataset.id;
      openTradeModal({ symbol: id, type: 'sell' });
    });
  });
  // wire buy buttons
  portfolioList.querySelectorAll('.buy-row').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      const id = btn.dataset.id;
      openTradeModal({ symbol: id, type: 'buy' });
    });
  });
}

// Convert trade records (array of {id, qty, avgPrice}) into aggregated holdings
function aggregateHoldings(trades) {
  const map = new Map();
  (trades || []).forEach(t => {
    const id = t.id || t.name || 'UNKNOWN';
    const qty = Number(t.qty) || 0;
    const price = Number(t.avgPrice) || 0;
    if (!map.has(id)) map.set(id, { id, qty: 0, totalCost: 0 });
    const h = map.get(id);
    h.qty += qty;
    h.totalCost += qty * price;
  });
  // produce holdings with avgPrice (ignore negative-only holdings)
  const holdings = [];
  for (const [id, v] of map.entries()) {
    if (v.qty === 0) continue;
    holdings.push({ id, qty: v.qty, avgPrice: v.totalCost / v.qty, value: v.qty * (v.totalCost / v.qty) });
  }
  return holdings;
}

function renderPositions(list) {
  if (!portfolioList) return;
  portfolioList.innerHTML = list.map(s => `
    <div class="stock-item">
      <h3>${s.id}</h3>
      <p>Qty: ${s.qty} @ avg ₹${(s.avgPrice||0).toFixed(2)}</p>
      <p>Value: ₹${(s.qty * (s.avgPrice||0)).toFixed(2)}</p>
    </div>
  `).join('');
}

function renderChartFor(list) {
  if (!portfolioCanvas || typeof Chart !== 'function') return;
  const ctx = portfolioCanvas.getContext('2d');
  try { if (window.portfolioChartInstance) { window.portfolioChartInstance.destroy(); window.portfolioChartInstance = null; } } catch(e){}
  window.portfolioChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: list.map(s => s.name),
      datasets: [{ label: 'Portfolio Value', data: list.map(s => s.value), backgroundColor: '#1db954' }]
    },
    options: { scales: { x: { ticks: { color: '#fff' } }, y: { ticks: { color: '#fff' } } } }
  });
}

// Main
const persisted = loadPositions() || [];
if (!persisted || persisted.length === 0) {
  // show empty state by default
  renderEmptyState();
} else {
  // compute holdings and P/L
  const summary = computePL(persisted);
  // build holdings array
  const holdings = Object.keys(summary).map(id => ({ id, qty: summary[id].qty, avgPrice: summary[id].avgPrice, realized: summary[id].realized }));
  // attach market values using latest prices
  holdings.forEach(h => {
    const latest = (typeof window.getLatestPrice === 'function') ? window.getLatestPrice(h.id) : 0;
    h.marketValue = (h.qty||0) * (latest||0);
    h.unrealized = (latest - (h.avgPrice||0)) * (h.qty||0);
  });
  renderPositions(holdings);
  renderChartFor(holdings);
}

// wire refresh prices button (if present)
const refreshBtn = document.getElementById(REFRESH_BTN_ID);
if (refreshBtn) refreshBtn.addEventListener('click', () => {
  // Conservative per-holding refresh: call fetchAndRenderRealTicker for each holding spaced by 1.3s to avoid rate limits
  const raw = loadPositions() || [];
  const summary = computePL(raw);
  const holdings = Object.keys(summary);
  let delay = 0;
  holdings.forEach(h => {
    setTimeout(() => {
      if (typeof window.fetchAndRenderRealTicker === 'function') window.fetchAndRenderRealTicker(h);
    }, delay);
    delay += 1300; // Alpha Vantage free tier safe spacing
  });
  // re-render after finishing fetch attempts
  setTimeout(loadAndRender, delay + 600);
});

// export trades CSV
const exportBtn = document.getElementById('exportTradesBtn');
if (exportBtn) exportBtn.addEventListener('click', () => {
  try {
    const raw = loadPositions() || [];
    if (!raw.length) return alert('No trades to export');
    const header = ['id','qty','avgPrice','created'];
    const rows = raw.map(r => [r.id, r.qty, r.avgPrice, new Date(r.created||0).toISOString()].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'trades.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { console.error(e); alert('Export failed'); }
});

function loadAndRender(){
  const raw = loadPositions() || [];
  if (!raw || !raw.length) { renderEmptyState(); return; }
  const summary = computePL(raw);
  const holdings = Object.keys(summary).map(id => ({ id, qty: summary[id].qty, avgPrice: summary[id].avgPrice, realized: summary[id].realized }));
  holdings.forEach(h => {
    const latest = (typeof window.getLatestPrice === 'function') ? window.getLatestPrice(h.id) : 0;
    h.marketValue = (h.qty||0) * (latest||0);
    h.unrealized = (latest - (h.avgPrice||0)) * (h.qty||0);
  });
  renderPositions(holdings);
  // update totals and VCASH display
  const totalMarket = holdings.reduce((s, h) => s + (h.marketValue||0), 0);
  const totalRealized = holdings.reduce((s, h) => s + (h.realized||0), 0);
  const totalCost = holdings.reduce((s, h) => s + ((h.avgPrice||0) * (h.qty||0)), 0);
  const total = totalMarket + totalRealized;
  const totalEl = document.getElementById('pf-total');
  if (totalEl) totalEl.textContent = formatAmt(total);
  // overall P/L = unrealized + realized
  const overallUnreal = holdings.reduce((s,h) => s + (h.unrealized||0), 0);
  const overallReal = totalRealized;
  const overallPL = overallUnreal + overallReal;
  const plEl = document.getElementById('pf-pl');
  if (plEl) {
    const pct = totalCost ? (overallPL / totalCost) * 100 : 0;
    const sign = overallPL >= 0 ? '+' : '-';
    plEl.textContent = `${sign}${formatAmt(Math.abs(overallPL))} (${sign}${Math.abs(pct).toFixed(2)}%)`;
    plEl.style.color = overallPL >= 0 ? '#8fd19e' : '#f77';
    plEl.title = `Unrealized: ${formatAmt(overallUnreal)}, Realized: ${formatAmt(overallReal)}, Cost: ${formatAmt(totalCost)}`;
  }
  const creditsEl = document.querySelector('.credits-amt');
  if (creditsEl && typeof window.getVcash === 'function') creditsEl.textContent = (window.getVcash()||0).toFixed(2);
}

// TRADE MODAL LOGIC
const tradeModal = document.getElementById('trade-modal');
const tradeSymbolEl = document.getElementById('trade-symbol');
const tradeTypeEl = document.getElementById('trade-type');
const tradeQtyEl = document.getElementById('trade-qty');
const tradePriceEl = document.getElementById('trade-price');
const tradeConfirmBtn = document.getElementById('trade-confirm');
const tradeCancelBtn = document.getElementById('trade-cancel');

function openTradeModal({ symbol, type='sell' }){
  if (!tradeModal) return alert('Trade modal not available');
  tradeModal.classList.remove('hidden');
  tradeModal.setAttribute('aria-hidden', 'false');
  tradeSymbolEl.textContent = symbol;
  tradeTypeEl.textContent = type === 'sell' ? 'Sell' : 'Buy';
  tradeQtyEl.value = '1';
  const price = (typeof window.getLatestPrice === 'function') ? window.getLatestPrice(symbol) : 0;
  tradePriceEl.textContent = price ? formatAmt(price) : '-';

  tradeConfirmBtn.onclick = () => {
    const qty = parseFloat(tradeQtyEl.value) || 0;
    if (!qty || qty <= 0) return alert('Invalid qty');
    const executedPrice = (typeof window.getLatestPrice === 'function') ? window.getLatestPrice(symbol) : 0;
    if (!executedPrice) return alert('No price available');
    const key = DEFAULT_KEY;
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    if (type === 'sell') {
      arr.push({ id: symbol, qty: -Math.abs(qty), avgPrice: executedPrice, created: Date.now() });
      if (typeof window.changeVcash === 'function') window.changeVcash(qty * executedPrice);
    } else {
      arr.push({ id: symbol, qty: Math.abs(qty), avgPrice: executedPrice, created: Date.now() });
      if (typeof window.changeVcash === 'function') window.changeVcash(-(qty * executedPrice));
    }
    window.localStorage.setItem(key, JSON.stringify(arr));
    closeTradeModal();
    loadAndRender();
  };

  tradeCancelBtn.onclick = () => closeTradeModal();
}

function closeTradeModal(){
  if (!tradeModal) return;
  tradeModal.classList.add('hidden');
  tradeModal.setAttribute('aria-hidden', 'true');
}

// expose loader
// expose loader
window.__portfolio = { loadPositions, savePositions, renderPositions, renderChartFor, aggregateHoldings, loadAndRender };

// show VCASH balance in the portfolio page header (if available)
try {
  const el = document.querySelector('.credits-amt');
  if (el && typeof window.getVcash === 'function') el.textContent = '₹' + window.getVcash().toFixed(2);
} catch(e) {}
// expose helpers for debugging (kept minimal)
window.__portfolio.debug = { computePL };
