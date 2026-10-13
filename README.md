# notification-deal

Theo dõi giá sản phẩm trên **Lazada** và **TikTok Shop**. Khi giá giảm bằng hoặc thấp hơn mức bạn đặt, tool gửi tin nhắn qua **Telegram**.

Tool dùng trình duyệt Edge có sẵn trên Windows để mở trang (không tải thêm trình duyệt), và lưu cookie trong `.browser-profile/` để ít bị chặn hơn.

## Cài đặt

Yêu cầu Node.js 21 trở lên.

```bash
npm install
```

## Cấu hình Telegram

1. Mở Telegram, chat với **@BotFather**, gõ `/newbot` và làm theo hướng dẫn. Bạn sẽ nhận được **token**.
2. Mở file `.env` và điền `TELEGRAM_BOT_TOKEN=<token>`.
3. Tìm bot vừa tạo trên Telegram và nhắn cho nó 1 tin bất kỳ (ví dụ `hi`).
4. Chạy lệnh sau để lấy chat id, rồi điền vào `TELEGRAM_CHAT_ID` trong `.env`:
   ```bash
   node src/cli.js chatid
   ```
5. Gửi tin thử:
   ```bash
   node src/cli.js telegram-test
   ```

> Muốn báo vào nhóm: thêm bot vào nhóm, nhắn 1 tin trong nhóm, rồi chạy `chatid`. Id của nhóm là số âm.

## Sử dụng

```bash
# Thử lấy giá 1 link trước khi thêm
node src/cli.js test "https://www.lazada.vn/products/...html"

# Thêm sản phẩm: link, giá mục tiêu, tên (tuỳ chọn)
node src/cli.js add "https://shop.tiktok.com/vn/pdp/..." 150000 "Tai nghe"

node src/cli.js list        # xem danh sách và giá gần nhất
node src/cli.js remove 2    # xoá sản phẩm #2
node src/cli.js check       # kiểm tra tất cả 1 lần
node src/cli.js watch       # kiểm tra lặp lại mỗi CHECK_INTERVAL_MINUTES phút
```

Danh sách sản phẩm nằm trong `products.json`, bạn có thể sửa tay. Đặt `"enabled": false` để tạm dừng theo dõi một sản phẩm.

### Khi nào tool gửi thông báo?

- Khi giá **≤ giá mục tiêu**, tool gửi 1 tin.
- Sau đó, nếu giá **giảm tiếp**, tool gửi thêm tin. Giá giữ nguyên thì không gửi lại.
- Nếu giá **lên lại trên mục tiêu** rồi giảm xuống lần nữa, tool báo lại.
- Nếu một sản phẩm **lỗi 3 lần liên tiếp** (bị chặn, link hỏng...), tool gửi cảnh báo.

Lịch sử giá được lưu trong `data/state.json`.

## Lưu ý theo từng sàn

**Lazada** chạy ẩn hoàn toàn và lấy đúng **giá bán sau giảm**, không lấy giá gốc.

**TikTok Shop** chặn trình duyệt chạy ẩn (trang "Security Check") vì trình duyệt tự xưng là `HeadlessChrome`. Tool sửa User-Agent và client hints thành Edge thường nên vẫn chạy ẩn được (xem `src/browser.js`).

- Link chia sẻ từ app (`www.tiktok.com/view/product/...`) luôn bị chặn, nên tool tự đổi sang dạng `shop.tiktok.com/vn/pdp/<id>` khi bạn `add` hoặc `test`.
- Nếu sau này TikTok đổi cách chặn, đặt `BROWSER_HEADLESS=false` trong `.env`. Khi đó tool mở Edge có giao diện nhưng đặt cửa sổ ra ngoài màn hình.
- Giá TikTok có thể dao động giữa các lần kiểm tra do giá động hoặc voucher.

**Nếu bị captcha:** chạy `npm run login`. Lệnh này mở trình duyệt để bạn giải captcha hoặc đăng nhập, rồi đóng cửa sổ lại. Cookie được giữ cho các lần chạy sau.

**Nếu không tìm thấy giá** (trang thay đổi giao diện):
1. Mở trang sản phẩm, chuột phải vào giá, chọn *Inspect*.
2. Lấy CSS selector của phần tử giá.
3. Thêm selector đó vào sản phẩm trong `products.json`:
   ```json
   { "name": "...", "url": "...", "targetPrice": 150000, "selector": ".ten-class-gia" }
   ```
4. Thử lại bằng `node src/cli.js test "<url>" ".ten-class-gia"`.

Với sản phẩm có nhiều phân loại (màu, size), giá lấy được là giá đang hiển thị mặc định trên trang. Với Lazada, hãy dùng link có đúng mã SKU (phần `-s123...` trong URL) của phân loại bạn muốn.

## Chạy tự động

**Cách 1:** để một cửa sổ terminal chạy `npm run watch`.

**Cách 2 (khuyên dùng):** dùng Windows Task Scheduler để chạy `check` định kỳ, kể cả sau khi khởi động lại máy. Mở PowerShell và chạy:

```powershell
$dir = "D:\hohongquan25\notification-deal"
$action  = New-ScheduledTaskAction -Execute "node.exe" -Argument "src\cli.js check" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "notification-deal" -Action $action -Trigger $trigger
```

Gỡ task: `Unregister-ScheduledTask -TaskName notification-deal`.

## Cấu trúc

```
src/cli.js       Các lệnh, logic so giá và gửi thông báo
src/extract.js   Mở trang và trích xuất giá
src/sites.js     Cấu hình riêng cho Lazada / TikTok (selector, mẫu JSON, phát hiện captcha)
src/browser.js   Khởi chạy Edge qua playwright-core
src/telegram.js  Gửi tin nhắn Telegram
src/store.js     Đọc/ghi products.json và data/state.json
```

Muốn thêm sàn khác (Shopee, Tiki...), thêm một mục mới vào `SITES` trong `src/sites.js`.
