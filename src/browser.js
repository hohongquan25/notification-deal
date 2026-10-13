import path from 'node:path';
import { chromium } from 'playwright-core';

// Hồ sơ trình duyệt riêng để giữ cookie/đăng nhập giữa các lần chạy,
// giúp giảm khả năng bị Lazada/TikTok chặn bằng captcha.
const PROFILE_DIR = path.resolve('.browser-profile');

// headless: true  → chạy ẩn (mặc định)
//           false → hiện cửa sổ (dùng cho lệnh login)
//           'offscreen' → có giao diện nhưng cửa sổ nằm ngoài màn hình; dự phòng khi
//                         chạy ẩn bị chặn, bật bằng BROWSER_HEADLESS=false trong .env
export async function launchBrowser({ headless = process.env.BROWSER_HEADLESS === 'false' ? 'offscreen' : true } = {}) {
  const args = ['--disable-blink-features=AutomationControlled'];
  if (headless === 'offscreen') args.push('--window-position=-32000,-32000');
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: headless === true,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    viewport: { width: 1366, height: 900 },
    args,
  });
  if (headless === true) context.uaOverride = await buildUaOverride(context);
  return context;
}

// Chế độ ẩn tự xưng "HeadlessChrome" trong User-Agent và client hints (sec-ch-ua),
// TikTok dựa vào đó để hiện trang "Security Check". Thay bằng thông tin của Edge thường
// cùng phiên bản.
async function buildUaOverride(context) {
  const page = context.pages()[0] || (await context.newPage());
  const rawUa = await page.evaluate(() => navigator.userAgent);
  const version = rawUa.match(/(?:Edg|Chrome)\/([\d.]+)/)?.[1] || '0.0.0.0';
  const major = version.split('.')[0];
  const isEdge = /Edg\//.test(rawUa);
  const brands = [
    ...(isEdge ? [{ brand: 'Microsoft Edge', version: major }] : [{ brand: 'Google Chrome', version: major }]),
    { brand: 'Chromium', version: major },
    { brand: 'Not.A/Brand', version: '99' },
  ];
  return {
    userAgent: rawUa.replace('HeadlessChrome', 'Chrome'),
    acceptLanguage: 'vi-VN,vi;q=0.9,en;q=0.8',
    userAgentMetadata: {
      brands,
      fullVersionList: brands.map((b) => ({ ...b, version: b.version === '99' ? '99.0.0.0' : version })),
      platform: 'Windows',
      platformVersion: '19.0.0',
      architecture: 'x86',
      model: '',
      mobile: false,
      bitness: '64',
      wow64: false,
    },
  };
}

// Mở tab mới, áp dụng User-Agent đã sửa (nếu đang chạy ẩn) trước khi điều hướng.
export async function openPage(context) {
  const page = await context.newPage();
  if (context.uaOverride) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setUserAgentOverride', context.uaOverride);
  }
  return page;
}
