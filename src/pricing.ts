import YahooFinance from "yahoo-finance2";
import { Portfolio, PriceCacheEntry } from "./types.js";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const QUOTE_TIMEOUT_MS = 10_000; // 10 seconds per quote

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export function isPriceStale(entry: PriceCacheEntry | undefined): boolean {
  if (!entry) return true;
  return Date.now() - new Date(entry.lastUpdated).getTime() > STALE_THRESHOLD_MS;
}

export function getHeldTickers(portfolio: Portfolio): string[] {
  const sharesMap = new Map<string, number>();
  for (const tx of portfolio.transactions) {
    const current = sharesMap.get(tx.ticker) ?? 0;
    if (tx.type === "buy") {
      sharesMap.set(tx.ticker, current + tx.shares);
    } else {
      sharesMap.set(tx.ticker, current - tx.shares);
    }
  }
  return [...sharesMap.entries()]
    .filter(([, shares]) => shares > 0)
    .map(([ticker]) => ticker);
}

export async function fetchQuote(
  ticker: string
): Promise<{ price: number; currency: string; name: string } | null> {
  try {
    const quote = await withTimeout(yf.quote(ticker), QUOTE_TIMEOUT_MS);
    if (quote.regularMarketPrice == null) return null;
    return {
      price: quote.regularMarketPrice,
      currency: quote.currency ?? "GBP",
      name: quote.shortName ?? ticker,
    };
  } catch {
    return null;
  }
}

export async function refreshPrices(
  portfolio: Portfolio,
  force = false
): Promise<{ updated: string[]; failed: string[] }> {
  const tickers = getHeldTickers(portfolio);
  const updated: string[] = [];
  const failed: string[] = [];

  for (const ticker of tickers) {
    if (!force && !isPriceStale(portfolio.priceCache[ticker])) continue;

    const quote = await fetchQuote(ticker);
    if (quote) {
      // Yahoo Finance returns some UK funds priced in pence (GBp) — normalise to GBP
      const priceInGBP = quote.currency === "GBp" ? quote.price / 100 : quote.price;
      const currency = quote.currency === "GBp" ? "GBP" : quote.currency;
      portfolio.priceCache[ticker] = {
        price: priceInGBP,
        currency,
        lastUpdated: new Date().toISOString(),
      };
      updated.push(ticker);
    } else {
      failed.push(ticker);
    }
  }

  return { updated, failed };
}

export async function ensurePricesFresh(
  portfolio: Portfolio
): Promise<void> {
  const tickers = getHeldTickers(portfolio);
  const staleTickers = tickers.filter((t) =>
    isPriceStale(portfolio.priceCache[t])
  );
  if (staleTickers.length > 0) {
    await refreshPrices(portfolio);
  }
}
