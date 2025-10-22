StockWise — small static portfolio demo

This repo is a small static website demo for viewing stocks (simulated + real), buying/selling demo positions, and a portfolio page with P/L.

Quick steps to run locally

1. Start a simple static server in the project folder (PowerShell):

```powershell
python -m http.server 8000
# or
npx serve -s .
```

2. Open http://localhost:8000 in your browser.

Pre-upload checklist (recommended)

- Remove or redact your Alpha Vantage API key from `config.js` before committing or uploading. Prefer to set it in the deployed environment or via a secret.
- Verify `assets/logos/` contains your required image files (placeholder SVGs are included). Missing assets will fallback to `assets/logos/placeholder.svg`.
- Test Buy / Sell flows on the site and confirm VCASH balance updates and trades persist in localStorage (key: `SW_PORTFOLIO_POSITIONS_V1`).
- Export your trades (Portfolio > Export Trades) to keep a backup.
- Run the site in an incognito window to validate no cached state leaks.

Notes

- The portfolio computes realized P/L using FIFO matching of buy lots. Unrealized P/L uses the latest available price returned by the app's chart/cache.
- Refresh on the Portfolio page uses a conservative per-ticker spacing to avoid Alpha Vantage rate limits.

If you want, I can:
- Replace the localStorage-based API key storage with a more secure server-side approach (requires backend).
- Add a small build step to produce a minified static bundle for upload.

Good luck with the upload — tell me if you want me to make any final tweaks (favicon, meta tags, or minification).