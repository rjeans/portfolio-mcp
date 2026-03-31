export type AccountType = "ISA" | "SIPP" | "Investment";

export interface Person {
  id: string;
  name: string;
}

export interface Account {
  id: string;
  personId: string;
  name: string;
  provider: string;
  type: AccountType;
}

export type TransactionType = "buy" | "sell" | "retention" | "equalisation";

export interface Transaction {
  id: string;
  accountId: string;
  ticker: string;
  name?: string;
  date: string; // ISO date string YYYY-MM-DD
  shares: number;
  pricePerShare: number; // in GBP
  type: TransactionType;
  amount?: number; // cost adjustment amount in GBP (retention/equalisation)
}

export interface PriceCacheEntry {
  price: number;
  currency: string;
  lastUpdated: string; // ISO datetime
}

export interface Portfolio {
  persons: Person[];
  accounts: Account[];
  transactions: Transaction[];
  priceCache: Record<string, PriceCacheEntry>;
  manualPriceHistory?: Record<string, { date: string; price: number }[]>;
}

// Computed views

export interface Position {
  ticker: string;
  name?: string;
  accountId: string;
  shares: number;
  avgCostPerShare: number;
  totalCost: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealisedPnL: number | null;
  unrealisedPnLPercent: number | null;
  lastPriceUpdate: string | null;
}

export interface AccountSummary {
  account: Account;
  person: Person;
  positions: Position[];
  totalCost: number;
  totalValue: number | null;
  totalUnrealisedPnL: number | null;
}

export interface PortfolioSummary {
  accounts: AccountSummary[];
  totalCost: number;
  totalValue: number | null;
  totalUnrealisedPnL: number | null;
  currency: string;
}

export interface PortfolioHistoryPoint {
  date: string;
  totalCost: number;
  totalValue: number;
  totalPnL: number;
  pnlPercent: number;
}

export interface PortfolioHistoryResult {
  startDate: string;
  endDate: string;
  interval: "daily" | "weekly" | "monthly";
  series: PortfolioHistoryPoint[];
}
