import {
  AppError,
  readConfig
} from "./chunk-2SDIGB7K.js";

// apps/api/src/integrations/telegram.ts
var Telegram = class {
  constructor(config2) {
    this.config = config2;
  }
  config;
  async call(method, body) {
    if (this.config.env.DEMO_MODE) return;
    try {
      const response = await fetch("https://api.telegram.org/bot" + this.config.env.TELEGRAM_BOT_TOKEN + "/" + method, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8e3)
      });
      const payload = await response.json();
      if (!response.ok || !payload || typeof payload !== "object" || !("ok" in payload) || !payload.ok) throw new Error("Telegram API failed");
    } catch {
      throw new AppError(502, "TELEGRAM_UNAVAILABLE", "Telegram could not deliver this message.");
    }
  }
  async openShop(chatId) {
    await this.call("sendMessage", {
      chat_id: chatId,
      text: "Welcome to " + this.config.publicConfig.shopName + ".\nSmall rituals. Good living.\nBrowse the collection and place your order in our shop.",
      reply_markup: { inline_keyboard: [[{ text: "Open Shop", web_app: { url: this.config.env.WEBAPP_URL } }]] }
    });
  }
  async notify(order, audience) {
    const money = (v) => "\u20AC" + v.toFixed(2);
    const lines = order.items.map((i) => i.qty + " \xD7 " + i.name + " \xB7 " + i.flavor + " \u2014 " + money(i.line_total)).join("\n");
    const details = "Order: #" + order.order_id + "\nDistrict: " + order.district + "\n\n" + lines + "\n\nTotal: " + money(order.total);
    const admin = audience === "admin";
    const text = admin ? "\u{1F6CD} NEW ORDER\n\n" + details + "\n\nUser: " + (order.telegram_username ? "@" + order.telegram_username : order.first_name) + "\nTelegram ID: " + order.telegram_user_id + "\nTime: " + order.created_at : "\u2713 Order received\n\n" + details + "\n\nWe will contact you with the next update.";
    const buttons = [["Confirm", "CONFIRMED"], ["Processing", "PROCESSING"], ["Ready", "READY"], ["Completed", "COMPLETED"]];
    const reply_markup = admin && this.config.adminIds.length ? { inline_keyboard: [buttons.map(([label, status]) => ({
      text: label,
      callback_data: order.order_id + ":" + status
    }))] } : void 0;
    const chunks = [];
    let chunk = "";
    for (const line of text.split("\n")) {
      if (chunk.length + line.length + 1 > 3900) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += (chunk ? "\n" : "") + line;
    }
    if (chunk) chunks.push(chunk);
    for (const [index, part] of chunks.entries()) {
      await this.call("sendMessage", {
        chat_id: admin ? this.config.env.TELEGRAM_ADMIN_CHAT_ID : order.telegram_user_id,
        text: part,
        reply_markup: index === chunks.length - 1 ? reply_markup : void 0
      });
    }
  }
};

// scripts/setupBot.ts
var config = readConfig();
if (config.env.DEMO_MODE) throw new Error("Set DEMO_MODE=false and configure your credentials first.");
var origin = process.argv.find((arg) => arg.startsWith("--api-url="))?.slice("--api-url=".length) ?? config.env.WEBAPP_URL;
if (!origin.startsWith("https://") || !config.env.WEBAPP_URL.startsWith("https://")) throw new Error("Bot setup requires public HTTPS frontend and backend URLs.");
var telegram = new Telegram(config);
await telegram.call("setMyCommands", { commands: [{ command: "start", description: "Open the shop" }] });
await telegram.call("setChatMenuButton", { menu_button: { type: "web_app", text: "Open Shop", web_app: { url: config.env.WEBAPP_URL } } });
await telegram.call("setWebhook", {
  url: new URL("/api/telegram/webhook", origin).toString(),
  secret_token: config.env.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: false
});
console.info("Bot commands, menu and webhook configured.");
