import fs from 'node:fs';
import path from 'node:path';

export const PRODUCTS_FILE = path.resolve('products.json');
const STATE_FILE = path.resolve('data', 'state.json');
const MAX_HISTORY = 500;

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export const loadProducts = () => readJson(PRODUCTS_FILE, []);
export const saveProducts = (products) => writeJson(PRODUCTS_FILE, products);

// Trạng thái theo từng URL: lịch sử giá và giá đã báo gần nhất (để không spam).
export const loadState = () => readJson(STATE_FILE, {});
export const saveState = (state) => writeJson(STATE_FILE, state);

export function recordPrice(state, url, price) {
  const entry = (state[url] ??= { history: [], lastNotifiedPrice: null });
  entry.history.push({ t: new Date().toISOString(), price });
  if (entry.history.length > MAX_HISTORY) entry.history.splice(0, entry.history.length - MAX_HISTORY);
  return entry;
}
