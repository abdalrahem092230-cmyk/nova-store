// Native application compatibility, sharing the transactional store with the website.
const crypto = require("node:crypto");
const CUSTOMER = require("./customer-account"),
  LOCATIONS = require("./libya-locations"),
  COMMERCE = require("./commerce");
module.exports.create = ({ readState: S, writeState: W, afterCommit }) => {
  const SECRET =
    process.env.CUSTOMER_SESSION_SECRET ||
    crypto
      .createHash("sha256")
      .update(
        "nova-mobile:" + String(process.env.NEON_DATABASE_URL || "local-dev"),
      )
      .digest("hex");
  const phone = (v) => String(v || "").replace(/\D/g, "");
  const safe = (c) => {
    if (!c) return null;
    const { passwordHash, passwordSalt, sessionVersion, ...rest } = c;
    return rest;
  };
  const cleanProduct = (p) => ({
    id: p.id,
    name: p.name,
    cat: p.cat || "",
    price: +p.price || 0,
    old: +p.old || 0,
    stock: Math.max(0, +p.stock || 0),
    img: p.img || "",
    images: Array.isArray(p.images) ? p.images.filter(Boolean).slice(0, 7) : [],
    desc: p.desc || "",
  });
  const cleanOrder = (o) => ({
    id: o.id,
    created: o.created,
    status: o.status,
    name: o.name,
    phone: o.phone,
    city: o.city,
    area: o.area,
    address: o.address,
    notes: o.notes || "",
    items: Array.isArray(o.items) ? o.items : [],
    total: +o.total || 0,
  });
  function json(res, status, body) {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
      "x-content-type-options": "nosniff",
    });
    res.end(JSON.stringify(body));
  }
  function version(c) {
    return crypto
      .createHash("sha256")
      .update(String(c.passwordHash || ""))
      .digest("hex")
      .slice(0, 20);
  }
  function token(c) {
    const p = Buffer.from(
      JSON.stringify({
        sub: c.id,
        exp: Math.floor(Date.now() / 1000) + 2592000,
        pv: version(c),
      }),
    ).toString("base64url");
    const s = crypto
      .createHmac("sha256", SECRET)
      .update("nova-mobile:" + p)
      .digest("base64url");
    return p + "." + s;
  }
  function current(req, d) {
    const h = String(req.headers.authorization || "");
    if (!h.startsWith("Bearer ")) return null;
    const pieces = h.slice(7).trim().split(".");
    if (pieces.length !== 2) return null;
    const [p, s] = pieces;
    const x = crypto
      .createHmac("sha256", SECRET)
      .update("nova-mobile:" + p)
      .digest("base64url");
    const a = Buffer.from(s),
      b = Buffer.from(x);
    if (!a.length || a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return null;
    let j;
    try {
      j = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (
      typeof j.sub !== "string" ||
      !Number.isFinite(j.exp) ||
      j.exp < Math.floor(Date.now() / 1000)
    )
      return null;
    const c = (d.customers || []).find((v) => v.id === j.sub);
    return c && j.pv === version(c) ? c : null;
  }
  function read(req) {
    try {
      const x = JSON.parse(req.rawBody || "{}");
      return x && typeof x === "object" && !Array.isArray(x) ? x : null;
    } catch {
      return null;
    }
  }
  async function notifyTelegram(order, settings) {
    const bot = process.env.TELEGRAM_BOT_TOKEN,
      chatId = process.env.TELEGRAM_CHAT_ID;
    if (!bot || !chatId) return false;
    const lines = [
      "📱 طلب جديد من تطبيق NOVA STORE",
      "",
      "رقم الطلب: " + order.id,
      "العميل: " + order.name,
      "الهاتف: " + order.phone,
      "المدينة: " + order.city,
      "المنطقة: " + (order.area || "-"),
      "العنوان: " + order.address,
      "",
      ...(order.items || []).map((i) => "• " + i.name + " × " + i.q),
      "",
      "الإجمالي: " + order.total + " " + (settings?.currency || "د.ل"),
    ];
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 6000);
    try {
      const r = await fetch(
        "https://api.telegram.org/bot" + bot + "/sendMessage",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: lines.join("\n") }),
          signal: controller.signal,
        },
      );
      if (!r.ok) {
        console.error("Mobile Telegram notify failed with status", r.status);
        return false;
      }
      return true;
    } catch {
      console.error("Mobile Telegram notify failed");
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  async function handle(req, res) {
    const u = new URL(req.url, "http://nova.local"),
      p = u.pathname;
    if (!p.startsWith("/api/mobile/")) return false;
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
      });
      res.end();
      return true;
    }
    const d = S();
    if (req.method === "GET" && p === "/api/mobile/bootstrap") {
      json(res, 200, {
        ok: true,
        settings: {
          name: d.settings.name,
          en: d.settings.en,
          tag: d.settings.tag,
          currency: d.settings.currency,
          ship: +d.settings.ship || 0,
          free: +d.settings.free || 0,
          wa: d.settings.wa || "",
        },
        products: (d.products || [])
          .filter((p) => !p.archivedAt)
          .map(cleanProduct),
        locations: LOCATIONS,
      });
      return true;
    }
    if (req.method === "POST" && p === "/api/mobile/register") {
      const x = read(req);
      if (!x) {
        json(res, 400, { error: "بيانات التسجيل غير صالحة" });
        return true;
      }
      const r = CUSTOMER.register(d, x);
      if (r.error) {
        json(res, 400, { error: r.error });
        return true;
      }
      W(d);
      json(res, 201, { token: token(r.customer), customer: safe(r.customer) });
      return true;
    }
    if (req.method === "POST" && p === "/api/mobile/login") {
      const x = read(req);
      if (!x) {
        json(res, 400, { error: "بيانات الدخول غير صالحة" });
        return true;
      }
      const r = CUSTOMER.login(d, x.phone, x.password);
      if (r.error) {
        json(res, 401, { error: r.error });
        return true;
      }
      json(res, 200, { token: token(r.customer), customer: safe(r.customer) });
      return true;
    }
    const c = current(req, d);
    if (req.method === "GET" && p === "/api/mobile/me") {
      if (!c) {
        json(res, 401, { error: "يجب تسجيل الدخول" });
        return true;
      }
      json(res, 200, { customer: safe(c) });
      return true;
    }
    if (req.method === "PATCH" && p === "/api/mobile/profile") {
      const x = read(req);
      if (!c) {
        json(res, 401, { error: "يجب تسجيل الدخول" });
        return true;
      }
      if (!x) {
        json(res, 400, { error: "البيانات غير صالحة" });
        return true;
      }
      const r = CUSTOMER.updateProfile(d, c, {
        name: x.name ?? c.name,
        phone: x.phone ?? c.phone,
        phone2: x.phone2 ?? c.phone2,
        email: x.email ?? c.email,
        city: x.city ?? c.city,
        area: x.area ?? c.area,
        address: x.address ?? c.address,
        landmark: x.landmark ?? c.landmark,
      });
      if (r.error) {
        json(res, 400, { error: r.error });
        return true;
      }
      W(d);
      json(res, 200, { customer: safe(c) });
      return true;
    }
    if (req.method === "GET" && p === "/api/mobile/orders") {
      if (!c) {
        json(res, 401, { error: "يجب تسجيل الدخول" });
        return true;
      }
      json(res, 200, {
        orders: (d.orders || [])
          .filter((o) => o.customerId === c.id && !o.archivedAt)
          .slice()
          .reverse()
          .slice(0, 50)
          .map(cleanOrder),
      });
      return true;
    }
    if (req.method === "GET" && p === "/api/mobile/track") {
      const id = String(u.searchParams.get("id") || "").trim(),
        ph = phone(u.searchParams.get("phone")),
        o = (d.orders || []).find((v) => v.id === id && !v.archivedAt);
      if (
        !o ||
        !((c && o.customerId === c.id) || (ph && phone(o.phone) === ph))
      ) {
        json(res, 404, { error: "لم يتم العثور على الطلب" });
        return true;
      }
      json(res, 200, { order: cleanOrder(o) });
      return true;
    }
    if (req.method === "POST" && p === "/api/mobile/order") {
      const x = read(req);
      if (!x) {
        json(res, 400, { error: "بيانات الطلب غير صالحة" });
        return true;
      }
      try {
        const input = {
          ...x,
          name: x.name || c?.name || "",
          phone: phone(x.phone || c?.phone),
          city: x.city || c?.city || "",
          area: x.area || c?.area || "",
          address: x.address || c?.address || "",
          notes: x.notes || "",
        };
        // Installed v1 apps have no request key/total yet; keep their contract while validating stock.
        if (!input.requestId) input.requestId = crypto.randomUUID();
        if (input.expectedTotal === undefined) {
          const prior = d.orders.find((o) => o.requestId === input.requestId);
          input.expectedTotal =
            prior?.total ?? COMMERCE.quote(d, input.items).total;
        }
        const { order, replayed } = COMMERCE.createOrder(d, input, c);
        if (!replayed) {
          W(d);
          afterCommit(() => notifyTelegram(order, d.settings));
        }
        json(res, 201, { order: cleanOrder(order) });
        return true;
      } catch (err) {
        if (!err.status) throw err;
        json(res, err.status, { error: err.message });
        return true;
      }
    }
    json(res, 404, { error: "API endpoint not found" });
    return true;
  }
  return { handle };
};
