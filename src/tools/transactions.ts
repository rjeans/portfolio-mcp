import { v4 as uuidv4 } from "uuid";
import { loadPortfolio, savePortfolio } from "../db.js";
import { TransactionType } from "../types.js";

export async function addTransaction(args: {
  accountId: string;
  ticker: string;
  name?: string;
  date: string;
  shares: number;
  pricePerShare: number;
  type: string;
  amount?: number;
}): Promise<string> {
  const portfolio = loadPortfolio();

  const account = portfolio.accounts.find((a) => a.id === args.accountId);
  if (!account) {
    return JSON.stringify({ error: `Account not found: ${args.accountId}` });
  }

  const validTypes = ["buy", "sell", "retention", "equalisation"];
  if (!validTypes.includes(args.type)) {
    return JSON.stringify({ error: `Invalid transaction type: ${args.type}. Must be one of: ${validTypes.join(", ")}` });
  }

  if (args.type === "buy" || args.type === "sell") {
    if (args.shares <= 0) {
      return JSON.stringify({ error: "Shares must be positive." });
    }
    if (args.pricePerShare < 0) {
      return JSON.stringify({ error: "Price per share must be non-negative." });
    }
  }

  const transaction = {
    id: uuidv4(),
    accountId: args.accountId,
    ticker: args.ticker.toUpperCase(),
    name: args.name,
    date: args.date,
    shares: args.shares,
    pricePerShare: args.pricePerShare,
    type: args.type as TransactionType,
    ...(args.amount !== undefined ? { amount: args.amount } : {}),
  };

  portfolio.transactions.push(transaction);
  savePortfolio(portfolio);
  return JSON.stringify({ success: true, transaction }, null, 2);
}

export async function removeTransaction(args: {
  transactionId: string;
}): Promise<string> {
  const portfolio = loadPortfolio();
  const idx = portfolio.transactions.findIndex((t) => t.id === args.transactionId);
  if (idx === -1) {
    return JSON.stringify({ error: `Transaction not found: ${args.transactionId}` });
  }
  const removed = portfolio.transactions.splice(idx, 1)[0];
  savePortfolio(portfolio);
  return JSON.stringify({ success: true, removed }, null, 2);
}

export async function listTransactions(args?: {
  accountId?: string;
  ticker?: string;
}): Promise<string> {
  const portfolio = loadPortfolio();
  let txs = portfolio.transactions;
  if (args?.accountId) {
    txs = txs.filter((t) => t.accountId === args.accountId);
  }
  if (args?.ticker) {
    txs = txs.filter((t) => t.ticker === args.ticker!.toUpperCase());
  }
  return JSON.stringify(txs, null, 2);
}
