import * as fs from "fs";
import * as path from "path";
import { Portfolio } from "./types.js";

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "portfolio.json");

function emptyPortfolio(): Portfolio {
  return {
    persons: [],
    accounts: [],
    transactions: [],
    priceCache: {},
  };
}

export function loadPortfolio(): Portfolio {
  if (!fs.existsSync(DB_PATH)) {
    const portfolio = emptyPortfolio();
    savePortfolio(portfolio);
    return portfolio;
  }
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw) as Portfolio;
}

export function savePortfolio(portfolio: Portfolio): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(portfolio, null, 2), "utf-8");
  fs.renameSync(tmp, DB_PATH);
}
