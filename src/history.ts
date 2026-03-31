import YahooFinance from "yahoo-finance2";
import {
  Portfolio,
  Transaction,
  PortfolioHistoryPoint,
  PortfolioHistoryResult,
} from "./types.js";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface Lot {
  shares: number;
  pricePerShare: number;
}

interface TickerHolding {
  lots: Lot[];
}

function cloneHoldings(
  holdings: Map<string, TickerHolding>
): Map<string, TickerHolding> {
  const clone = new Map<string, TickerHolding>();
  for (const [ticker, h] of holdings) {
    clone.set(ticker, {
      lots: h.lots.map((l) => ({ ...l })),
    });
  }
  return clone;
}

function applyTransaction(
  holdings: Map<string, TickerHolding>,
  tx: Transaction
): void {
  const h = holdings.get(tx.ticker) ?? { lots: [] };

  if (tx.type === "buy") {
    h.lots.push({ shares: tx.shares, pricePerShare: tx.pricePerShare });
  } else if (tx.type === "sell") {
    let remaining = tx.shares;
    while (remaining > 0 && h.lots.length > 0) {
      const oldest = h.lots[0];
      if (oldest.shares <= remaining) {
        remaining -= oldest.shares;
        h.lots.shift();
      } else {
        oldest.shares -= remaining;
        remaining = 0;
      }
    }
  } else if (tx.type === "retention" || tx.type === "equalisation") {
    const amount = tx.amount ?? 0;
    const totalShares = h.lots.reduce((s, l) => s + l.shares, 0);
    if (totalShares > 0 && amount !== 0) {
      const sign = tx.type === "retention" ? 1 : -1;
      const perShare = (sign * amount) / totalShares;
      for (const lot of h.lots) {
        lot.pricePerShare += perShare;
      }
    }
  }

  holdings.set(tx.ticker, h);
}

function getCostBasis(holdings: Map<string, TickerHolding>): number {
  let total = 0;
  for (const h of holdings.values()) {
    for (const lot of h.lots) {
      total += lot.shares * lot.pricePerShare;
    }
  }
  return total;
}

function getShares(holdings: Map<string, TickerHolding>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [ticker, h] of holdings) {
    const shares = h.lots.reduce((s, l) => s + l.shares, 0);
    if (shares > 0) result.set(ticker, shares);
  }
  return result;
}

async function fetchHistoricalPrices(
  tickers: string[],
  startDate: string,
  endDate: string,
  interval: "daily" | "weekly" | "monthly"
): Promise<Map<string, Map<string, number>>> {
  const yfInterval =
    interval === "daily" ? "1d" : interval === "weekly" ? "1wk" : "1mo";

  const results = new Map<string, Map<string, number>>();

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const [history, quote] = await Promise.all([
          yf.historical(ticker, {
            period1: startDate,
            period2: endDate,
            interval: yfInterval as "1d" | "1wk" | "1mo",
          }),
          yf.quote(ticker),
        ]);

        const isGBp = quote.currency === "GBp";
        const priceMap = new Map<string, number>();

        for (const row of history) {
          if (row.close == null) continue;
          const date = row.date.toISOString().slice(0, 10);
          const price = isGBp ? row.close / 100 : row.close;
          priceMap.set(date, price);
        }

        results.set(ticker, priceMap);
      } catch {
        results.set(ticker, new Map());
      }
    })
  );

  return results;
}

function generateDates(
  startDate: string,
  endDate: string,
  interval: "daily" | "weekly" | "monthly"
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  const current = new Date(start);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));

    if (interval === "daily") {
      current.setUTCDate(current.getUTCDate() + 1);
    } else if (interval === "weekly") {
      current.setUTCDate(current.getUTCDate() + 7);
    } else {
      current.setUTCMonth(current.getUTCMonth() + 1);
    }
  }

  return dates;
}

