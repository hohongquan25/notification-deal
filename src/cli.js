#!/usr/bin/env node
import fs from 'node:fs';
import { launchBrowser } from './browser.js';
import { fetchProduct, formatVnd, parsePrice } from './extract.js';
import { detectSite, normalizeUrl } from './sites.js';
import { loadProducts, saveProducts, loadState, saveState, recordPrice, PRODUCTS_FILE } from './store.js';
import { sendTelegram, telegramConfigured, listChats, escapeHtml } from './telegram.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const FAIL_ALERT_THRESHOLD = 3; // báo Telegram khi 1 sản phẩm lỗi liên tiếp chừng này lần
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toLocaleString('vi-VN');

// Trả về true nếu gửi được, để chỉ đánh dấu "đã báo" khi tin nhắn thực sự tới nơi.
async function notify(text) {
  if (!telegramConfigured()) {
    console.warn('  ! Chưa cấu hình Telegram, bỏ qua thông báo.');
    return false;
  }
  try {
    await sendTelegram(text);
    return true;
  } catch (err) {
    console.error(`  ! Gửi Telegram thất bại: ${err.message}`);
    return false;
  }
}

// Một lượt kiểm tra tất cả sản phẩm đang bật.
async function checkAll() {
  const products = loadProducts().filter((p) => p.enabled !== false);
  if (!products.length) {
    console.log(`Chưa có sản phẩm nào. Thêm bằng: node src/cli.js add <url> <giá mục tiêu>`);
    return;
  }
  const state = loadState();
  const context = await launchBrowser();
  console.log(`[${now()}] Kiểm tra ${products.length} sản phẩm...`);
  try {
    for (const [i, product] of products.entries()) {
      if (i > 0) await sleep(3000 + Math.random() * 5000); // giãn cách để tránh bị chặn
      const label = product.name || product.url;
      const result = await fetchProduct(context, product);
      const entry = (state[product.url] ??= { history: [], lastNotifiedPrice: null });

      if (!result.ok) {
        entry.failStreak = (entry.failStreak || 0) + 1;
        console.log(`  ✗ ${label}: ${result.error}`);
        if (entry.failStreak === FAIL_ALERT_THRESHOLD) {
          await notify(
            `⚠️ Không lấy được giá ${FAIL_ALERT_THRESHOLD} lần liên tiếp\n` +
              `<a href="${escapeHtml(product.url)}">${escapeHtml(label)}</a>\n${escapeHtml(result.error)}`,
          );
        }
        continue;
      }

      entry.failStreak = 0;
      const { price } = result;
      const prevPrice = entry.history.at(-1)?.price;
      recordPrice(state, product.url, price);
      const lowest = Math.min(...entry.history.map((h) => h.price));
      const hit = price <= product.targetPrice;
      console.log(
        `  ${hit ? '🔥' : '•'} ${label}: ${formatVnd(price)} (mục tiêu ${formatVnd(product.targetPrice)}, nguồn ${result.source})`,
      );

      if (hit && (entry.lastNotifiedPrice == null || price < entry.lastNotifiedPrice)) {
        const sent = await notify(
          `🔥 <b>Giá đã giảm tới mức mong muốn!</b>\n` +
            `<a href="${escapeHtml(product.url)}">${escapeHtml(product.name || result.title || 'Sản phẩm')}</a>\n\n` +
            `💰 Giá hiện tại: <b>${formatVnd(price)}</b>\n` +
            `🎯 Mục tiêu: ${formatVnd(product.targetPrice)}\n` +
            (prevPrice ? `📉 Lần trước: ${formatVnd(prevPrice)}\n` : '') +
            `📊 Thấp nhất từng ghi nhận: ${formatVnd(lowest)}`,
        );
        if (sent) entry.lastNotifiedPrice = price;
      } else if (!hit) {
        entry.lastNotifiedPrice = null; // giá lên lại trên mục tiêu → lần giảm sau sẽ báo tiếp
      }
    }
  } finally {
    saveState(state);
    await context.close();
  }
}

async function watch() {
  const minutes = Number(process.env.CHECK_INTERVAL_MINUTES) || 30;
  console.log(`Chế độ theo dõi: kiểm tra mỗi ${minutes} phút. Nhấn Ctrl+C để dừng.`);
  for (;;) {
    try {
      await checkAll();
    } catch (err) {
      console.error(`Lỗi lượt kiểm tra: ${err.message}`);
    }
    const jitter = (Math.random() - 0.5) * 0.2 * minutes; // ±10% để không chạy đúng giờ cố định
    await sleep((minutes + jitter) * 60_000);
  }
}

