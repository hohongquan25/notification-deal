import { openPage } from './browser.js';
import { detectSite } from './sites.js';

// Chuyển "₫1.299.000", "1,299,000 ₫", 1299000 ... thành số nguyên VND.
export function parsePrice(value) {
  if (typeof value === 'number') return value > 0 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const m = value.replace(/[.,]00(?!\d)/, '').match(/\d[\d.,\s]*/);
  if (!m) return null;
  const n = Number(m[0].replace(/\D/g, ''));
  return n > 0 ? n : null;
}

export function formatVnd(n) {
  return n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`;
}

// Mở trang sản phẩm và lấy giá theo thứ tự ưu tiên:
// selector người dùng chỉ định > selector của sàn > JSON nhúng > JSON-LD > thẻ meta.
export async function fetchProduct(context, product) {
  const site = detectSite(product.url);
  const page = await openPage(context);
  try {
    await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const html = await page.content();
    if (site?.isBlocked(page.url(), html)) {
      return { ok: false, blocked: true, error: 'Bị chặn bởi captcha — chạy "npm run login" để xác minh thủ công.' };
    }

    const selectors = [product.selector, ...(site?.selectors || [])].filter(Boolean);
    const dom = await page.evaluate((selectors) => {
      const text = (sel) => {
        try {
          return document.querySelector(sel)?.textContent.trim() || null;
        } catch {
          return null;
        }
      };
      const ld = [];
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          for (const it of [].concat(JSON.parse(s.textContent)).flatMap((x) => x['@graph'] || [x])) {
            if (!/Product/i.test(String(it['@type']))) continue;
            for (const o of [].concat(it.offers || [])) ld.push(o.price ?? o.lowPrice ?? null);
          }
        } catch {}
      }
      const meta = (n) =>
        document.querySelector(`meta[property="${n}"],meta[name="${n}"],meta[itemprop="${n}"]`)?.content || null;
      return {
        title: meta('og:title') || document.querySelector('h1')?.textContent.trim() || document.title,
        ld,
        meta: meta('product:price:amount') || meta('og:price:amount') || meta('price'),
        selectorTexts: selectors.map((sel) => [sel, text(sel)]),
      };
    }, selectors);

    // Giá hiển thị trên trang (selector) đáng tin hơn JSON nhúng, vốn hay lẫn giá gốc.
    const candidates = dom.selectorTexts.map(([sel, t], i) => [
      product.selector && i === 0 ? 'selector:custom' : `selector:${sel}`,
      t,
    ]);
    for (const re of site?.jsonPatterns || []) candidates.push(['json-nhúng', html.match(re)?.[1]]);
    for (const p of dom.ld) candidates.push(['json-ld', p]);
    candidates.push(['meta', dom.meta]);

    const title = dom.title?.trim().slice(0, 150);
    for (const [source, raw] of candidates) {
      const price = parsePrice(raw);
      if (price) return { ok: true, price, source, title, site: site?.name };
    }
    return {
      ok: false,
      title,
      error: 'Không tìm thấy giá trên trang. Thử thêm "selector" (CSS của phần tử giá) cho sản phẩm này trong products.json.',
    };
  } catch (err) {
    return { ok: false, error: err.message.split('\n')[0] };
  } finally {
    await page.close().catch(() => {});
  }
}