export async function computePortfolioHistory(
  portfolio: Portfolio,
  options: {
    accountId?: string;
    personId?: string;
    startDate?: string;
    endDate?: string;
    interval?: "daily" | "weekly" | "monthly";
  }
): Promise<PortfolioHistoryResult> {
  const interval = options.interval ?? "monthly";

  // Filter transactions
  let txs = [...portfolio.transactions];
  if (options.accountId) {
    txs = txs.filter((t) => t.accountId === options.accountId);
  } else if (options.personId) {
    const accountIds = new Set(
      portfolio.accounts
        .filter((a) => a.personId === options.personId)
        .map((a) => a.id)
    );
    txs = txs.filter((t) => accountIds.has(t.accountId));
  }

  // Sort chronologically
  txs.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (txs.length === 0) {
    return { startDate: "", endDate: "", interval, series: [] };
  }

  const startDate = options.startDate ?? txs[0].date;
  const endDate =
    options.endDate ?? new Date().toISOString().slice(0, 10);

  // Find all tickers that were held at any point
  const allTickers = new Set<string>();
  const tempHoldings = new Map<string, TickerHolding>();
  for (const tx of txs) {
    applyTransaction(tempHoldings, tx);
    const shares = getShares(tempHoldings);
    for (const ticker of shares.keys()) {
      allTickers.add(ticker);
    }
  }

  // Fetch historical prices
  const historicalPrices = await fetchHistoricalPrices(
    [...allTickers],
    startDate,
    endDate,
    interval
  );

  // Build sorted price arrays for forward-fill lookup, merging Yahoo + manual prices
  const sortedPrices = new Map<string, { date: string; price: number }[]>();
  for (const ticker of allTickers) {
    const priceMap = new Map<string, number>();

    // Add Yahoo prices
    const yahooData = historicalPrices.get(ticker);
    if (yahooData) {
      for (const [date, price] of yahooData) {
        priceMap.set(date, price);
      }
    }

    // Merge manual prices (fills gaps where Yahoo has no data)
    const manualData = portfolio.manualPriceHistory?.[ticker];
    if (manualData) {
      for (const entry of manualData) {
        if (!priceMap.has(entry.date)) {
          priceMap.set(entry.date, entry.price);
        }
      }
    }

    const sorted = [...priceMap.entries()]
      .map(([date, price]) => ({ date, price }))
      .sort((a, b) => a.date.localeCompare(b.date));
    sortedPrices.set(ticker, sorted);
  }

  function getPrice(ticker: string, date: string): number | null {
    const prices = sortedPrices.get(ticker);
    if (!prices || prices.length === 0) return null;
    // Binary search for the latest price on or before date
    let lo = 0;
    let hi = prices.length - 1;
    let result: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (prices[mid].date <= date) {
        result = prices[mid].price;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }

  // Generate date series
  const dates = generateDates(startDate, endDate, interval);

  // Replay transactions across date series
  const holdings = new Map<string, TickerHolding>();
  let txIdx = 0;
  const series: PortfolioHistoryPoint[] = [];

  for (const date of dates) {
    // Apply all transactions on or before this date
    while (txIdx < txs.length && txs[txIdx].date <= date) {
      applyTransaction(holdings, txs[txIdx]);
      txIdx++;
    }

    const totalCost = getCostBasis(holdings);
    const sharesMap = getShares(holdings);

    let totalValue = 0;
    let hasPrices = true;

    for (const [ticker, shares] of sharesMap) {
      const price = getPrice(ticker, date);
      if (price !== null) {
        totalValue += shares * price;
      } else {
        hasPrices = false;
      }
    }

    if (sharesMap.size === 0 && totalCost === 0) continue;

    if (!hasPrices) {
      // Use cost as value when no price data available yet
      totalValue = totalCost;
    }

    const totalPnL = totalValue - totalCost;
    const pnlPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    series.push({
      date,
      totalCost: Math.round(totalCost * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
      totalPnL: Math.round(totalPnL * 100) / 100,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
    });
  }

  return { startDate, endDate, interval, series };
}
