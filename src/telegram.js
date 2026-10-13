const api = (method) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(text) {
  if (!telegramConfigured()) throw new Error('Chưa cấu hình TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID trong file .env');
  const res = await fetch(api('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`Telegram lỗi: ${body.description}`);
}

// Liệt kê các chat đã nhắn cho bot, để người dùng lấy TELEGRAM_CHAT_ID.
export async function listChats() {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('Chưa cấu hình TELEGRAM_BOT_TOKEN trong file .env');
  const body = await (await fetch(api('getUpdates'))).json();
  if (!body.ok) throw new Error(`Telegram lỗi: ${body.description}`);
  const chats = new Map();
  for (const u of body.result) {
    const chat = (u.message || u.channel_post || u.my_chat_member)?.chat;
    if (chat) chats.set(chat.id, chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username);
  }
  return [...chats];
}

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
