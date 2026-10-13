// Cấu hình riêng cho từng sàn: nhận diện URL, các mẫu JSON nhúng trong HTML,
// CSS selector dự phòng và cách phát hiện trang bị chặn (captcha).

export const SITES = [
  {
    name: 'lazada',
    match: /(^|\.)lazada\./i,
    // Bỏ query string (tham số theo dõi), giữ nguyên đường dẫn có mã SKU.
    normalize: (u) => `${u.origin}${u.pathname}`,
    // Không dùng "pdt_price": đó là giá gốc, không phải giá sau giảm.
    jsonPatterns: [/"salePrice"\s*:\s*\{[^{}]*?"value"\s*:\s*"?([\d.]+)/],
    selectors: [
      '.pdp-v2-product-price-content-salePrice-amount',
      '.pdp-price_type_normal',
      '.pdp-product-price .pdp-price',
    ],
    isBlocked: (url, html) =>
      /_____tmd_____|\/punish/i.test(url) || /slide to verify|nc_1_n1z|baxia-punish/i.test(html),
  },
  {
    name: 'tiktok',
    match: /(^|\.)tiktok\.com$/i,
    // Link chia sẻ từ app (www.tiktok.com/view/product/<id>) luôn bị captcha,
    // còn shop.tiktok.com/<vùng>/pdp/<id> thì không — đổi về dạng sau.
    normalize: (u) => {
      const id = u.pathname.match(/(?:\/product\/|\/pdp\/(?:[^/]+\/)?)(\d{10,})/)?.[1];
      const region = (u.searchParams.get('share_region') || u.pathname.match(/^\/([a-z]{2})\/pdp\//)?.[1] || 'vn').toLowerCase();
      return id ? `https://shop.tiktok.com/${region}/pdp/${id}` : u.href;
    },
    jsonPatterns: [
      /"real_price"\s*:\s*"([^"]+)"/,
      /"sale_price_format"\s*:\s*"([^"]+)"/,
      /"min_price"\s*:\s*"?([\d.]+)/,
    ],
    selectors: [
      '[class*="price-w"] [class*="price"]',
      '[data-e2e*="price"]',
      '[class*="ProductPrice"]',
      '[class*="product-price"]',
    ],
    isBlocked: (url, html) =>
      /<title>\s*Security Check|secsdk-captcha|captcha_container|verify-bar/i.test(html) && !/real_price/.test(html),
  },
];

export function detectSite(url) {
  const host = new URL(url).hostname;
  return SITES.find((s) => s.match.test(host)) || null;
}

export function normalizeUrl(url) {
  const u = new URL(url.trim());
  return detectSite(u.href)?.normalize?.(u) ?? u.href;
}
