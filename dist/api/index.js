// apps/api/src/config/index.ts
import "dotenv/config";
import { z } from "zod";
var bool = (fallback) => z.enum(["true", "false"]).default(String(fallback)).transform((v) => v === "true");
var csv = (value) => value.split(",").map((s) => s.trim()).filter(Boolean);
var schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DEMO_MODE: bool(false),
  WEBAPP_URL: z.url().default("http://localhost:5173"),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_ADMIN_CHAT_ID: z.string().default(""),
  TELEGRAM_ADMIN_USER_IDS: z.string().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  GOOGLE_SHEET_ID: z.string().default(""),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().default(""),
  GOOGLE_PRIVATE_KEY: z.string().default(""),
  INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  SHOP_NAME: z.string().min(1).default("Amber & Smoke"),
  DISTRICTS: z.string().default("Centrs,Zolit\u016Bde,Imanta,Salaspils"),
  BLOCKED_DISTRICTS: z.string().default(""),
  DISABLED_CATEGORIES: z.string().default(""),
  HIDE_SOLD_OUT: bool(false),
  MINIMUM_AGE: z.coerce.number().int().min(18).max(100).default(18),
  LEGAL_NOTICE: z.string().default("For adults only. Availability and delivery depend on your district."),
  AGE_VERIFICATION_MODE: z.enum(["declaration", "external"]).default("declaration"),
  AGE_VERIFICATION_URL: z.string().default(""),
  AGE_VERIFICATION_API_KEY: z.string().default(""),
  DATA_DIR: z.string().default("./data"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0)
});
function readConfig(input = process.env) {
  const env = schema.parse(input);
  if (env.NODE_ENV === "production" && env.DEMO_MODE) throw new Error("DEMO_MODE is forbidden in production");
  if (!env.DEMO_MODE) {
    for (const key of [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_ADMIN_CHAT_ID",
      "GOOGLE_SHEET_ID",
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_PRIVATE_KEY",
      "TELEGRAM_WEBHOOK_SECRET"
    ]) {
      if (!env[key]) throw new Error("Missing environment variable: " + key);
    }
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET)) throw new Error("Webhook secret must be 32\u2013256 URL-safe characters");
    if (!/^-?\d+$/.test(env.TELEGRAM_ADMIN_CHAT_ID)) throw new Error("Admin chat ID must be numeric");
  }
  if (env.NODE_ENV === "production" && !env.WEBAPP_URL.startsWith("https://")) throw new Error("HTTPS WEBAPP_URL required");
  if (env.AGE_VERIFICATION_MODE === "external" && (!env.AGE_VERIFICATION_URL.startsWith("https://") || !env.AGE_VERIFICATION_API_KEY)) {
    throw new Error("External verification needs an HTTPS URL and API key");
  }
  const districts = csv(env.DISTRICTS);
  if (!districts.length || new Set(districts).size !== districts.length) throw new Error("DISTRICTS must be unique and nonempty");
  const adminIds = csv(env.TELEGRAM_ADMIN_USER_IDS).map(Number);
  if (adminIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error("Invalid admin user IDs");
  const publicConfig = {
    shopName: env.SHOP_NAME,
    districts,
    currency: "EUR",
    hideSoldOut: env.HIDE_SOLD_OUT,
    demoMode: env.DEMO_MODE,
    compliance: {
      minimumAge: env.MINIMUM_AGE,
      legalNotice: env.LEGAL_NOTICE,
      disabledCategories: csv(env.DISABLED_CATEGORIES),
      blockedDistricts: csv(env.BLOCKED_DISTRICTS),
      ageVerificationMode: env.AGE_VERIFICATION_MODE
    }
  };
  return { env, publicConfig, adminIds };
}

// apps/api/src/app.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit as rateLimit2 } from "express-rate-limit";
import { resolve } from "path";

// apps/api/src/utils/errors.ts
var AppError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
  status;
  code;
};
function logFailure(event, error, orderId) {
  console.error(JSON.stringify({ event, orderId, kind: error instanceof AppError ? error.code : "UPSTREAM_ERROR", at: (/* @__PURE__ */ new Date()).toISOString() }));
}

