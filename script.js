// Lightweight app initializer
document.addEventListener('DOMContentLoaded', () => {
	// Prefer the on-page/localStorage API key (safer) rather than embedding the key in code.
	// If a key is saved in localStorage we load it into window.ALPHA_VANTAGE_API_KEY so
	// other modules can use it. We intentionally do NOT auto-start the rotation to avoid
	// accidentally hitting Alpha Vantage rate limits — use click-to-fetch or call
	// `startRealRotation()` from the console/UI when you want to start polling.
	try {
		const STORAGE_KEY = '2GYAZ1YV2BFAWJZF';
		const saved = window.localStorage.getItem(STORAGE_KEY);
		if (saved && saved.trim()) {
			window.ALPHA_VANTAGE_API_KEY = saved.trim();
			console.info('Alpha Vantage API key loaded from localStorage (rotation is manual).');
		} else if (window.ALPHA_VANTAGE_API_KEY) {
			// key set via config.js or elsewhere; keep it but do not auto-start rotation
			console.info('Alpha Vantage API key present on window (rotation is manual).');
		} else {
			console.info('No Alpha Vantage API key found. Paste one into the page input and click Save.');
		}
	} catch (e) { /* ignore localStorage failures */ }

	// Virtual cash (vcash) management
	(function initVcash(){
		const VCASH_KEY = 'SW_VCASH_V1';
		const DEFAULT_VCASH = 10000; // default virtual cash amount
		function read() { try { const v = parseFloat(window.localStorage.getItem(VCASH_KEY)); return isNaN(v) ? null : v; } catch(e) { return null; } }
		function write(v) { try { window.localStorage.setItem(VCASH_KEY, String(v)); } catch(e) {} }
		let cur = read();
		if (cur === null) { cur = DEFAULT_VCASH; write(cur); }
		window.VCASH = cur;
		window.getVcash = () => { const v = read(); return (typeof v === 'number') ? v : window.VCASH || DEFAULT_VCASH; };
		window.setVcash = (v) => { const n = Number(v) || 0; write(n); window.VCASH = n; updateDisplay(); return n; };
		window.changeVcash = (delta) => { const n = window.getVcash() + Number(delta); return window.setVcash(n); };

		function updateDisplay(){
			try {
				const el = document.querySelector('.credits-amt');
				if (el) el.textContent = '₹' + window.getVcash().toFixed(2);
			} catch(e) { /* ignore */ }
		}

		// initialize display
		updateDisplay();
		// expose for debugging
		window.__vcash = { read, write };
	})();

	// Other global startup tasks can be added here in future.
});
