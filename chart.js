// Keep a single Chart instance so repeated calls don't overlay charts
// Keep a registry of Chart instances keyed by canvas element
window.stockChartInstances = window.stockChartInstances || new WeakMap();

function _createChartInstance(ctx, stockName, data, labels) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${stockName} Trend`,
        data,
        borderColor: '#1db954',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 2,
        fill: false,
      }]
    },
    options: {
      animation: { duration: 300 },
      scales: {
        x: { ticks: { color: '#fff' } },
        y: { ticks: { color: '#fff' } },
      },
      plugins: {
        legend: { labels: { color: '#1db954' } },
      },
      responsive: true,
      maintainAspectRatio: false,
    }
  });
}

function renderChartOn(canvasOrId, stockName, data = [150,160,155,170,165], labels = ['Mon','Tue','Wed','Thu','Fri']) {
  let canvas = null;
  if (typeof canvasOrId === 'string') canvas = document.getElementById(canvasOrId);
  else canvas = canvasOrId;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // if a chart already exists for this canvas, update its data and animate
  const existing = window.stockChartInstances.get(canvas);
  if (existing) {
    try {
      existing.data.labels = labels;
      if (existing.data.datasets && existing.data.datasets[0]) existing.data.datasets[0].data = data;
      existing.options.animation = existing.options.animation || {};
      // animate the transition
      existing.update();
    } catch (e) { /* ignore update errors */ }
    return existing;
  }

  const inst = _createChartInstance(ctx, stockName, data, labels);
  window.stockChartInstances.set(canvas, inst);
  return inst;
}

function clearChartOn(canvasOrId) {
  let canvas = null;
  if (typeof canvasOrId === 'string') canvas = document.getElementById(canvasOrId);
  else canvas = canvasOrId;
  if (!canvas) return;
  const existing = window.stockChartInstances.get(canvas);
  if (existing) {
    try { existing.destroy(); } catch (e) { /* ignore */ }
    window.stockChartInstances.delete(canvas);
  }
}

// Backwards-compatible single canvas helper (uses default id 'stockChart')
function renderChart(stockName, data = [150,160,155,170,165], labels = ['Mon','Tue','Wed','Thu','Fri']) {
  const canvas = document.getElementById('stockChart');
  if (!canvas) return;
  return renderChartOn(canvas, stockName, data, labels);
}

function clearChart() { clearChartOn('stockChart'); }

// Render a minimal sparkline on a small canvas (no axes, no legend)
function renderSparklineOn(canvasOrId, stockName, data = [150,160,155,170,165]) {
  let canvas = null;
  if (typeof canvasOrId === 'string') canvas = document.getElementById(canvasOrId);
  else canvas = canvasOrId;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // If an instance already exists, update its data and animate the transition so the sparkline appears to move
  const existing = window.stockChartInstances.get(canvas);
  if (existing) {
    try {
      existing.data.labels = data.map(() => '');
      if (existing.data.datasets && existing.data.datasets[0]) existing.data.datasets[0].data = data;
      existing.update();
    } catch (e) { /* ignore update errors */ }
    return existing;
  }

  const inst = new Chart(ctx, {
    type: 'line',
    data: { labels: data.map(()=>'' ) , datasets: [{ label: stockName, data, borderColor: '#7ef3b2', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350, easing: 'easeOutQuart' },
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      elements: { line: { capBezierPoints: true } }
    }
  });
  window.stockChartInstances.set(canvas, inst);
  return inst;
}