// apps/api/src/config/compliance.ts
function isVisible(product, config2, district) {
  return product.active && !config2.publicConfig.compliance.disabledCategories.includes(product.category) && (!config2.publicConfig.hideSoldOut || product.available > 0) && (!district || !product.blocked_districts.includes(district));
}
function createAgeVerifier(config2) {
  return { async verify(user, request) {
    if (!request.age_confirmed) throw new AppError(403, "AGE_REQUIRED", "Please confirm your age.");
    if (config2.env.AGE_VERIFICATION_MODE === "declaration") return;
    if (!request.age_verification_token) throw new AppError(403, "AGE_VERIFICATION_REQUIRED", "A verified age token is required.");
    let response;
    try {
      response = await fetch(config2.env.AGE_VERIFICATION_URL, {
        method: "POST",
        signal: AbortSignal.timeout(8e3),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + config2.env.AGE_VERIFICATION_API_KEY },
        body: JSON.stringify({ user_id: user.id, minimum_age: config2.env.MINIMUM_AGE, token: request.age_verification_token })
      });
      const result = await response.json();
      if (response.ok && typeof result === "object" && result !== null && "verified" in result && result.verified === true && "user_id" in result && result.user_id === user.id) return;
    } catch {
      throw new AppError(503, "VERIFICATION_UNAVAILABLE", "Age verification is temporarily unavailable.");
    }
    throw new AppError(403, "AGE_VERIFICATION_FAILED", "We could not verify your age.");
  } };
}

// apps/api/src/services/orderService.ts
import { createHash, randomBytes } from "crypto";

// apps/api/src/utils/mutex.ts
var Mutex = class {
  tail = Promise.resolve();
  async run(work) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve3) => {
      release = resolve3;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
};

// apps/api/src/services/orderService.ts
function confirmOrder(order) {
  const { order_id, created_at, district, items, subtotal, total, status } = order;
  return { order_id, created_at, district, items, subtotal, total, status };
}
var OrderService = class {
  constructor(store2, config2, ageVerifier) {
    this.store = store2;
    this.config = config2;
    this.ageVerifier = ageVerifier;
  }
  store;
  config;
  ageVerifier;
  mutex = new Mutex();
  async processOrderAtomically(request, user) {
    const canonical = { district: request.district, items: [...request.items].sort((a, b) => a.product_id.localeCompare(b.product_id)) };
    const hash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
    return this.mutex.run(async () => {
      const orders2 = await this.store.getOrders();
      const existing = orders2.find((o) => o.client_order_id === request.client_order_id);
      if (existing) {
        if (existing.telegram_user_id !== user.id || existing.request_hash !== hash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This checkout identifier was already used for a different order.");
        return { order: existing, created: false };
      }
      await this.store.assertWritable();
      if (!this.config.publicConfig.districts.includes(request.district)) throw new AppError(400, "INVALID_DISTRICT", "Choose a valid delivery district.");
      if (this.config.publicConfig.compliance.blockedDistricts.includes(request.district)) throw new AppError(403, "REGION_RESTRICTED", "Checkout is unavailable in this district.");
      await this.ageVerifier.verify(user, request);
      const products = await this.store.getProducts();
      const stock = [];
      const items = request.items.map((item) => {
        const found = products.find((p2) => p2.product.id === item.product_id);
        if (!found || !isVisible(found.product, this.config, request.district)) throw new AppError(409, "PRODUCT_UNAVAILABLE", "An item is no longer available in your district. Please review your bag.");
        const p = found.product;
        if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > p.available) throw new AppError(409, "OUT_OF_STOCK", "Stock has changed. Please review the quantities in your bag.");
        stock.push({ product_id: p.id, row: found.row, available: p.available - item.qty });
        return { product_id: p.id, name: p.name, flavor: p.flavor, qty: item.qty, unit_price: p.price, line_total: Math.round(p.price * 100) * item.qty / 100 };
      });
      const total = items.reduce((sum, item) => sum + Math.round(item.line_total * 100), 0) / 100;
      let orderId;
      do {
        orderId = "AS-" + (/* @__PURE__ */ new Date()).toISOString().slice(2, 10).replaceAll("-", "") + "-" + randomBytes(5).toString("hex").toUpperCase();
      } while (orders2.some((order2) => order2.order_id === orderId));
      const order = {
        order_id: orderId,
        client_order_id: request.client_order_id,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        telegram_user_id: user.id,
        telegram_username: user.username ?? "",
        first_name: user.first_name,
        district: request.district,
        items,
        subtotal: total,
        total,
        status: "NEW",
        request_hash: hash,
        customer_notified: false,
        admin_notified: false
      };
      await this.store.commitOrder(order, stock);
      return { order, created: true };
    });
  }
  async changeStatus(orderId, status) {
    return this.mutex.run(async () => {
      await this.store.assertWritable();
      const order = (await this.store.getOrders()).find((o) => o.order_id === orderId);
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
      if (order.status === status) return;
      const next = { NEW: "CONFIRMED", CONFIRMED: "PROCESSING", PROCESSING: "READY", READY: "COMPLETED" };
      if (next[order.status] !== status) throw new AppError(409, "INVALID_STATUS_TRANSITION", "Use the next status in the order workflow.");
      await this.store.updateOrder(orderId, { status });
    });
  }
};