async function add(rawUrl, target, name) {
  if (!rawUrl || !target) throw new Error('Cách dùng: add <url> <giá mục tiêu> [tên]');
  const url = normalizeUrl(rawUrl);
  if (!detectSite(url)) console.warn('! URL không phải Lazada/TikTok — vẫn thêm, sẽ thử cách lấy giá chung.');
  const targetPrice = parsePrice(target);
  if (!targetPrice) throw new Error(`Giá mục tiêu không hợp lệ: ${target}`);
  const products = loadProducts();
  if (products.some((p) => p.url === url)) throw new Error('Sản phẩm này đã có trong danh sách.');
  products.push({ name: name || '', url, targetPrice, enabled: true });
  saveProducts(products);
  console.log(`Đã thêm #${products.length}: ${formatVnd(targetPrice)} — ${url}`);
}

function list() {
  const products = loadProducts();
  const state = loadState();
  if (!products.length) return console.log('Danh sách trống.');
  for (const [i, p] of products.entries()) {
    const last = state[p.url]?.history.at(-1);
    console.log(
      `#${i + 1} ${p.enabled === false ? '[tắt] ' : ''}${p.name || '(chưa đặt tên)'}\n` +
        `    mục tiêu ${formatVnd(p.targetPrice)} | giá gần nhất ${formatVnd(last?.price)}` +
        (last ? ` lúc ${new Date(last.t).toLocaleString('vi-VN')}` : '') +
        `\n    ${p.url}`,
    );
  }
}

function remove(index) {
  const products = loadProducts();
  const i = Number(index) - 1;
  if (!(i >= 0 && i < products.length)) throw new Error(`Không có sản phẩm #${index}`);
  const [removed] = products.splice(i, 1);
  saveProducts(products);
  console.log(`Đã xoá: ${removed.name || removed.url}`);
}

// Thử lấy giá 1 link mà không lưu gì — dùng để kiểm tra trước khi thêm.
async function test(rawUrl, selector) {
  if (!rawUrl) throw new Error('Cách dùng: test <url> [selector]');
  const url = normalizeUrl(rawUrl);
  if (url !== rawUrl) console.log(`Link đã chuẩn hoá: ${url}`);
  const context = await launchBrowser();
  try {
    const r = await fetchProduct(context, { url, selector });
    console.log(r.ok ? `${r.title}\nGiá: ${formatVnd(r.price)} (nguồn: ${r.source})` : `Lỗi: ${r.error}`);
  } finally {
    await context.close();
  }
}

// Mở trình duyệt có giao diện để người dùng đăng nhập / giải captcha một lần.
async function login() {
  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://www.lazada.vn/');
  await (await context.newPage()).goto('https://shop.tiktok.com/vn');
  console.log('Đã mở trình duyệt. Đăng nhập / giải captcha nếu cần, rồi đóng cửa sổ trình duyệt để lưu lại.');
  await new Promise((r) => context.on('close', r));
}

async function chatid() {
  const chats = await listChats();
  if (!chats.length) return console.log('Chưa thấy tin nhắn nào. Hãy nhắn 1 tin bất kỳ cho bot rồi chạy lại lệnh này.');
  for (const [id, name] of chats) console.log(`${id}\t${name}`);
  console.log('\nCopy số id vào TELEGRAM_CHAT_ID trong file .env');
}

const HELP = `Theo dõi giá Lazada / TikTok Shop và báo qua Telegram

Cách dùng: node src/cli.js <lệnh>

  add <url> <giá> [tên]   Thêm sản phẩm cần theo dõi (vd: add https://... 199000 "Tai nghe")
  list                    Xem danh sách và giá gần nhất
  remove <số thứ tự>      Xoá sản phẩm
  test <url> [selector]   Thử lấy giá 1 link (không lưu)
  check                   Kiểm tra tất cả 1 lần
  watch                   Kiểm tra lặp lại theo CHECK_INTERVAL_MINUTES
  login                   Mở trình duyệt để đăng nhập / giải captcha
  chatid                  Lấy Telegram chat id sau khi đã nhắn cho bot
  telegram-test           Gửi tin nhắn thử qua Telegram

Danh sách sản phẩm lưu ở ${PRODUCTS_FILE}`;

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  add: () => add(...args),
  list,
  remove: () => remove(args[0]),
  test: () => test(args[0], args[1]),
  check: checkAll,
  watch,
  login,
  chatid,
  'telegram-test': () => sendTelegram('✅ Bot theo dõi giá đã kết nối thành công!').then(() => console.log('Đã gửi.')),
};

try {
  if (!commands[cmd]) console.log(HELP);
  else await commands[cmd]();
} catch (err) {
  console.error(`Lỗi: ${err.message}`);
  process.exitCode = 1;
}
