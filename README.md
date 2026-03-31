# portfolio-mcp

A Model Context Protocol (MCP) server for tracking multi-person, multi-account investment portfolios. Built for UK investors with support for accumulation fund nuances like retention of income and accumulating equalisation.

## Features

- **Multi-person, multi-account** -- track portfolios across people (e.g. household) and account types (ISA, SIPP, Investment)
- **FIFO cost accounting** -- lot-based tracking with first-in-first-out disposal for accurate cost basis and P&L
- **Retention of income & accumulating equalisation** -- adjusts cost basis correctly for UK accumulation funds, matching broker tax cost calculations
- **Yahoo Finance integration** -- live pricing with automatic GBp (pence) to GBP conversion
- **Manual price override** -- set prices for funds not available on Yahoo Finance
- **Historical price import** -- import historical prices from external sources (e.g. FT) for funds missing from Yahoo
- **Portfolio history** -- time series of value, cost basis, and P&L with configurable intervals (daily/weekly/monthly)
- **JSON file storage** -- simple, portable data format with atomic writes

## MCP Tools

| Tool | Description |
|------|-------------|
| `add_person` | Add a person to the portfolio |
| `list_persons` | List all persons |
| `add_account` | Add an investment account (ISA, SIPP, Investment) |
| `list_accounts` | List accounts, optionally filtered by person |
| `add_transaction` | Record a buy, sell, retention, or equalisation |
| `remove_transaction` | Remove a transaction by ID |
| `list_transactions` | List transactions, optionally filtered by account or ticker |
| `get_portfolio_summary` | Get current positions, cost basis, and P&L |
| `get_account_positions` | Get positions for a specific account |
| `get_asset_allocation` | Get allocation breakdown by holding, person, and account type |
| `refresh_prices` | Refresh live prices from Yahoo Finance |
| `set_price` | Manually set the current price for a ticker |
| `import_historical_prices` | Import historical prices for use in portfolio history |
| `get_portfolio_history` | Get historical portfolio valuation as a time series |

## Setup

```bash
npm install
npm run build
```

### Claude Code / Claude Desktop

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "portfolio": {
      "command": "node",
      "args": ["/path/to/portfolio-mcp/dist/index.js"]
    }
  }
}
```

## Transaction Types

| Type | Description |
|------|-------------|
| `buy` | Purchase of shares/units |
| `sell` | Sale of shares/units (FIFO cost disposal) |
| `retention` | Retention of income -- adds to cost basis (reported annually by UK acc funds) |
| `equalisation` | Accumulating equalisation -- reduces cost basis (return of capital on first distribution after purchase) |

## Data Storage

Portfolio data is stored in `data/portfolio.json` (excluded from git). The file is created automatically on first use.

Prices from Yahoo Finance are cached for 24 hours. Manual prices persist until overwritten.

## UK Fund Pricing

Yahoo Finance returns some UK fund prices in GBp (pence sterling) rather than GBP (pounds). The server automatically detects and converts these. For funds not available on Yahoo Finance, use `set_price` for the current price or `import_historical_prices` for historical data.

## License

ISC
