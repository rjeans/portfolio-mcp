# Portfolio MCP Server

## Project Overview

MCP server tracking a multi-person, multi-account UK investment portfolio from a transaction log, with live Yahoo Finance pricing. Built for UK investors — handles accumulation-fund cost-basis nuances (retention of income, accumulating equalisation). Served over stdio.

## Running & Building

```bash
npm install
npm run build                              # tsc → dist/
npm run start                              # node dist/index.js
PORTFOLIO_DATA_DIR=./data npm run start    # run against a test dataset
```

`tsc` is the only check — no tests, linter, or watch task. Source is `.ts` but imports use `.js` specifiers (NodeNext ESM style). All money is GBP.

## Storage

State is a single JSON file `portfolio.json` in `PORTFOLIO_DATA_DIR` (default `~/.config/portfolio-mcp/`). There is **no in-memory server state between calls**. `src/db.ts` exposes `loadPortfolio()` / `savePortfolio()`; every mutating tool reads the whole file, mutates, and rewrites it atomically (temp file + rename). The `Portfolio` shape is in `src/types.ts`.

`portfolio.json` holds real financial data — keep `PORTFOLIO_DATA_DIR` pointed somewhere outside this git repo and never commit the file. To sanity-check that a data dir loads:

```bash
PORTFOLIO_DATA_DIR=/path/to/data node -e "console.log(require('./dist/db.js').loadPortfolio().transactions.length)"
```

## Architecture

`src/index.ts` registers every MCP tool and is a thin shell — each tool delegates to a handler in `src/tools/*` (`persons`, `accounts`, `transactions`, `portfolio-tools`) that returns a JSON **string**. Computation lives in `src/portfolio.ts`, `src/history.ts`, and `src/pricing.ts`.

### Cost-basis / FIFO logic (the part to be careful with)

`portfolio.ts` (`computePositions`) and `history.ts` (`applyTransaction`) contain **parallel, intentionally-duplicated** replay logic — one builds the current snapshot, the other replays across a date series for the time series. **Any change to cost-basis rules must be made in both.**

Transaction types (`buy | sell | retention | equalisation`):
- `buy` — pushes a lot `{shares, pricePerShare}`.
- `sell` — **FIFO** disposal: consume oldest lots first.
- `retention` (retention of income, UK acc funds) — **adds** `amount` to cost basis, spread per-share across all currently-held lots. No share change.
- `equalisation` (accumulating equalisation, return of capital on first distribution after purchase) — **subtracts** `amount` from cost basis, same mechanism.

Positions are keyed by ticker. `getPortfolioSummary` aggregates per account → per person; totals are `null` when any held position lacks a price (don't silently treat missing prices as zero).

### Pricing

`src/pricing.ts` fetches from Yahoo Finance (`yahoo-finance2`), 10s per-quote timeout, cached 24h (`STALE_THRESHOLD_MS`). **GBp handling**: Yahoo returns some UK funds in pence (`currency === "GBp"`) — divide by 100 and store as GBP. Tickers in `manualPricingTickers` are skipped by auto-refresh and priced via `set_price` / `import_historical_prices`; `pricingUrls` can store a lookup URL per ticker.

`src/history.ts` forward-fills prices via binary search (latest price on/before each date), merging Yahoo history with `manualPriceHistory`, and falls back to cost-as-value when no price exists for a held ticker yet. History dates are generated daily/weekly/monthly in UTC.

## Conventions

- Tickers are upper-cased on write (`add_transaction`) and compared upper-cased.
- Handlers return JSON strings, not objects; errors are returned as `{ "error": "..." }` strings, not thrown.
- Yahoo tickers are exchange-suffixed (e.g. `VWRL.L` for London).