// apps/api/src/services/productService.ts
var ProductService = class {
  constructor(store2, config2) {
    this.store = store2;
    this.config = config2;
  }
  store;
  config;
  async list(district) {
    return (await this.store.getProducts()).map((row) => row.product).filter((product) => isVisible(product, this.config, district)).sort((a, b) => a.sort_order - b.sort_order);
  }
};

// apps/api/src/services/notificationService.ts
var NotificationService = class {
  constructor(orders2, telegram) {
    this.orders = orders2;
    this.telegram = telegram;
  }
  orders;
  telegram;
  running = false;
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.orders.mutex.run(async () => {
        await this.orders.store.assertWritable();
        return (await this.orders.store.getOrders()).filter((o) => !o.customer_notified || !o.admin_notified).slice(0, 10);
      });
      for (const order of pending) {
        for (const audience of ["customer", "admin"]) {
          const field = audience === "customer" ? "customer_notified" : "admin_notified";
          if (order[field]) continue;
          try {
            await this.telegram.notify(order, audience);
            await this.orders.mutex.run(async () => {
              await this.orders.store.assertWritable();
              await this.orders.store.updateOrder(order.order_id, { [field]: true });
            });
          } catch (error) {
            logFailure("notification_failed_" + audience, error, order.order_id);
          }
        }
      }
    } catch (error) {
      logFailure("notification_worker_failed", error);
    } finally {
      this.running = false;
    }
  }
};

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

// apps/api/src/routes/index.ts
import { Router } from "express";
import { rateLimit } from "express-rate-limit";

// shared/schemas.ts
import { z as z2 } from "zod";
var orderRequestSchema = z2.object({
  client_order_id: z2.uuid(),
  district: z2.string().min(1).max(80),
  items: z2.array(z2.object({ product_id: z2.string().min(1).max(80), qty: z2.number().int().min(1).max(99) }).strict()).min(1).max(40),
  age_confirmed: z2.literal(true),
  age_verification_token: z2.string().min(1).max(4096).optional()
}).strict().refine(
  (value) => new Set(value.items.map((item) => item.product_id)).size === value.items.length,
  { message: "Duplicate product IDs are not allowed" }
);
var telegramUserSchema = z2.object({
  id: z2.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  first_name: z2.string().max(200),
  username: z2.string().max(100).optional()
});

// apps/api/src/utils/validateTelegramInitData.ts
import { createHmac, timingSafeEqual } from "crypto";
function validateTelegramInitData(initData, botToken, maxAgeSeconds = 3600, now = Math.floor(Date.now() / 1e3)) {
  const invalid = () => new AppError(401, "INVALID_INIT_DATA", "Open the shop again from Telegram to refresh your session.");
  if (!botToken || !initData || initData.length > 16384) throw invalid();
  const params = new URLSearchParams(initData);
  const keys = [...params.keys()];
  if (keys.length !== new Set(keys).size) throw invalid();
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw invalid();
  params.delete("hash");
  const checkString = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => k + "=" + v).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) throw invalid();
  const date = params.get("auth_date") ?? "";
  const timestamp = Number(date);
  if (!/^\d+$/.test(date) || !Number.isSafeInteger(timestamp) || timestamp > now + 30 || now - timestamp > maxAgeSeconds) throw invalid();
  try {
    return telegramUserSchema.parse(JSON.parse(params.get("user") ?? "null"));
  } catch {
    throw invalid();
  }
}

