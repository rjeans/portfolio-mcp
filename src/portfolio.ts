import {
  Portfolio,
  Position,
  AccountSummary,
  PortfolioSummary,
  Transaction,
} from "./types.js";

interface Lot {
  shares: number;
  pricePerShare: number;
}

interface HoldingAccumulator {
  lots: Lot[];
  name?: string;
}

function computePositions(
  transactions: Transaction[],
  priceCache: Portfolio["priceCache"]
): Position[] {
  const holdings = new Map<string, HoldingAccumulator>();

  // Sort by date to process chronologically
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const tx of sorted) {
    const key = tx.ticker;
    const h = holdings.get(key) ?? { lots: [] };
    if (!h.name && tx.name) h.name = tx.name;

    if (tx.type === "buy") {
      h.lots.push({ shares: tx.shares, pricePerShare: tx.pricePerShare });
    } else if (tx.type === "sell") {
      // sell: dispose of oldest lots first (FIFO)
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
      // Retention of income: adds to cost basis (avoids double taxation on disposal)
      // Accumulating equalisation: subtracts from cost basis (return of capital)
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

    holdings.set(key, h);
  }

  const positions: Position[] = [];
  for (const [ticker, h] of holdings) {
    const shares = h.lots.reduce((sum, lot) => sum + lot.shares, 0);
    if (shares <= 0) continue;

    const totalCost = h.lots.reduce(
      (sum, lot) => sum + lot.shares * lot.pricePerShare,
      0
    );
    const cached = priceCache[ticker];
    const currentPrice = cached?.price ?? null;
    const currentValue = currentPrice !== null ? currentPrice * shares : null;
    const unrealisedPnL = currentValue !== null ? currentValue - totalCost : null;
    const unrealisedPnLPercent =
      unrealisedPnL !== null && totalCost > 0
        ? (unrealisedPnL / totalCost) * 100
        : null;

    positions.push({
      ticker,
      name: h.name,
      accountId: transactions[0]?.accountId ?? "",
      shares,
      avgCostPerShare: totalCost / shares,
      totalCost,
      currentPrice,
      currentValue,
      unrealisedPnL,
      unrealisedPnLPercent,
      lastPriceUpdate: cached?.lastUpdated ?? null,
    });
  }

  return positions;
}

export function getAccountPositions(
  portfolio: Portfolio,
  accountId: string
): Position[] {
  const txs = portfolio.transactions.filter((t) => t.accountId === accountId);
  const positions = computePositions(txs, portfolio.priceCache);
  return positions.map((p) => ({ ...p, accountId }));
}

export function getPortfolioSummary(
  portfolio: Portfolio,
  personId?: string
): PortfolioSummary {
  const accounts = personId
    ? portfolio.accounts.filter((a) => a.personId === personId)
    : portfolio.accounts;

  const accountSummaries: AccountSummary[] = accounts.map((account) => {
    const person = portfolio.persons.find((p) => p.id === account.personId)!;
    const positions = getAccountPositions(portfolio, account.id);

    const totalCost = positions.reduce((sum, p) => sum + p.totalCost, 0);
    const hasAllPrices = positions.every((p) => p.currentValue !== null);
    const totalValue = hasAllPrices
      ? positions.reduce((sum, p) => sum + (p.currentValue ?? 0), 0)
      : null;
    const totalUnrealisedPnL =
      totalValue !== null ? totalValue - totalCost : null;

    return {
      account,
      person,
      positions,
      totalCost,
      totalValue,
      totalUnrealisedPnL,
    };
  });

  const totalCost = accountSummaries.reduce((s, a) => s + a.totalCost, 0);
  const hasAllValues = accountSummaries.every((a) => a.totalValue !== null);
  const totalValue = hasAllValues
    ? accountSummaries.reduce((s, a) => s + (a.totalValue ?? 0), 0)
    : null;
  const totalUnrealisedPnL =
    totalValue !== null ? totalValue - totalCost : null;

  return {
    accounts: accountSummaries,
    totalCost,
    totalValue,
    totalUnrealisedPnL,
    currency: "GBP",
  };
}

export interface AllocationEntry {
  ticker: string;
  name?: string;
  totalShares: number;
  totalValue: number | null;
  percentOfPortfolio: number | null;
  byPerson: {
    personId: string;
    personName: string;
    shares: number;
    value: number | null;
  }[];
  byAccountType: {
    type: string;
    shares: number;
    value: number | null;
  }[];
}

export function getAssetAllocation(portfolio: Portfolio): AllocationEntry[] {
  const summary = getPortfolioSummary(portfolio);
  const portfolioTotalValue = summary.totalValue;

  // Aggregate across all accounts by ticker
  const tickerMap = new Map<
    string,
    {
      name?: string;
      totalShares: number;
      totalValue: number | null;
      byPerson: Map<string, { personName: string; shares: number; value: number | null }>;
      byAccountType: Map<string, { shares: number; value: number | null }>;
    }
  >();

  for (const acctSummary of summary.accounts) {
    for (const pos of acctSummary.positions) {
      const existing = tickerMap.get(pos.ticker) ?? {
        name: pos.name,
        totalShares: 0,
        totalValue: 0,
        byPerson: new Map(),
        byAccountType: new Map(),
      };

      existing.totalShares += pos.shares;
      if (pos.currentValue !== null && existing.totalValue !== null) {
        existing.totalValue += pos.currentValue;
      } else {
        existing.totalValue = null;
      }

      // By person
      const personKey = acctSummary.person.id;
      const personEntry = existing.byPerson.get(personKey) ?? {
        personName: acctSummary.person.name,
        shares: 0,
        value: 0,
      };
      personEntry.shares += pos.shares;
      if (pos.currentValue !== null && personEntry.value !== null) {
        personEntry.value += pos.currentValue;
      } else {
        personEntry.value = null;
      }
      existing.byPerson.set(personKey, personEntry);

      // By account type
      const typeKey = acctSummary.account.type;
      const typeEntry = existing.byAccountType.get(typeKey) ?? {
        shares: 0,
        value: 0,
      };
      typeEntry.shares += pos.shares;
      if (pos.currentValue !== null && typeEntry.value !== null) {
        typeEntry.value += pos.currentValue;
      } else {
        typeEntry.value = null;
      }
      existing.byAccountType.set(typeKey, typeEntry);

      tickerMap.set(pos.ticker, existing);
    }
  }

  return [...tickerMap.entries()].map(([ticker, data]) => ({
    ticker,
    name: data.name,
    totalShares: data.totalShares,
    totalValue: data.totalValue,
    percentOfPortfolio:
      data.totalValue !== null && portfolioTotalValue !== null && portfolioTotalValue > 0
        ? (data.totalValue / portfolioTotalValue) * 100
        : null,
    byPerson: [...data.byPerson.entries()].map(([personId, p]) => ({
      personId,
      ...p,
    })),
    byAccountType: [...data.byAccountType.entries()].map(([type, t]) => ({
      type,
      ...t,
    })),
  }));
}
