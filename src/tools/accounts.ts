import { v4 as uuidv4 } from "uuid";
import { loadPortfolio, savePortfolio } from "../db.js";
import { AccountType } from "../types.js";

const VALID_ACCOUNT_TYPES: AccountType[] = ["ISA", "SIPP", "Investment"];

export async function addAccount(args: {
  personId: string;
  name: string;
  provider: string;
  type: string;
}): Promise<string> {
  const portfolio = loadPortfolio();

  const person = portfolio.persons.find((p) => p.id === args.personId);
  if (!person) {
    return JSON.stringify({ error: `Person not found: ${args.personId}` });
  }

  if (!VALID_ACCOUNT_TYPES.includes(args.type as AccountType)) {
    return JSON.stringify({
      error: `Invalid account type: ${args.type}. Must be one of: ${VALID_ACCOUNT_TYPES.join(", ")}`,
    });
  }

  const account = {
    id: uuidv4(),
    personId: args.personId,
    name: args.name,
    provider: args.provider,
    type: args.type as AccountType,
  };
  portfolio.accounts.push(account);
  savePortfolio(portfolio);
  return JSON.stringify({ success: true, account }, null, 2);
}

export async function listAccounts(args?: { personId?: string }): Promise<string> {
  const portfolio = loadPortfolio();
  const accounts = args?.personId
    ? portfolio.accounts.filter((a) => a.personId === args.personId)
    : portfolio.accounts;

  const result = accounts.map((a) => ({
    ...a,
    person: portfolio.persons.find((p) => p.id === a.personId)?.name,
  }));
  return JSON.stringify(result, null, 2);
}