// apps/api/src/controllers/orderController.ts
function orderController(config2, orders2, notifications2) {
  return async (req, res) => {
    const header = req.get("Authorization") ?? "";
    const user = config2.env.DEMO_MODE && !header ? { id: 1000001, first_name: "Demo visitor", username: "demo_visitor" } : validateTelegramInitData(header.startsWith("tma ") ? header.slice(4) : "", config2.env.TELEGRAM_BOT_TOKEN, config2.env.INIT_DATA_MAX_AGE_SECONDS);
    const body = orderRequestSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, "INVALID_ORDER", "Check your items, delivery district and age confirmation.");
    const { order, created } = await orders2.processOrderAtomically(body.data, user);
    res.status(created ? 201 : 200).json({ success: true, data: confirmOrder(order) });
    void notifications2.drain();
  };
}

// apps/api/src/controllers/botController.ts
import { timingSafeEqual as timingSafeEqual2 } from "crypto";
import { z as z3 } from "zod";
var updateSchema = z3.object({
  update_id: z3.number().int(),
  message: z3.object({ text: z3.string().optional(), chat: z3.object({ id: z3.number().int(), type: z3.string() }) }).optional(),
  callback_query: z3.object({
    id: z3.string(),
    data: z3.string().optional(),
    from: z3.object({ id: z3.number().int() }),
    message: z3.object({ chat: z3.object({ id: z3.number().int() }) }).optional()
  }).optional()
});
function botController(config2, telegram, orders2) {
  return async (req, res) => {
    const incoming = Buffer.from(req.get("X-Telegram-Bot-Api-Secret-Token") ?? "");
    const expected = Buffer.from(config2.env.TELEGRAM_WEBHOOK_SECRET);
    if (!expected.length || incoming.length !== expected.length || !timingSafeEqual2(incoming, expected)) throw new AppError(401, "UNAUTHORIZED", "Invalid webhook secret.");
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "INVALID_UPDATE", "Invalid Telegram update.");
    const update = parsed.data;
    if (update.message?.chat.type === "private" && /^\/start(?:@\w+)?(?:\s|$)/.test(update.message.text ?? "")) {
      await telegram.openShop(update.message.chat.id);
    }
    const callback = update.callback_query;
    if (callback) {
      let message = "Unknown action.";
      if (!config2.adminIds.includes(callback.from.id) || String(callback.message?.chat.id) !== config2.env.TELEGRAM_ADMIN_CHAT_ID) {
        message = "You are not authorized to update orders.";
      } else {
        const match = /^(AS-\d{6}-[A-F0-9]{10}):(CONFIRMED|PROCESSING|READY|COMPLETED)$/.exec(callback.data ?? "");
        if (match) {
          try {
            await orders2.changeStatus(match[1], z3.enum(["CONFIRMED", "PROCESSING", "READY", "COMPLETED"]).parse(match[2]));
            message = "Order status: " + match[2];
          } catch (error) {
            if (error instanceof AppError && error.status < 500) message = error.message;
            else throw error;
          }
        }
      }
      await telegram.call("answerCallbackQuery", { callback_query_id: callback.id, text: message });
    }
    res.json({ success: true });
  };
}

// apps/api/src/routes/index.ts
function routes(config2, orders2, products, notifications2, telegram) {
  const router = Router();
  router.get("/config", (_req, res) => {
    res.json({ success: true, data: config2.publicConfig });
  });
  router.get("/products", async (req, res) => {
    const district = typeof req.query.district === "string" ? req.query.district : void 0;
    res.json({ success: true, data: await products.list(district) });
  });
  router.post(
    "/orders",
    rateLimit({
      windowMs: 6e4,
      limit: 15,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a minute." } }
    }),
    orderController(config2, orders2, notifications2)
  );
  router.post("/telegram/webhook", botController(config2, telegram, orders2));
  return router;
}

