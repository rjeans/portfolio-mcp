import { v4 as uuidv4 } from "uuid";
import { loadPortfolio, savePortfolio } from "../db.js";

export async function addPerson(args: { name: string }): Promise<string> {
  const portfolio = loadPortfolio();
  const person = { id: uuidv4(), name: args.name };
  portfolio.persons.push(person);
  savePortfolio(portfolio);
  return JSON.stringify({ success: true, person }, null, 2);
}

export async function listPersons(): Promise<string> {
  const portfolio = loadPortfolio();
  return JSON.stringify(portfolio.persons, null, 2);
}
