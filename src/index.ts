import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { addPerson, listPersons } from "./tools/persons.js";
import { addAccount, listAccounts } from "./tools/accounts.js";
import {
  addTransaction,
  removeTransaction,
  listTransactions,
} from "./tools/transactions.js";
import {
  getPortfolioSummaryTool,
  getAccountPositionsTool,
  getAssetAllocationTool,
  refreshPricesTool,
  getPortfolioHistoryTool,
  setPriceTool,
  importHistoricalPricesTool,
} from "./tools/portfolio-tools.js";

const server = new McpServer({
  name: "portfolio-mcp",
  version: "1.0.0",
});

// --- Person tools ---

server.tool(
  "add_person",
  "Add a person to the portfolio (e.g. yourself, spouse)",
  { name: z.string().describe("Person's name") },
  async (args) => ({ content: [{ type: "text", text: await addPerson(args) }] })
);

server.tool(
  "list_persons",
  "List all persons in the portfolio",
  {},
  async () => ({ content: [{ type: "text", text: await listPersons() }] })
);

// --- Account tools ---

server.tool(
  "add_account",
  "Add an investment account for a person",
  {
    personId: z.string().describe("ID of the person who owns this account"),
    name: z.string().describe("Account name (e.g. 'Vanguard ISA')"),
    provider: z.string().describe("Provider/platform (e.g. 'Vanguard', 'Hargreaves Lansdown')"),
    type: z.enum(["ISA", "SIPP", "Investment"]).describe("Account type"),
  },
  async (args) => ({ content: [{ type: "text", text: await addAccount(args) }] })
);

server.tool(
  "list_accounts",
  "List all investment accounts, optionally filtered by person",
  {
    personId: z.string().optional().describe("Filter by person ID"),
  },
  async (args) => ({ content: [{ type: "text", text: await listAccounts(args) }] })
);

// --- Transaction tools ---

server.tool(
  "add_transaction",
  "Record a transaction: buy, sell, retention of income (adds to cost basis), or accumulating equalisation (reduces cost basis)",
  {
    accountId: z.string().describe("ID of the account"),
    ticker: z.string().describe("Yahoo Finance ticker symbol (e.g. 'VWRL.L' for London-listed)"),
    name: z.string().optional().describe("Human-readable fund/ETF name"),
    date: z.string().describe("Transaction date (YYYY-MM-DD)"),
    shares: z.number().describe("Number of shares/units (0 for retention/equalisation)"),
    pricePerShare: z.number().describe("Price per share in GBP (0 for retention/equalisation)"),
    type: z.enum(["buy", "sell", "retention", "equalisation"]).describe("Transaction type"),
    amount: z.number().optional().describe("Cost adjustment amount in GBP (for retention/equalisation)"),
  },
  async (args) => ({
    content: [{ type: "text", text: await addTransaction(args) }],
  })
);

server.tool(
  "remove_transaction",
  "Remove an erroneous transaction by ID",
  {
    transactionId: z.string().describe("ID of the transaction to remove"),
  },
  async (args) => ({
    content: [{ type: "text", text: await removeTransaction(args) }],
  })
);

server.tool(
  "list_transactions",
  "List all transactions, optionally filtered by account or ticker",
  {
    accountId: z.string().optional().describe("Filter by account ID"),
    ticker: z.string().optional().describe("Filter by ticker symbol"),
  },
  async (args) => ({
    content: [{ type: "text", text: await listTransactions(args) }],
  })
);

// --- Portfolio query tools ---

server.tool(
  "get_portfolio_summary",
  "Get full portfolio summary with positions, values, and unrealised P&L across all accounts. Optionally filter by person.",
  {
    personId: z.string().optional().describe("Filter by person ID"),
  },
  async (args) => ({
    content: [{ type: "text", text: await getPortfolioSummaryTool(args) }],
  })
);

server.tool(
  "get_account_positions",
  "Get positions and P&L for a specific account",
  {
    accountId: z.string().describe("Account ID"),
  },
  async (args) => ({
    content: [{ type: "text", text: await getAccountPositionsTool(args) }],
  })
);

server.tool(
  "get_asset_allocation",
  "Get asset allocation breakdown across the entire portfolio, showing each holding's weight and split by person and account type",
  {},
  async () => ({
    content: [{ type: "text", text: await getAssetAllocationTool() }],
  })
);

server.tool(
  "refresh_prices",
  "Refresh market prices for all held positions from Yahoo Finance",
  {
    force: z
      .boolean()
      .optional()
      .describe("Force refresh even if prices are less than 24h old"),
  },
  async (args) => ({
    content: [{ type: "text", text: await refreshPricesTool(args) }],
  })
);

server.tool(
  "get_portfolio_history",
  "Get historical portfolio value, cost basis, and P&L over time as a time series",
  {
    accountId: z.string().optional().describe("Filter by account ID"),
    personId: z.string().optional().describe("Filter by person ID"),
    startDate: z
      .string()
      .optional()
      .describe("Start date (YYYY-MM-DD). Defaults to earliest transaction."),
    endDate: z
      .string()
      .optional()
      .describe("End date (YYYY-MM-DD). Defaults to today."),
    interval: z
      .enum(["daily", "weekly", "monthly"])
      .optional()
      .describe("Data interval (default: monthly)"),
  },
  async (args) => ({
    content: [{ type: "text", text: await getPortfolioHistoryTool(args) }],
  })
);

server.tool(
  "set_price",
  "Manually set the current price for a ticker (useful for funds not available on Yahoo Finance)",
  {
    ticker: z.string().describe("Ticker symbol as used in transactions"),
    price: z.number().positive().describe("Current price"),
    currency: z
      .string()
      .optional()
      .describe("Currency of the price (default: GBP). Use GBp for pence."),
  },
  async (args) => ({
    content: [{ type: "text", text: await setPriceTool(args) }],
  })
);

server.tool(
  "import_historical_prices",
  "Import historical prices for a ticker (for funds not on Yahoo Finance). Prices are stored and used by the portfolio history tool.",
  {
    ticker: z.string().describe("Ticker symbol as used in transactions"),
    prices: z
      .array(
        z.object({
          date: z.string().describe("Date (YYYY-MM-DD)"),
          price: z.number().describe("Closing price"),
        })
      )
      .describe("Array of date/price pairs"),
    currency: z
      .string()
      .optional()
      .describe("Currency of prices (default: GBP). Use GBp for pence."),
  },
  async (args) => ({
    content: [
      { type: "text", text: await importHistoricalPricesTool(args) },
    ],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