// apps/api/src/app.ts
function createApp(config2, store2, telegram = new Telegram(config2)) {
  const app2 = express();
  app2.disable("x-powered-by");
  app2.set("trust proxy", config2.env.TRUST_PROXY_HOPS);
  app2.use(helmet({ contentSecurityPolicy: { directives: {
    "script-src": ["'self'", "https://telegram.org"],
    "img-src": ["'self'", "data:", "https:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "connect-src": ["'self'"],
    "frame-ancestors": ["'self'", "https://web.telegram.org", "https://*.telegram.org"]
  } }, frameguard: false }));
  app2.use(cors({ origin: new URL(config2.env.WEBAPP_URL).origin, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"] }));
  app2.use(express.json({ limit: "32kb" }));
  app2.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app2.use("/api", rateLimit2({
    windowMs: 6e4,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, error: { code: "RATE_LIMITED", message: "Please slow down and try again." } }
  }));
  const orders2 = new OrderService(store2, config2, createAgeVerifier(config2));
  const notifications2 = new NotificationService(orders2, telegram);
  app2.get("/health", async (_req, res) => {
    try {
      await store2.assertWritable();
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "checkout_paused" });
    }
  });
  app2.use("/api", routes(config2, orders2, new ProductService(store2, config2), notifications2, telegram));
  app2.use("/api", (_req, _res, next) => {
    next(new AppError(404, "NOT_FOUND", "API endpoint not found."));
  });
  if (config2.env.NODE_ENV === "production") {
    app2.use(express.static(resolve("dist/web")));
    app2.get("/{*path}", (_req, res) => {
      res.sendFile(resolve("dist/web/index.html"));
    });
  }
  app2.use((error, _req, res, _next) => {
    const err = error instanceof AppError ? error : error instanceof SyntaxError ? new AppError(400, "INVALID_JSON", "Invalid JSON request.") : typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large" ? new AppError(413, "PAYLOAD_TOO_LARGE", "Request is too large.") : new AppError(500, "INTERNAL_ERROR", "Something went wrong. Please retry with the same checkout.");
    if (err.status >= 500) logFailure("request_failed", error);
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
  });
  return { app: app2, orders: orders2, notifications: notifications2 };
}

// apps/api/src/repositories/memoryStore.ts
var MemoryStore = class {
  products;
  orders = [];
  constructor(products) {
    this.products = structuredClone(products);
  }
  async assertWritable() {
  }
  async getProducts() {
    return structuredClone(this.products.map((product, i) => ({ product, row: i + 1 })));
  }
  async getOrders() {
    return structuredClone(this.orders);
  }
  async commitOrder(order, stock) {
    const next = structuredClone(this.products);
    for (const update of stock) next.find((p) => p.id === update.product_id).available = update.available;
    this.products = next;
    this.orders.push(structuredClone(order));
  }
  async updateOrder(orderId, changes) {
    Object.assign(this.orders.find((o) => o.order_id === orderId), changes);
  }
};

// apps/api/src/integrations/googleSheets.ts
import { GoogleAuth } from "google-auth-library";
var GoogleSheets = class {
  auth;
  base;
  constructor(config2) {
    this.auth = new GoogleAuth({ credentials: {
      client_email: config2.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: config2.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
    }, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    this.base = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(config2.env.GOOGLE_SHEET_ID);
  }
  async request(path, body) {
    try {
      const token = await this.auth.getAccessToken();
      const response = await fetch(this.base + path, {
        method: body ? "POST" : "GET",
        signal: AbortSignal.timeout(15e3),
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : void 0
      });
      if (!response.ok) throw new Error("Google Sheets request failed");
      return await response.json();
    } catch {
      throw new AppError(503, "SHEETS_UNAVAILABLE", "The shop is temporarily unavailable. Please try again shortly.");
    }
  }
  metadata() {
    return this.request("?fields=sheets.properties(sheetId,title)");
  }
  values(range) {
    return this.request("/values/" + encodeURIComponent(range) + "?valueRenderOption=UNFORMATTED_VALUE");
  }
  batch(requests) {
    return this.request(":batchUpdate", { requests });
  }
};
function cell(value) {
  return { userEnteredValue: typeof value === "number" ? { numberValue: value } : typeof value === "boolean" ? { boolValue: value } : { stringValue: value } };
}

// apps/api/src/repositories/sheetSchema.ts
import { z as z4 } from "zod";
var productHeaders = ["id", "sku", "category", "brand", "name", "flavor", "description", "price", "available", "image_url", "active", "sort_order", "blocked_districts"];
var orderHeaders = ["order_id", "created_at", "telegram_user_id", "telegram_username", "first_name", "district", "items_json", "subtotal", "total", "status", "client_order_id", "request_hash", "customer_notified", "admin_notified"];
var productSchema = z4.object({
  id: z4.string().min(1).max(80),
  sku: z4.string(),
  category: z4.string().min(1),
  brand: z4.string(),
  name: z4.string().min(1).max(160),
  flavor: z4.string().max(120),
  description: z4.string().max(2e3),
  price: z4.number().min(0).max(1e5),
  available: z4.number().int().min(0).max(1e6),
  image_url: z4.string().refine((v) => v === "" || /^https:\/\//.test(v) || /^\/products\/[a-z0-9-]+\.svg$/.test(v)),
  active: z4.boolean(),
  sort_order: z4.number().finite(),
  blocked_districts: z4.array(z4.string())
});
var statusSchema = z4.enum(["NEW", "CONFIRMED", "PROCESSING", "READY", "COMPLETED", "CANCELLED"]);
var orderSchema = z4.object({
  order_id: z4.string().min(1),
  created_at: z4.iso.datetime(),
  telegram_user_id: z4.number().int().positive(),
  telegram_username: z4.string(),
  first_name: z4.string(),
  district: z4.string(),
  items: z4.array(z4.object({
    product_id: z4.string(),
    name: z4.string(),
    flavor: z4.string(),
    qty: z4.number().int().positive(),
    unit_price: z4.number().nonnegative(),
    line_total: z4.number().nonnegative()
  })).min(1),
  subtotal: z4.number().nonnegative(),
  total: z4.number().nonnegative(),
  status: statusSchema,
  client_order_id: z4.uuid(),
  request_hash: z4.string().length(64),
  customer_notified: z4.boolean(),
  admin_notified: z4.boolean()
});
function boolean(value) {
  return value === true || value === "TRUE";
}
var string = (v) => String(v ?? "");
function assertHeaders(row, expected) {
  if (expected.some((header, i) => row[i] !== header)) throw new AppError(503, "SHEET_SCHEMA_ERROR", "The shop data needs administrator attention.");
}
function parseProduct(row) {
  const parsed = productSchema.safeParse({
    id: string(row[0]),
    sku: string(row[1]),
    category: string(row[2]),
    brand: string(row[3]),
    name: string(row[4]),
    flavor: string(row[5]),
    description: string(row[6]),
    price: row[7] === "" || row[7] == null ? NaN : Number(row[7]),
    available: row[8] === "" || row[8] == null ? NaN : Number(row[8]),
    image_url: string(row[9]),
    active: boolean(row[10]),
    sort_order: Number(row[11] ?? 0),
    blocked_districts: string(row[12]).split(",").map((s) => s.trim()).filter(Boolean)
  });
  if (!parsed.success || Math.abs(parsed.data.price * 100 - Math.round(parsed.data.price * 100)) > 1e-5) {
    throw new AppError(503, "SHEET_SCHEMA_ERROR", "A product row contains invalid data.");
  }
  return parsed.data;
}
function parseOrder(row) {
  try {
    return orderSchema.parse({
      order_id: string(row[0]),
      created_at: string(row[1]),
      telegram_user_id: Number(row[2]),
      telegram_username: string(row[3]),
      first_name: string(row[4]),
      district: string(row[5]),
      items: JSON.parse(string(row[6])),
      subtotal: Number(row[7]),
      total: Number(row[8]),
      status: row[9],
      client_order_id: row[10],
      request_hash: row[11],
      customer_notified: boolean(row[12]),
      admin_notified: boolean(row[13])
    });
  } catch {
    throw new AppError(503, "SHEET_SCHEMA_ERROR", "An order row contains invalid data.");
  }
}
function orderValues(order) {
  return [
    order.order_id,
    order.created_at,
    order.telegram_user_id,
    order.telegram_username,
    order.first_name,
    order.district,
    JSON.stringify(order.items),
    order.subtotal,
    order.total,
    order.status,
    order.client_order_id,
    order.request_hash,
    order.customer_notified,
    order.admin_notified
  ];
}

// apps/api/src/repositories/sheetsStore.ts
var SheetsStore = class {
  constructor(sheets, journal) {
    this.sheets = sheets;
    this.journal = journal;
  }
  sheets;
  journal;
  async assertWritable() {
    await this.journal.assertClear();
  }
  async ids() {
    const meta = await this.sheets.metadata();
    const products = meta.sheets.find((s) => s.properties.title === "Products")?.properties.sheetId;
    const orders2 = meta.sheets.find((s) => s.properties.title === "Orders")?.properties.sheetId;
    if (products === void 0 || orders2 === void 0) throw new AppError(503, "SHEET_SCHEMA_ERROR", "Products and Orders sheets must exist.");
    return { products, orders: orders2 };
  }
  async getProducts() {
    const { values = [] } = await this.sheets.values("Products!A:M");
    assertHeaders(values[0] ?? [], productHeaders);
    const rows = values.slice(1).map((row, i) => ({ row: i + 1, values: row })).filter((r) => r.values.some((v) => v !== ""));
    const result = rows.map((r) => ({ row: r.row, product: parseProduct(r.values) }));
    if (new Set(result.map((r) => r.product.id)).size !== result.length) throw new AppError(503, "SHEET_SCHEMA_ERROR", "Product IDs must be unique.");
    return result;
  }
  async orderRows() {
    const { values = [] } = await this.sheets.values("Orders!A:N");
    assertHeaders(values[0] ?? [], orderHeaders);
    return values.slice(1).map((row, i) => ({ row: i + 1, values: row })).filter((r) => r.values.some((v) => v !== "")).map((r) => ({ row: r.row, order: parseOrder(r.values) }));
  }
  async getOrders() {
    return (await this.orderRows()).map((r) => r.order);
  }
  async guardedBatch(requests, operation) {
    await this.assertWritable();
    await this.journal.begin(operation);
    await this.sheets.batch(requests);
    await this.journal.clear();
  }
  async commitOrder(order, stock) {
    const ids = await this.ids();
    const requests = stock.map((update) => ({
      updateCells: {
        range: { sheetId: ids.products, startRowIndex: update.row, endRowIndex: update.row + 1, startColumnIndex: 8, endColumnIndex: 9 },
        rows: [{ values: [cell(update.available)] }],
        fields: "userEnteredValue"
      }
    }));
    requests.push({ appendCells: { sheetId: ids.orders, rows: [{ values: orderValues(order).map(cell) }], fields: "userEnteredValue" } });
    await this.guardedBatch(requests, { kind: "create_order", order_id: order.order_id, client_order_id: order.client_order_id, stock });
  }
  async updateOrder(orderId, changes) {
    const ids = await this.ids();
    const found = (await this.orderRows()).find((r) => r.order.order_id === orderId);
    if (!found) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
    const indexes = { status: 9, customer_notified: 12, admin_notified: 13 };
    const requests = Object.entries(changes).map(([key, value]) => {
      const column = indexes[key];
      return { updateCells: {
        range: { sheetId: ids.orders, startRowIndex: found.row, endRowIndex: found.row + 1, startColumnIndex: column, endColumnIndex: column + 1 },
        rows: [{ values: [cell(value)] }],
        fields: "userEnteredValue"
      } };
    });
    await this.guardedBatch(requests, { kind: "update_order", order_id: orderId, changes });
  }
};

// apps/api/src/repositories/writeJournal.ts
import { mkdir, open, readFile, unlink } from "fs/promises";
import { resolve as resolve2 } from "path";
var WriteJournal = class {
  constructor(directory) {
    this.directory = directory;
    this.path = resolve2(directory, "pending-write.json");
  }
  directory;
  path;
  async pending() {
    try {
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  async assertClear() {
    if (await this.pending() !== null) throw new AppError(503, "RECONCILIATION_REQUIRED", "Checkout is paused while an earlier operation is verified. Please keep your checkout and retry later.");
  }
  async begin(operation) {
    await mkdir(this.directory, { recursive: true });
    const file = await open(this.path, "wx", 384);
    try {
      await file.writeFile(JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), operation }));
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async clear() {
    await unlink(this.path);
  }
};

// shared/demoProducts.ts
var entries = [
  ["P001", "Home fragrance", "AMBER STUDIO", "The evening candle", "Amber & sandalwood", 24, 12, "candle-amber", "A warm, quietly woody fragrance. Hand-poured soy wax in a reusable amber glass. 180 g \xB7 approximately 35 hours."],
  ["P002", "Tea & botanicals", "SLOW LEAF", "Golden hour tea", "Peach & rooibos", 14, 18, "tea-peach", "Naturally caffeine-free rooibos with peach and calendula. A little sunshine in your cup. 80 g loose-leaf blend."],
  ["P003", "Everyday objects", "FORM & FIELD", "The ritual cup", "Sandstone \xB7 250 ml", 22, 7, "cup-sand", "A tactile stoneware cup with a soft matte glaze. Made for slow mornings. Dishwasher safe."],
  ["P004", "Home fragrance", "AMBER STUDIO", "Forest after rain", "Cedar & moss", 24, 9, "candle-green", "Fresh woodland notes, cedarwood and soft moss. Hand-poured soy wax. 180 g \xB7 approximately 35 hours."],
  ["P005", "Tea & botanicals", "SLOW LEAF", "Midnight garden", "Mint & chamomile", 16, 6, "tea-green", "A delicate herbal infusion for your evening ritual. Chamomile flowers and refreshing peppermint. 80 g."],
  ["P006", "Everyday objects", "FORM & FIELD", "The ritual cup", "Terracotta \xB7 250 ml", 22, 5, "cup-clay", "Warm terracotta stoneware with a comfortable rounded form. Each glaze has its own character. Dishwasher safe."],
  ["P007", "Home fragrance", "AMBER STUDIO", "Sunday morning", "Fig & black tea", 28, 0, "candle-cream", "Green fig, a little black tea and a soft woody base. A slow Sunday, captured in a candle. 220 g."],
  ["P008", "Everyday objects", "FORM & FIELD", "Little things tray", "Olive \xB7 14 cm", 18, 11, "tray", "A sculptural resting place for keys, jewellery and the small things you keep close. Glazed ceramic."]
];
var demoProducts = entries.map(([id, category, brand, name, flavor, price, available, art, description], index) => ({
  id,
  sku: "AS-" + id.slice(1),
  category,
  brand,
  name,
  flavor,
  price,
  available,
  description,
  image_url: "/products/" + art + ".svg",
  active: true,
  sort_order: (index + 1) * 10,
  blocked_districts: []
}));

// apps/api/src/index.ts
var config = readConfig();
var store = config.env.DEMO_MODE ? new MemoryStore(demoProducts) : new SheetsStore(new GoogleSheets(config), new WriteJournal(config.env.DATA_DIR));
var { app, notifications, orders } = createApp(config, store);
var server = app.listen(config.env.PORT, config.env.DEMO_MODE ? "127.0.0.1" : "0.0.0.0", () => {
  console.info(JSON.stringify({ event: "server_started", port: config.env.PORT, demo: config.env.DEMO_MODE }));
});
var worker = setInterval(() => {
  void notifications.drain();
}, 3e4);
worker.unref();
void notifications.drain();
function shutdown() {
  clearInterval(worker);
  server.close(() => {
    void orders.mutex.run(async () => {
    }).then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 2e4).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
//# sourceMappingURL=index.js.map