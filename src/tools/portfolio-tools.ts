import { loadPortfolio, savePortfolio } from "../db.js";
import { refreshPrices, ensurePricesFresh, isPriceStale } from "../pricing.js";
import {
  getPortfolioSummary,
  getAccountPositions,
  getAssetAllocation,
} from "../portfolio.js";
import { computePortfolioHistory } from "../history.js";

export async function getPortfolioSummaryTool(args?: {
  personId?: string;
}): Promise<string> {
  const portfolio = loadPortfolio();
  await ensurePricesFresh(portfolio);
  savePortfolio(portfolio);

  const summary = getPortfolioSummary(portfolio, args?.personId);
  return JSON.stringify(summary, null, 2);
}

export async function getAccountPositionsTool(args: {
  accountId: string;
}): Promise<string> {
  const portfolio = loadPortfolio();
  await ensurePricesFresh(portfolio);
  savePortfolio(portfolio);

  const account = portfolio.accounts.find((a) => a.id === args.accountId);
  if (!account) {
    return JSON.stringify({ error: `Account not found: ${args.accountId}` });
  }

  const positions = getAccountPositions(portfolio, args.accountId);
  const person = portfolio.persons.find((p) => p.id === account.personId);

  return JSON.stringify(
    {
      account,
      person: person?.name,
      positions,
      totalCost: positions.reduce((s, p) => s + p.totalCost, 0),
      totalValue: positions.every((p) => p.currentValue !== null)
        ? positions.reduce((s, p) => s + (p.currentValue ?? 0), 0)
        : null,
    },
    null,
    2
  );
}

export async function getAssetAllocationTool(): Promise<string> {
  const portfolio = loadPortfolio();
  await ensurePricesFresh(portfolio);
  savePortfolio(portfolio);

  const allocation = getAssetAllocation(portfolio);
  return JSON.stringify(allocation, null, 2);
}

export async function refreshPricesTool(args?: {
  force?: boolean;
}): Promise<string> {
  const portfolio = loadPortfolio();
  const result = await refreshPrices(portfolio, args?.force ?? false);
  savePortfolio(portfolio);

  const prices = Object.entries(portfolio.priceCache).map(([ticker, entry]) => ({
    ticker,
    price: entry.price,
    currency: entry.currency,
    lastUpdated: entry.lastUpdated,
  }));

  return JSON.stringify({ ...result, prices }, null, 2);
}

export async function getPortfolioHistoryTool(args: {
  accountId?: string;
  personId?: string;
  startDate?: string;
  endDate?: string;
  interval?: string;
}): Promise<string> {
  const portfolio = loadPortfolio();
  const result = await computePortfolioHistory(portfolio, {
    accountId: args.accountId,
    personId: args.personId,
    startDate: args.startDate,
    endDate: args.endDate,
    interval: (args.interval as "daily" | "weekly" | "monthly") ?? "monthly",
  });
  return JSON.stringify(result, null, 2);
}

export async function setPriceTool(args: {
  ticker: string;
  price: number;
  currency?: string;
}): Promise<string> {
  const portfolio = loadPortfolio();
  const currency = args.currency ?? "GBP";
  const priceInGBP = currency === "GBp" ? args.price / 100 : args.price;

  portfolio.priceCache[args.ticker] = {
    price: priceInGBP,
    currency: "GBP",
    lastUpdated: new Date().toISOString(),
  };
  savePortfolio(portfolio);
  return JSON.stringify({
    success: true,
    ticker: args.ticker,
    price: priceInGBP,
    currency: "GBP",
  });
}

export async function importHistoricalPricesTool(args: {
  ticker: string;
  prices: { date: string; price: number }[];
  currency?: string;
}): Promise<string> {
  const portfolio = loadPortfolio();
  const currency = args.currency ?? "GBP";
  const isGBp = currency === "GBp";

  if (!portfolio.manualPriceHistory) {
    portfolio.manualPriceHistory = {};
  }

  const existing = portfolio.manualPriceHistory[args.ticker] ?? [];
  const existingDates = new Set(existing.map((e) => e.date));

  let added = 0;
  for (const p of args.prices) {
    if (!existingDates.has(p.date)) {
      existing.push({
        date: p.date,
        price: isGBp ? p.price / 100 : p.price,
      });
      added++;
    }
  }

  existing.sort((a, b) => a.date.localeCompare(b.date));
  portfolio.manualPriceHistory[args.ticker] = existing;
  savePortfolio(portfolio);

  return JSON.stringify({
    success: true,
    ticker: args.ticker,
    added,
    total: existing.length,
  });
}
