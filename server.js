const STOREFRONT = require("./storefront");
const VIEWS = require("./views");
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const { URL } = require("url");
const LIBYA_AREAS = require("./libya-locations");
const ADMIN_ORDERS = require("./admin-orders");
const CUSTOMER = require("./customer-account");
const MOBILE = require("./mobile-api");
const CUSTOMER_SESSION_SECRET =
  process.env.CUSTOMER_SESSION_SECRET ||
  crypto
    .createHash("sha256")
    .update(
      "nova-customer-session:" +
        String(
          process.env.NEON_DATABASE_URL ||
            process.env.DATABASE_URL ||
            process.env.RENDER_SERVICE_ID ||
            "local-dev",
        ),
    )
    .digest("hex");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "",
  ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  crypto
    .createHash("sha256")
    .update(
      "nova-admin-session:" +
        CUSTOMER_SESSION_SECRET +
        ":" +
        String(ADMIN_PASSWORD || "unset"),
    )
    .digest("hex");
const PORT = +process.env.PORT || 3000,
  DIR = process.env.DATA_DIR || path.join(__dirname, "data"),
  FILE = path.join(DIR, "store.json");
fs.mkdirSync(DIR, { recursive: true });
const seed = {
  settings: {
    name: "نوفا ستور",
    en: "NOVA STORE",
    tag: "اختيارات عصرية، جودة تستحقها",
    currency: "د.ل",
    ship: 15,
    free: 250,
    wa: "218900000000",
  },
  products: [
    [
      "p1",
      "ساعة Urban Edge",
      "إكسسوارات",
      189,
      239,
      18,
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=85",
    ],
    [
      "p2",
      "سماعات AirBeat Pro",
      "تقنية",
      149,
      179,
      31,
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85",
    ],
    [
      "p3",
      "حقيبة City Carry",
      "حقائب",
      219,
      0,
      12,
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1000&q=85",
    ],
    [
      "p4",
      "نظارة Noir Classic",
      "إكسسوارات",
      99,
      129,
      24,
      "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1000&q=85",
    ],
    [
      "p5",
      "عطر Velvet Night",
      "عطور",
      169,
      199,
      9,
      "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1000&q=85",
    ],
    [
      "p6",
      "حذاء Mono Run",
      "أحذية",
      259,
      299,
      16,
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=85",
    ],
  ].map((x) => ({
    id: x[0],
    name: x[1],
    cat: x[2],
    price: x[3],
    old: x[4],
    stock: x[5],
    img: x[6],
  })),
  orders: [],
};
const Store = require("./storage");
const COMMERCE = require("./commerce");
const databaseUrl =
  process.env.NEON_DATABASE_URL ||
  (process.env.NOVA_PREVIEW === "true" ? null : process.env.DATABASE_URL);
if (
  process.env.RENDER === "true" &&
  !databaseUrl &&
  process.env.NOVA_PREVIEW !== "true"
)
  throw Error("A durable production database is required");
const pool = databaseUrl
  ? new (require("pg").Pool)({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      ssl:
        process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined,
    })
  : null;
pool?.on("error", () => console.error("Database connection interrupted"));
const storage = new Store({ file: FILE, seed, pool });
const S = () => storage.read(),
  W = (x) => storage.write(x);
const mobile = MOBILE.create({
  readState: () => storage.read(),
  writeState: (d) => storage.write(d),
  afterCommit: (fn) => storage.afterCommit(fn),
});
const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  money = (n) => new Intl.NumberFormat("ar-LY-u-nu-latn").format(+n || 0);
const css = `.features{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}.feat{padding:20px;border:1px solid var(--line);border-radius:12px}.feat b{display:block;margin:8px 0;font-size:21px}.feat .muted{font-size:11px}.adminnav{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:20px}.table{width:100%;border-collapse:collapse;min-width:720px}.table th,.table td{padding:14px;border-bottom:1px solid var(--line);text-align:right;font-size:12px}.scroll{overflow:auto}.login{min-height:100vh;display:grid;place-items:center}.login .adminbox{width:min(430px,92vw)}@media(max-width:700px){.features{grid-template-columns:1fr 1fr}}`;
const proCss = "";
function page(title, body, extra = "", meta = {}) {
  if (process.env.NOVA_PREVIEW === "true") meta = { ...meta, noindex: true };
  if (/حساب|دخول/.test(title) && !meta.path)
    meta = { ...meta, path: "/account", noindex: true };
  const s = S().settings,
    base = "https://nova-store-icxo.onrender.com",
    canonical = base + (meta.path || "/"),
    description = meta.description || s.tag,
    icon = STOREFRONT.icon;
  const catalog = S()
    .products.filter((p) => !p.archivedAt)
    .map(({ id, name, price, stock, img }) => ({
      id,
      name,
      price,
      stock,
      img,
    }));
  const structured = meta.product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: meta.product.name,
        image: meta.product.img,
        description: meta.product.desc || meta.product.name,
        sku: meta.product.id,
        offers: {
          "@type": "Offer",
          priceCurrency: "LYD",
          price: meta.product.price,
          availability:
            "https://schema.org/" +
            (meta.product.stock > 0 ? "InStock" : "OutOfStock"),
          url: canonical,
        },
      }
    : null;
  const wa = String(s.wa || "").replace(/\D/g, "");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#243d31"><meta name="description" content="${esc(description)}"><meta property="og:type" content="${meta.product ? "product" : "website"}"><meta property="og:locale" content="ar_LY"><meta property="og:title" content="${esc(title)} — ${esc(s.name)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">${meta.image ? `<meta property="og:image" content="${esc(meta.image)}">` : ""}<link rel="canonical" href="${esc(canonical)}">${meta.noindex ? '<meta name="robots" content="noindex,nofollow">' : ""}<link rel="icon" href="/nova-avatar.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700;800&display=swap" rel="stylesheet"><title>${esc(title)} — ${esc(s.name)}</title><style>${CUSTOMER.accountCss()}${STOREFRONT.css}</style>${structured ? `<script type="application/ld+json">${VIEWS.json(structured)}</script>` : ""}</head><body><a class="skipLink" href="#main-content">انتقل إلى المحتوى</a><div class="top">${process.env.NOVA_PREVIEW === "true" ? "نسخة معاينة تجريبية — لا تستقبل طلبات · " : ""}${s.free > 0 ? `شحن مجاني للطلبات من ${money(s.free)} ${esc(s.currency)}` : "اختيارات نوفا، توصل لبابك"}<span> / </span><b class="desktopOnly">تفاصيل صغيرة. يوم أجمل.</b></div><header class="nav"><div class="wrap navin"><a class="brand" href="/" aria-label="${esc(s.name)} — الرئيسية"><img class="logo logoImg" src="/nova-avatar.svg" alt="" width="42" height="42"><span>${esc(s.name)}<small>${esc(s.en)}</small></span></a><nav class="navlinks" aria-label="القائمة الرئيسية"><a href="/">الرئيسية</a><a href="/#shop">المجموعة</a><a href="/?sale=1#shop">التخفيضات</a><a href="/track">تتبّع طلبك</a></nav><form class="navsearch" action="/#shop" method="get"><input name="q" aria-label="ابحث عن منتج" placeholder="ابحث عن شيء تحبّه"><button type="submit" aria-label="بحث">${icon("search")}</button></form><div class="navactions"><a class="iconBtn desktopOnly" href="/account" aria-label="حسابي">${icon("user")}</a><button class="iconBtn" type="button" onclick="toggleFavoritesView()" aria-label="عرض المفضلة">${icon("heart")}<span class="navBadge" id="fc">0</span></button><a class="cartBtn" href="/checkout" aria-label="فتح السلة">${icon("bag")}<span class="cartText">السلة</span><span class="cartCount" data-cart-count>0</span></a><details class="mobileMenu"><summary class="iconBtn" aria-label="فتح القائمة">${icon("menu")}</summary><nav class="mobilePanel"><a href="/">الرئيسية</a><a href="/#shop">المجموعة</a><a href="/?sale=1#shop">التخفيضات</a><a href="/track">تتبّع طلبك</a><a href="/account">حسابي</a></nav></details></div></div></header>${body}<footer class="footer"><div class="wrap footerGrid"><div><div class="footerBrand">${esc(s.name)}<small style="display:block;font-size:10px;letter-spacing:3px">${esc(s.en)}</small></div><p class="footerNote muted">تفاصيل صغيرة تختارها لنفسك، وقطع تحب تهديها.<br>مساحتك لاكتشاف شيء يشبهك، كل يوم.</p></div><div><h4>خذ لفة في نوفا</h4><a href="/#shop">كل المجموعة</a><a href="/?sale=1#shop">التخفيضات</a><a href="/?favorites=1#shop">المفضلة</a><a href="/account">حسابي</a></div><div><h4>نحن هنا لمساعدتك</h4><a href="/track">تتبّع الطلب</a><a href="/shipping">الشحن والتوصيل</a><a href="/returns">الاستبدال والاسترجاع</a><a href="/privacy">الخصوصية</a>${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">تواصل عبر واتساب ↗</a>` : ""}</div></div><div class="wrap footerBottom"><span>© ${new Date().getFullYear()} ${esc(s.en)}. جميع الحقوق محفوظة.</span><span>اختيارات يومية. بطابع مختلف.</span></div></footer><nav class="mobileBar" aria-label="التنقل السريع">${[
    ["home", "/", "الرئيسية"],
    ["grid", "/#shop", "المجموعة"],
    ["bag", "/checkout", "السلة"],
    ["heart", "/?favorites=1#shop", "المفضلة"],
    ["user", "/account", "حسابي"],
  ]
    .map(
      ([i, h, t]) =>
        `<a class="${i === "bag" ? "hotMobile" : ""}" href="${h}">${icon(i)}<span>${t}</span></a>`,
    )
    .join(
      "",
    )}</nav><div class="toast" id="toast" role="status" aria-live="polite"></div><script>let novaCatalog=${VIEWS.json(catalog)},novaSettings=${VIEWS.json({ currency: s.currency, ship: s.ship, free: s.free })};${STOREFRONT.script}
${extra}</script></body></html>`;
}
function home(req) {
  return page(
    "الرئيسية",
    STOREFRONT.home(
      { ...S(), products: S().products.filter((p) => !p.archivedAt) },
      req,
      esc,
      money,
    ),
  );
}

function productPage(req) {
  const d = S(),
    p = d.products.find(
      (p) =>
        p.id === new URL(req.url, "http://localhost").searchParams.get("id") &&
        !p.archivedAt,
    );
  if (!p)
    return page(
      "المنتج غير موجود",
      '<main id="main-content" class="section wrap"><div class="emptyState"><h1>هذا المنتج غير موجود</h1><a class="btn hot" href="/#shop">اكتشف المجموعة</a></div></main>',
    );
  return page(p.name, VIEWS.product(d, p, esc, money), "", {
    path: STOREFRONT.productLink(p),
    description: p.desc || p.name,
    image: p.img,
    product: p,
  });
}
function checkout(req) {
  const d = S(),
    c = CUSTOMER.sessionCustomer(req, d, CUSTOMER_SESSION_SECRET) || {};
  return page(
    "السلة وإتمام الطلب",
    VIEWS.checkout(d.settings, c, esc),
    "const novaAreas=" + VIEWS.json(LIBYA_AREAS) + ";" + VIEWS.checkoutScript,
    { path: "/checkout", noindex: true },
  );
}
function safeImage(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
function cookie(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((x) => {
        let i = x.indexOf("=");
        return i < 0
          ? [x.trim(), ""]
          : [x.slice(0, i).trim(), decodeURIComponent(x.slice(i + 1))];
      }),
  );
}
function adminSessionToken(csrf, exp = Date.now() + 28800000) {
  const payload = String(exp) + "." + csrf;
  const sig = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(payload)
    .digest("hex");
  return payload + "." + sig;
}
function ses(req) {
  const raw = cookie(req).sid || "";
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [exp, csrf, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() || !csrf || !sig)
    return null;
  const payload = exp + "." + csrf;
  const expected = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(payload)
    .digest("hex");
  const a = Buffer.from(sig),
    b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { csrf, exp: Number(exp) };
}
function csrfOk(req, token) {
  let s = ses(req),
    a = Buffer.from(String(s?.csrf || "")),
    b = Buffer.from(String(token || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
function normPhone(v) {
  let p = String(v || "").replace(/\D/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "218" + p.slice(1);
  return p;
}
function validCheckoutPhone(v) {
  return /^09[0-9]{8}$/.test(String(v || "").trim());
}
function validLocation(city, area) {
  return Array.isArray(LIBYA_AREAS[city]) && LIBYA_AREAS[city].includes(area);
}

async function notifyTelegram(order, settings) {
  const token = process.env.TELEGRAM_BOT_TOKEN,
    chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const lines = [
    "🛍️ طلب جديد في NOVA STORE",
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
    "الإجمالي: " + order.total + " " + (settings.currency || "د.ل"),
  ];
  try {
    const host = "api." + "telegram.org";
    const url = "https://" + host + "/bot" + token + "/sendMessage";
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: lines.join("\n") }),
    });
  } catch (e) {
    console.error("Telegram notify failed:", e.message);
  }
}

function statusMessage(o, s) {
  if (o.status === "ملغي")
    return "تم إلغاء طلبك. إذا كان هذا غير متوقع تواصل معنا عبر واتساب.";
  if (o.status === "جديد") return "استلمنا طلبك وسنراجعه ونتواصل معك للتأكيد.";
  if (o.status === "مؤكد") return "تم تأكيد طلبك.";
  if (o.status === "قيد التجهيز") return "طلبك الآن قيد التجهيز.";
  if (o.status === "قيد التوصيل") return "طلبك خرج للتوصيل وهو في الطريق إليك.";
  if (o.status === "مكتمل")
    return "تم تسليم الطلب بنجاح. شكرًا لاختيارك " + s.name + ".";
  return "حالة الطلب: " + o.status;
}
function track(req) {
  let d = S(),
    s = d.settings,
    u = new URL(req.url, "http://x"),
    id = (u.searchParams.get("order") || "").trim(),
    phone = (u.searchParams.get("phone") || "").trim(),
    o = null;
  if (id && phone) {
    o = d.orders.find(
      (x) =>
        String(x.id).toLowerCase() === id.toLowerCase() &&
        normPhone(x.phone) === normPhone(phone),
    );
  }
  let steps = ["جديد", "مؤكد", "قيد التجهيز", "قيد التوصيل", "مكتمل"],
    idx = o ? steps.indexOf(o.status) : -1;
  let result = "";
  if (id && phone && !o)
    result =
      '<div class="adminbox" style="margin-top:16px;border-color:#71333a"><b style="color:#ff8b95">لم نجد طلبًا بهذه البيانات.</b><p class="muted">تأكد من رقم الطلب ورقم الهاتف المستخدم عند الشراء.</p></div>';
  if (o) {
    let timeline =
      o.status === "ملغي"
        ? '<div class="adminbox" style="margin-top:16px;border-color:#71333a"><b style="color:#ff8b95">الطلب ملغي</b></div>'
        : '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-top:16px">' +
          steps
            .map(
              (z, i) =>
                '<div style="padding:12px 8px;border-radius:14px;text-align:center;border:1px solid ' +
                (i <= idx ? "#c5d5bf" : "#e5e0d8") +
                ";background:" +
                (i <= idx ? "#ecf1e6" : "#fff") +
                ";color:" +
                (i <= idx ? "#35502b" : "#777") +
                ';font-weight:900;font-size:12px">' +
                z +
                "</div>",
            )
            .join("") +
          "</div>";
    result =
      '<div class="adminbox" style="margin-top:16px"><div class="row"><span>رقم الطلب</span><b>' +
      esc(o.id) +
      '</b></div><div class="row"><span>الحالة</span><b class="ok">' +
      esc(o.status) +
      "</b></div>" +
      timeline +
      '<p style="font-weight:800;margin-top:18px">' +
      esc(statusMessage(o, s)) +
      '</p><div class="row"><span>الإجمالي</span><b>' +
      money(o.total) +
      " " +
      esc(s.currency) +
      '</b></div><div class="row"><span>المدينة</span><b>' +
      esc(o.city) +
      '</b></div><a class="btn hot" target="_blank" rel="noopener" href="https://wa.me/' +
      encodeURIComponent(String(s.wa || "").replace(/\D/g, "")) +
      "?text=" +
      encodeURIComponent("مرحبًا، أريد الاستفسار عن طلبي رقم " + o.id) +
      '">تواصل معنا عبر واتساب</a></div>';
  }
  return page(
    "تتبع الطلب",
    '<main class="section" id="main-content"><div class="wrap" style="max-width:760px"><div class="head"><div><h2>تتبع طلبك</h2><div class="muted">اكتب رقم الطلب ورقم الهاتف الذي استخدمته عند الشراء</div></div></div><form class="checkout" method="get" action="/track"><div class="two"><div class="field"><label>رقم الطلب</label><input class="input" name="order" value="' +
      esc(id) +
      '" placeholder="ORD-..." required></div><div class="field"><label>رقم الهاتف</label><input class="input" name="phone" value="' +
      esc(phone) +
      '" placeholder="09..." required></div></div><button class="btn hot">عرض حالة الطلب</button></form>' +
      result +
      "</div></main>",
    "",
    { path: "/track", noindex: true },
  );
}
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function exportOrdersCsv(req) {
  let d = S(),
    u = new URL(req.url, "http://x"),
    filter = u.searchParams.get("of") || "all",
    q = (u.searchParams.get("oq") || "").trim().toLowerCase(),
    city = (u.searchParams.get("city") || "").trim(),
    orders = d.orders
      .filter((o) => !o.archivedAt)
      .slice()
      .reverse()
      .filter(
        (o) =>
          (filter === "all" ||
            (filter === "new" && o.readAt === null) ||
            (filter === "active" && !["مكتمل", "ملغي"].includes(o.status)) ||
            (filter === "done" && o.status === "مكتمل") ||
            (filter === "cancel" && o.status === "ملغي")) &&
          (!q ||
            [o.id, o.name, o.phone, o.city, o.area]
              .join(" ")
              .toLowerCase()
              .includes(q)) &&
          (!city || o.city === city),
      );
  let rows = [
    [
      "رقم الطلب",
      "التاريخ",
      "الاسم",
      "الهاتف",
      "المدينة",
      "المنطقة",
      "الحالة",
      "الإجمالي",
      "ملاحظات",
    ],
  ].concat(
    orders.map((o) => [
      o.id,
      new Date(o.created).toLocaleString("ar-LY"),
      o.name,
      o.phone,
      o.city,
      o.area || "",
      o.status,
      o.total,
      o.notes || "",
    ]),
  );
  return (
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
function infoPage(kind) {
  let data = {
    shipping: {
      title: "الشحن والتوصيل",
      heading: "الشحن والتوصيل",
      intro: "نوصل طلبك داخل ليبيا بعد تأكيد البيانات معك.",
      sections: [
        [
          "تكلفة الشحن",
          "تُحسب تكلفة الشحن حسب إعدادات المتجر وتظهر لك بوضوح قبل تأكيد الطلب.",
        ],
        [
          "مدة التوصيل",
          "نتواصل معك بعد استلام الطلب لتأكيد العنوان والوقت المناسب للتوصيل.",
        ],
        [
          "استلام الطلب",
          "فضلاً تأكد من صحة رقم الهاتف والعنوان، وكن متاحًا للرد على المندوب عند وصول الطلب.",
        ],
      ],
    },
    returns: {
      title: "الاستبدال والاسترجاع",
      heading: "الاستبدال والاسترجاع",
      intro: "هدفنا أن تكون تجربتك واضحة وعادلة.",
      sections: [
        [
          "قبل الاستلام",
          "إذا لاحظت مشكلة واضحة في المنتج عند الاستلام، تواصل معنا فورًا عبر واتساب مع رقم الطلب.",
        ],
        [
          "الاستبدال",
          "نراجع كل حالة حسب نوع المنتج وحالته، ويجب أن يكون المنتج غير مستخدم ومحافظًا على تغليفه قدر الإمكان.",
        ],
        [
          "الاسترجاع",
          "تواصل معنا خلال أقرب وقت من الاستلام لبحث طلب الاسترجاع وتحديد الخطوات المناسبة.",
        ],
      ],
    },
    privacy: {
      title: "الخصوصية",
      heading: "سياسة الخصوصية",
      intro: "نستخدم بياناتك فقط لتجهيز الطلب وتحسين خدمة المتجر.",
      sections: [
        [
          "البيانات التي نطلبها",
          "الاسم ورقم الهاتف والمدينة والمنطقة والعنوان والملاحظات اللازمة للتوصيل.",
        ],
        [
          "طريقة الاستخدام",
          "تُستخدم البيانات للتواصل معك وتجهيز الطلب وتوصيله ومتابعته. وقد تُمرَّر بيانات الطلب إلى مقدمي خدمات الاستضافة والتوصيل وإشعارات الإدارة عند تفعيلها، بالقدر اللازم لتشغيل الخدمة.",
        ],
        [
          "الحماية",
          "تُحفظ كلمات المرور بصيغة مشتقة ومملّحة. نحفظ السلة والمفضلة على جهازك، ونستخدم ملفات ارتباط لإبقاء جلسة حسابك. يمكنك التواصل معنا لطلب تصحيح بياناتك أو حذف حسابك.",
        ],
      ],
    },
  }[kind];
  if (!data)
    return page(
      "الصفحة غير موجودة",
      '<main class="section" id="main-content"><div class="wrap"><div class="adminbox"><h2>الصفحة غير موجودة</h2></div></div></main>',
    );
  return page(
    data.title,
    `<main class="section" id="main-content"><div class="wrap" style="max-width:820px"><div class="head"><div><h1>${data.heading}</h1><p class="muted">${data.intro}</p></div></div><div class="adminbox">${data.sections.map(([h, b]) => `<section style="padding:8px 0 18px"><h3>${h}</h3><p class="muted" style="line-height:2">${b}</p></section>`).join("")}<p class="muted" style="border-top:1px solid #252a32;padding-top:16px">للاستفسار عن طلب محدد، تواصل معنا عبر واتساب من رابط المساعدة في أسفل الصفحة.</p></div></div></main>`,
    "",
    { path: "/" + kind },
  );
}
const adminTheme = `.feat,.orderCard,.orderGrid div{background:#fff;color:var(--text);border-color:var(--line)}.orderCard.unread{border-color:#b7c6a9;box-shadow:none}.table td,.table th{border-color:var(--line)}.pill{border-color:var(--line)}.pill.new{background:#e7eedb;color:var(--green);border-color:#cedcbe}.adminnav{position:sticky;top:0;background:var(--bg);padding:15px 0;z-index:10}.features .feat{box-shadow:none;animation:none}.adminbox h3{font-size:19px}.table .btn{padding:7px 12px}.feat b{color:var(--green)}.adminbox+.adminbox{margin-top:20px}`;
const adminLoginAttempts = new Map();
function adminLoginAllowed(req) {
  let ip = req.socket.remoteAddress || "unknown",
    now = Date.now(),
    x = adminLoginAttempts.get(ip);
  if (!x || now - x.start > 900000) {
    adminLoginAttempts.set(ip, { start: now, count: 1 });
    return true;
  }
  if (x.count >= 10) return false;
  x.count++;
  return true;
}
function admin(req, msg = "") {
  let session = ses(req);
  if (!session)
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${STOREFRONT.css}${css}${adminTheme}</style><title>دخول الإدارة — NOVA STORE</title><meta name="robots" content="noindex,nofollow"></head><body class="login"><form class="adminbox" method="post" action="/admin/login"><div class="brand"><img class="logo logoImg" src="/nova-avatar.svg" alt="" width="42" height="42"><span>لوحة إدارة NOVA</span></div><h2>دخول المالك</h2>${msg ? `<p style="color:#ff8b95">${esc(msg)}</p>` : ""}<div class="field"><label>البريد</label><input class="input" name="email" required></div><div class="field"><label>كلمة المرور</label><input class="input" type="password" name="password" required></div><button class="btn hot">دخول</button></form></body></html>`;
  let token = session?.csrf || "",
    d = S(),
    s = d.settings,
    u = new URL(req.url, "http://x"),
    edit = d.products.find((x) => x.id === u.searchParams.get("edit")),
    cloudName = process.env.CLOUDINARY_CLOUD_NAME || "",
    uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || "",
    revenue = d.orders
      .filter((o) => o.status === "مكتمل")
      .reduce((a, o) => a + (+o.total || 0), 0),
    active = d.orders.filter(
      (o) => !["مكتمل", "ملغي"].includes(o.status),
    ).length,
    low = d.products.filter((x) => x.stock <= 3).length,
    unread = d.orders.filter((o) => o.readAt === null && !o.archivedAt).length,
    orderFilter = u.searchParams.get("of") || "all",
    orderQ = (u.searchParams.get("oq") || "").trim(),
    orderCity = (u.searchParams.get("city") || "").trim();
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}${proCss}${ADMIN_ORDERS.css}${STOREFRONT.css}${adminTheme}</style><title>لوحة الإدارة — NOVA STORE</title><meta name="robots" content="noindex,nofollow"></head><body><main class="section" id="main-content"><div class="wrap"><div class="head"><div><h2>لوحة إدارة NOVA</h2><div class="muted">${d.products.length} منتجات · ${d.orders.length} طلبات</div></div><a class="btn" href="/">عرض المتجر</a></div><div class="adminnav"><a class="btn" href="#products">المنتجات</a><a class="btn" href="#orders">الطلبات ${unread ? `<span class="badgeCount">${unread}</span>` : ""}</a><a class="btn" href="#settings">الإعدادات</a><form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${token}"><button class="btn danger">خروج</button></form></div><div class="features" style="margin-bottom:16px"><div class="feat">💰<b>${money(revenue)} ${esc(s.currency)}</b><span class="muted">مبيعات مكتملة</span></div><div class="feat">🧾<b>${active}</b><span class="muted">طلبات نشطة</span></div><div class="feat">📦<b>${d.products.length}</b><span class="muted">منتجات</span></div><div class="feat">⚠️<b>${low}</b><span class="muted">مخزون منخفض</span></div></div>${msg ? `<p class="ok">${esc(msg)}</p>` : ""}<section id="products" class="adminbox"><h3>${edit ? "تعديل المنتج" : "إضافة منتج"}</h3><form method="post" action="/admin/product"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="id" value="${esc(edit?.id || "")}"><div class="two"><div class="field"><label>الاسم</label><input class="input" name="name" value="${esc(edit?.name || "")}" required></div><div class="field"><label>القسم</label><input class="input" name="cat" value="${esc(edit?.cat || "")}" required></div><div class="field"><label>السعر</label><input class="input" type="number" name="price" min="0" step="0.01" value="${edit?.price || ""}" required></div><div class="field"><label>السعر قبل الخصم</label><input class="input" type="number" name="old" min="0" step="0.01" value="${edit?.old || 0}"></div><div class="field"><label>المخزون</label><input class="input" type="number" name="stock" min="0" step="1" value="${edit?.stock || 0}"></div><div class="field"><label>رابط الصورة</label><input class="input" name="img" value="${esc(edit?.img || "")}" required></div><div class="field" style="grid-column:1/-1"><label>وصف المنتج</label><textarea class="input" name="desc" rows="4" placeholder="اكتب وصفًا مختصرًا وواضحًا للمنتج">${esc(edit?.desc || "")}</textarea></div><div class="field" style="grid-column:1/-1"><label>صور إضافية</label><textarea class="input" name="images" rows="3" placeholder="ضع رابط صورة في كل سطر أو افصل بينها بفواصل">${esc((edit?.images || []).join("\n"))}</textarea><small class="muted">اختياري: حتى 7 روابط إضافية، والصورة الأساسية تبقى في حقل رابط الصورة.</small></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><input class="input" id="productImagesPicker" type="file" accept="image/jpeg,image/png,image/webp" multiple><button class="btn" type="button" onclick="uploadProductImages()">رفع الصور إلى Cloudinary</button><span class="muted" id="imageUploadStatus">${cloudName && uploadPreset ? "جاهز للرفع" : "أضف إعدادات Cloudinary في Render أولاً"}</span></div></div><button class="btn hot">${edit ? "حفظ التعديل" : "إضافة المنتج"}</button></form><div class="scroll"><table class="table"><tr><th>المنتج</th><th>السعر</th><th>المخزون</th><th>إدارة</th></tr>${d.products.map((x) => `<tr><td>${esc(x.name)}${x.archivedAt ? ' <small class="muted">(مخفي)</small>' : ""}</td><td>${money(x.price)} ${esc(s.currency)}</td><td>${x.stock}</td><td><a class="btn" href="/admin?edit=${esc(x.id)}#products">تعديل</a> <form style="display:inline" method="post" action="${x.archivedAt ? "/admin/product-restore" : "/admin/delete"}"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="id" value="${esc(x.id)}"><button class="btn ${x.archivedAt ? "" : "danger"}">${x.archivedAt ? "إعادة إظهار" : "إخفاء"}</button></form></td></tr>`).join("")}</table></div></section>${ADMIN_ORDERS.renderOrders(d, s, orderFilter, orderQ, orderCity, esc, money, normPhone, token)}<section id="settings" class="adminbox" style="margin-top:16px"><h3>إعدادات المتجر</h3><form method="post" action="/admin/settings"><input type="hidden" name="csrf" value="${token}"><div class="two"><div class="field"><label>اسم المتجر</label><input class="input" name="name" value="${esc(s.name)}"></div><div class="field"><label>الاسم الإنجليزي</label><input class="input" name="en" value="${esc(s.en)}"></div><div class="field"><label>العملة</label><input class="input" name="currency" value="${esc(s.currency)}"></div><div class="field"><label>واتساب</label><input class="input" name="wa" value="${esc(s.wa)}"></div><div class="field"><label>الشحن</label><input class="input" type="number" name="ship" value="${s.ship}"></div><div class="field"><label>الشحن المجاني من</label><input class="input" type="number" name="free" value="${s.free}"></div></div><div class="field"><label>الوصف</label><input class="input" name="tag" value="${esc(s.tag)}"></div><button class="btn hot">حفظ الإعدادات</button></form></section></div></main><script>const novaCloudinary={cloud:${VIEWS.json(cloudName)},preset:${VIEWS.json(uploadPreset)}};async function uploadProductImages(){let picker=document.getElementById("productImagesPicker"),field=document.querySelector("textarea[name=images]"),status=document.getElementById("imageUploadStatus");if(!novaCloudinary.cloud||!novaCloudinary.preset){status.textContent="إعدادات Cloudinary غير مكتملة في Render";return}if(!picker.files.length){status.textContent="اختر صورة واحدة على الأقل";return}let urls=(field.value||"").split(/\\n+/).map(x=>x.trim()).filter(Boolean);for(let file of picker.files){if(file.size>10*1024*1024){status.textContent="الحد الأقصى للصورة 10MB";continue}status.textContent="جارٍ رفع "+file.name+"...";let body=new FormData();body.append("file",file);body.append("upload_preset",novaCloudinary.preset);try{let r=await fetch("https://api.cloudinary.com/v1_1/"+encodeURIComponent(novaCloudinary.cloud)+"/image/upload",{method:"POST",body}),j=await r.json();if(!r.ok||!j.secure_url)throw new Error(j.error?.message||"فشل الرفع");if(!urls.includes(j.secure_url))urls.push(j.secure_url);field.value=urls.slice(0,7).join("\\n");status.textContent="تم رفع الصورة: "+file.name}catch(e){status.textContent=e.message||"تعذر رفع الصورة"}}picker.value=""}let lastOrderId=${JSON.stringify(d.orders.filter((o) => !o.archivedAt).length ? d.orders.filter((o) => !o.archivedAt).slice(-1)[0].id : "")};function enableOrderNotifications(){if(!('Notification' in window)){alert('المتصفح لا يدعم الإشعارات');return}Notification.requestPermission().then(p=>{if(p==='granted')new Notification('NOVA STORE',{body:'تم تفعيل تنبيهات الطلبات الجديدة'})})}async function pollOrders(){try{let r=await fetch('/admin/orders-ping',{cache:'no-store'});if(!r.ok)return;let j=await r.json();if(j.latestId&&lastOrderId&&j.latestId!==lastOrderId){if('Notification' in window&&Notification.permission==='granted')new Notification('طلب جديد في NOVA STORE',{body:(j.name||'عميل جديد')+' · '+j.total+' '+${VIEWS.json(s.currency)}});try{let C=window.AudioContext||window.webkitAudioContext,a=new C(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;g.gain.value=.06;o.start();o.stop(a.currentTime+.18)}catch(e){}location.reload()}lastOrderId=j.latestId||lastOrderId}catch(e){}}setInterval(pollOrders,15000);</script></body></html>`;
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100000) {
      const e = Error("Body too large");
      e.status = 413;
      throw e;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function parseBody(req) {
  return req.rawBody || "";
}
async function jsonBody(req) {
  try {
    let raw = await parseBody(req);
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}
function form(x) {
  return Object.fromEntries(new URLSearchParams(x));
}
function send(res, n, b, t = "text/html; charset=utf-8", h = {}) {
  res.writeHead(n, {
    "content-type": t,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options":
      process.env.NOVA_PREVIEW === "true" ? "SAMEORIGIN" : "DENY",
    "cache-control": "no-store",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    ...h,
  });
  res.end(res._head ? "" : b);
}
function red(res, x) {
  send(res, 302, "", "text/plain", { location: x });
}
async function handle(req, res) {
  if (
    process.env.NOVA_PREVIEW === "true" &&
    ["POST", "PATCH"].includes(req.method) &&
    req.url !== "/api/quote"
  )
    return send(
      res,
      403,
      JSON.stringify({
        error:
          "هذه نسخة معاينة. الطلبات والحسابات متاحة على المتجر الأساسي فقط.",
      }),
      "application/json",
    );
  if (await mobile.handle(req, res)) return;
  if (req.method === "HEAD") {
    req.method = "GET";
    res._head = true;
  }
  let u = new URL(req.url, "http://x"),
    p = u.pathname;
  if (
    req.method === "GET" &&
    ["/nova-avatar.svg", "/nova-avatar.png"].includes(p)
  )
    return send(
      res,
      200,
      fs.readFileSync(path.join(__dirname, "nova-avatar.svg"), "utf8"),
      "image/svg+xml",
    );
  if (
    req.method === "GET" &&
    p === "/preview-mobile" &&
    process.env.NOVA_PREVIEW === "true"
  )
    return send(
      res,
      200,
      '<!doctype html><html><head><meta name="robots" content="noindex"><title>NOVA mobile layout preview</title></head><body style="margin:0;background:#e5e0d8;display:flex;justify-content:center"><iframe title="NOVA mobile viewport" src="/" style="width:390px;height:850px;border:0;background:white"></iframe></body></html>',
      "text/html; charset=utf-8",
      { "x-frame-options": "SAMEORIGIN" },
    );
  if (req.method === "GET" && p === "/favicon.svg")
    return send(
      res,
      200,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#243d31"/><text x="14" y="49" fill="#fff" font-family="Georgia,serif" font-style="italic" font-size="49">N</text></svg>',
      "image/svg+xml",
    );
  if (req.method === "GET" && p === "/robots.txt")
    return send(
      res,
      200,
      "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nSitemap: https://nova-store-icxo.onrender.com/sitemap.xml\n",
      "text/plain; charset=utf-8",
    );
  if (req.method === "GET" && p === "/sitemap.xml")
    return send(
      res,
      200,
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        [
          "/",
          "/shipping",
          "/returns",
          "/privacy",
          ...S()
            .products.filter((p) => !p.archivedAt)
            .map(STOREFRONT.productLink),
        ]
          .map(
            (p) =>
              "<url><loc>" +
              esc("https://nova-store-icxo.onrender.com" + p) +
              "</loc></url>",
          )
          .join("") +
        "</urlset>",
      "application/xml; charset=utf-8",
    );
  if (req.method === "GET" && p === "/shipping")
    return send(res, 200, infoPage("shipping"));
  if (req.method === "GET" && p === "/returns")
    return send(res, 200, infoPage("returns"));
  if (req.method === "GET" && p === "/privacy")
    return send(res, 200, infoPage("privacy"));
  if (req.method === "GET" && p === "/") return send(res, 200, home(req));
  if (req.method === "GET" && p === "/product")
    return send(
      res,
      S().products.some(
        (z) => z.id === u.searchParams.get("id") && !z.archivedAt,
      )
        ? 200
        : 404,
      productPage(req),
    );
  if (req.method === "GET" && p === "/checkout")
    return send(res, 200, checkout(req));
  if (req.method === "GET" && p === "/track") return send(res, 200, track(req));
  if (req.method === "GET" && p === "/health")
    return send(
      res,
      200,
      JSON.stringify({
        ok: true,
        storage: pool ? "postgres" : "file",
        accountSessions: "signed",
        adminSessions: "signed",
      }),
      "application/json",
    );
  if (req.method === "GET" && ["/account/", "/admin/"].includes(p))
    return red(res, p.slice(0, -1));
  if (req.method === "GET" && p === "/account/login")
    return send(
      res,
      200,
      page("تسجيل الدخول", CUSTOMER.authBody("login", "", esc), "", {
        path: "/account/login",
        noindex: true,
      }),
    );
  if (req.method === "GET" && p === "/account/register")
    return send(
      res,
      200,
      page("إنشاء حساب", CUSTOMER.authBody("register", "", esc), "", {
        path: "/account/register",
        noindex: true,
      }),
    );
  if (req.method === "GET" && p === "/account") {
    let d = S(),
      c = CUSTOMER.sessionCustomer(req, d, CUSTOMER_SESSION_SECRET);
    if (!c) return red(res, "/account/login");
    return send(
      res,
      200,
      page(
        "حسابي",
        CUSTOMER.accountBody(
          c,
          d,
          d.settings,
          esc,
          money,
          "",
          CUSTOMER.csrfToken(c.id, CUSTOMER_SESSION_SECRET),
        ),
      ),
    );
  }
  if (req.method === "GET" && p === "/api/catalog")
    return send(
      res,
      200,
      JSON.stringify({
        products: S()
          .products.filter((p) => !p.archivedAt)
          .map(({ id, name, price, stock, img }) => ({
            id,
            name,
            price,
            stock,
            img,
          })),
        settings: {
          currency: S().settings.currency,
          ship: S().settings.ship,
          free: S().settings.free,
        },
      }),
      "application/json",
    );
  if (
    ["POST", "PATCH"].includes(req.method) &&
    (p === "/order" || p === "/api/quote")
  ) {
    try {
      const input = await jsonBody(req),
        d = S();
      if (p === "/api/quote")
        return send(
          res,
          200,
          JSON.stringify(COMMERCE.quote(d, input?.items)),
          "application/json",
        );
      const { order, replayed } = COMMERCE.createOrder(
        d,
        input,
        CUSTOMER.sessionCustomer(req, d, CUSTOMER_SESSION_SECRET),
      );
      if (!replayed) {
        W(d);
        storage.afterCommit(() => notifyTelegram(order, d.settings));
      }
      return send(
        res,
        200,
        JSON.stringify({ id: order.id, total: order.total }),
        "application/json",
      );
    } catch (err) {
      if (!err.status) throw err;
      return send(
        res,
        err.status,
        JSON.stringify({ error: err.message }),
        "application/json",
      );
    }
  }
  if (req.method === "POST" && p === "/account/register") {
    let d = S(),
      x = form(await parseBody(req)),
      r = CUSTOMER.register(d, x);
    if (r.error)
      return send(
        res,
        400,
        page("إنشاء حساب", CUSTOMER.authBody("register", r.error, esc)),
      );
    W(d);
    return send(res, 302, "", "text/plain", {
      "set-cookie": CUSTOMER.sessionCookie(
        r.customer.id,
        CUSTOMER_SESSION_SECRET,
        r.customer.sessionVersion || 0,
      ),
      location: "/account",
    });
  }
  if (req.method === "POST" && p === "/account/login") {
    let d = S(),
      x = form(await parseBody(req)),
      r = CUSTOMER.login(d, x.phone, x.password);
    if (r.error)
      return send(
        res,
        401,
        page("تسجيل الدخول", CUSTOMER.authBody("login", r.error, esc)),
      );
    return send(res, 302, "", "text/plain", {
      "set-cookie": CUSTOMER.sessionCookie(
        r.customer.id,
        CUSTOMER_SESSION_SECRET,
        r.customer.sessionVersion || 0,
      ),
      location: "/account",
    });
  }
  if (req.method === "POST" && p === "/account/logout") {
    let d = S(),
      c = CUSTOMER.sessionCustomer(req, d, CUSTOMER_SESSION_SECRET),
      x = form(await parseBody(req));
    if (!c) return red(res, "/account/login");
    if (!CUSTOMER.csrfValid(c.id, CUSTOMER_SESSION_SECRET, x.csrf))
      return send(res, 403, "Forbidden");
    return send(res, 302, "", "text/plain", {
      "set-cookie": CUSTOMER.clearCookie(),
      location: "/",
    });
  }
  if (req.method === "POST" && p === "/account/profile") {
    let d = S(),
      c = CUSTOMER.sessionCustomer(req, d, CUSTOMER_SESSION_SECRET);
    if (!c) return red(res, "/account/login");
    let x = form(await parseBody(req));
    if (!CUSTOMER.csrfValid(c.id, CUSTOMER_SESSION_SECRET, x.csrf))
      return send(res, 403, "Forbidden");
    let r = CUSTOMER.updateProfile(d, c, x);
    if (r.error)
      return send(
        res,
        400,
        page(
          "حسابي",
          CUSTOMER.accountBody(
            c,
            d,
            d.settings,
            esc,
            money,
            r.error,
            CUSTOMER.csrfToken(c.id, CUSTOMER_SESSION_SECRET),
          ),
        ),
      );
    W(d);
    return send(
      res,
      200,
      page(
        "حسابي",
        CUSTOMER.accountBody(
          c,
          d,
          d.settings,
          esc,
          money,
          "تم حفظ بياناتك بنجاح",
          CUSTOMER.csrfToken(c.id, CUSTOMER_SESSION_SECRET),
        ),
      ),
    );
  }
  if (req.method === "POST" && p === "/account/password") {
    let d = S(),
      c = CUSTOMER.sessionCustomer(req, d, CUSTOMER_SESSION_SECRET);
    if (!c) return red(res, "/account/login");
    let x = form(await parseBody(req));
    if (!CUSTOMER.csrfValid(c.id, CUSTOMER_SESSION_SECRET, x.csrf))
      return send(res, 403, "Forbidden");
    let r = CUSTOMER.changePassword(c, x.currentPassword, x.newPassword);
    if (r.error)
      return send(
        res,
        400,
        page(
          "حسابي",
          CUSTOMER.accountBody(
            c,
            d,
            d.settings,
            esc,
            money,
            r.error,
            CUSTOMER.csrfToken(c.id, CUSTOMER_SESSION_SECRET),
          ),
        ),
      );
    W(d);
    return send(
      res,
      200,
      page(
        "حسابي",
        CUSTOMER.accountBody(
          c,
          d,
          d.settings,
          esc,
          money,
          "تم تغيير كلمة المرور وتسجيل خروج الجلسات الأخرى",
          CUSTOMER.csrfToken(c.id, CUSTOMER_SESSION_SECRET),
        ),
      ),
      "text/html; charset=utf-8",
      {
        "set-cookie": CUSTOMER.sessionCookie(
          c.id,
          CUSTOMER_SESSION_SECRET,
          c.sessionVersion || 0,
        ),
      },
    );
  }
  if (req.method === "GET" && p === "/admin/login") return send(res, 200, admin(req));
  if (req.method === "GET" && p === "/admin") return send(res, 200, admin(req));
  if (req.method === "GET" && p === "/admin/orders-ping") {
    if (!ses(req)) return send(res, 401, "{}", "application/json");
    let d = S(),
      o = [...d.orders].reverse().find((x) => !x.archivedAt);
    return send(
      res,
      200,
      JSON.stringify({
        latestId: o?.id || "",
        name: o?.name || "",
        total: o?.total || 0,
        unread: d.orders.filter((x) => x.readAt === null && !x.archivedAt)
          .length,
      }),
      "application/json",
    );
  }
  if (req.method === "GET" && p === "/admin/orders.csv") {
    if (!ses(req)) return red(res, "/admin");
    return send(res, 200, exportOrdersCsv(req), "text/csv; charset=utf-8", {
      "content-disposition": 'attachment; filename="nova-orders.csv"',
      "cache-control": "no-store",
    });
  }
  if (req.method === "POST" && p === "/admin/login") {
    if (!adminLoginAllowed(req))
      return send(
        res,
        429,
        admin(req, "محاولات دخول كثيرة. حاول بعد 15 دقيقة."),
      );
    let x = form(await parseBody(req));
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
      return send(
        res,
        503,
        admin(
          req,
          "لوحة الإدارة غير مهيأة: يجب ضبط ADMIN_EMAIL و ADMIN_PASSWORD في متغيرات البيئة.",
        ),
      );
    if (x.email === ADMIN_EMAIL && x.password === ADMIN_PASSWORD) {
      const csrf = crypto.randomBytes(32).toString("hex"),
        sid = adminSessionToken(csrf);
      adminLoginAttempts.delete(req.socket.remoteAddress || "unknown");
      return send(res, 302, "", "text/plain", {
        "set-cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`,
        "cache-control": "no-store",
        location: "/admin",
      });
    }
    return send(res, 401, admin(req, "بيانات الدخول غير صحيحة"));
  }
  if (p.startsWith("/admin/") && !ses(req)) return red(res, "/admin");
  if (req.method === "POST" && p === "/admin/logout") {
    let x = form(await parseBody(req));
    if (!csrfOk(req, x.csrf)) return send(res, 403, "Forbidden");
    return send(res, 302, "", "text/plain", {
      "set-cookie":
        "sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
      "cache-control": "no-store",
      location: "/admin",
    });
  }
  if (req.method === "POST" && p === "/admin/product") {
    let x = form(await parseBody(req));
    if (!csrfOk(req, x.csrf)) return send(res, 403, "Forbidden");
    if (
      !x.name?.trim() ||
      x.name.length > 160 ||
      !x.cat?.trim() ||
      x.cat.length > 80 ||
      !Number.isFinite(+x.price) ||
      +x.price < 0 ||
      !Number.isFinite(+x.old) ||
      +x.old < 0 ||
      !Number.isInteger(+x.stock) ||
      +x.stock < 0 ||
      !safeImage(x.img) ||
      String(x.desc || "").length > 5000 ||
      String(x.images || "")
        .split(/[\n,]+/)
        .filter((v) => v.trim())
        .some((v) => !safeImage(v.trim()))
    )
      return send(
        res,
        400,
        admin(req, "راجع بيانات المنتج: أسعار ومخزون صحيح، وصور بروابط HTTPS."),
      );
    let d = S(),
      z = d.products.find((a) => a.id === x.id),
      o = {
        id: z?.id || "p" + crypto.randomBytes(6).toString("hex"),
        name: x.name,
        cat: x.cat,
        price: +x.price || 0,
        old: +x.old || 0,
        stock: Math.max(0, +x.stock || 0),
        img: x.img,
        images: String(x.images || "")
          .split(/[\n,]+/)
          .map((v) => v.trim())
          .filter(Boolean)
          .slice(0, 7),
        desc: x.desc || "",
      };
    z ? Object.assign(z, o) : d.products.push(o);
    W(d);
    return red(res, "/admin#products");
  }
  if (
    ["POST", "PATCH"].includes(req.method) &&
    ["/admin/product-restore", "/admin/order-restore"].includes(p)
  ) {
    const x = form(await parseBody(req));
    if (!csrfOk(req, x.csrf)) return send(res, 403, "Forbidden");
    const d = S(),
      item = (p === "/admin/product-restore" ? d.products : d.orders).find(
        (i) => i.id === x.id,
      );
    if (item) item.archivedAt = null;
    W(d);
    return red(res, "/admin");
  }
  if (req.method === "POST" && p === "/admin/delete") {
    let x = form(await parseBody(req));
    if (!csrfOk(req, x.csrf)) return send(res, 403, "Forbidden");
    let d = S();
    const product = d.products.find((a) => a.id === x.id);
    if (product) product.archivedAt = new Date().toISOString();
    W(d);
    return red(res, "/admin#products");
  }
  if (req.method === "POST" && p === "/admin/read") {
    let x = form(await parseBody(req));
    if (!csrfOk(req, x.csrf)) return send(res, 403, "Forbidden");
    let d = S(),
      o = d.orders.find((a) => a.id === x.id);
    if (o) o.readAt = new Date().toISOString();
    W(d);
    return red(res, "/admin#orders");
  }
  if (req.method === "POST" && p === "/admin/order-archive") {
    let x = form(await parseBody(req));
    if (!csrfOk(req, x.csrf)) return send(res, 403, "Forbidden");
    let d = S(),
      o = d.orders.find((a) => a.id === x.id);
    if (o) {
      o.archivedAt = new Date().toISOString();
    }
    W(d);
    return red(res, "/admin#orders");
  }
  if (req.method === "POST" && p === "/admin/status") {
    let x = form(await parseBody(req));
    if (!csrfOk(req, x.csrf)) return send(res, 403, "Forbidden");
    let d = S(),
      o = d.orders.find((a) => a.id === x.id);
    if (o) {
      if (!COMMERCE.statuses.includes(x.status))
        return send(res, 400, "حالة الطلب غير صالحة");
      let prev = o.status,
        next = x.status;
      if (next === "ملغي" && prev !== "ملغي" && !o.inventoryRestored) {
        for (let i of o.items) {
          let z = d.products.find((a) => a.id === i.id);
          if (z) z.stock = (+z.stock || 0) + (+i.q || 0);
        }
        o.inventoryRestored = true;
      }
      if (prev === "ملغي" && next !== "ملغي" && o.inventoryRestored) {
        let enough = o.items.every((i) => {
          let z = d.products.find((a) => a.id === i.id);
          return z && (+z.stock || 0) >= (+i.q || 0);
        });
        if (enough) {
          for (let i of o.items) {
            let z = d.products.find((a) => a.id === i.id);
            z.stock -= +i.q || 0;
          }
          o.inventoryRestored = false;
        } else next = "ملغي";
      }
      o.status = next;
    }
    W(d);
    return red(res, "/admin#orders");
  }
  if (req.method === "POST" && p === "/admin/settings") {
    let x = form(await parseBody(req));
    if (!csrfOk(req, x.csrf)) return send(res, 403, "Forbidden");
    if (
      !x.name?.trim() ||
      !x.en?.trim() ||
      !x.currency?.trim() ||
      x.name.length > 120 ||
      x.en.length > 120 ||
      x.currency.length > 12 ||
      !Number.isFinite(+x.ship) ||
      !Number.isFinite(+x.free) ||
      +x.ship < 0 ||
      +x.free < 0
    )
      return send(
        res,
        400,
        admin(req, "راجع اسم المتجر والعملة وتكاليف الشحن."),
      );
    let d = S();
    d.settings = {
      ...d.settings,
      name: x.name,
      en: x.en,
      tag: x.tag,
      currency: x.currency,
      wa: x.wa,
      ship: Math.max(0, +x.ship || 0),
      free: Math.max(0, +x.free || 0),
    };
    W(d);
    return red(res, "/admin#settings");
  }
  return send(
    res,
    404,
    page(
      "الصفحة غير موجودة",
      '<main id="main-content" class="wrap section"><div class="emptyState"><h1>يبدو أنك أخذت لفة زيادة.</h1><p>الصفحة غير موجودة، لكن اختيارات نوفا تنتظرك.</p><a class="btn hot" href="/">العودة للرئيسية</a></div></main>',
      "",
      { noindex: true },
    ),
  );
}
const attempts = new Map();
function rateAllowed(req) {
  const key =
    (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
      .split(",")
      .pop()
      .trim() +
    ":" +
    req.url.split("?")[0];
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || now - entry.at > 900000) entry = { at: now, n: 0 };
  entry.n++;
  attempts.set(key, entry);
  return entry.n <= 60;
}
setInterval(() => {
  for (const [key, a] of attempts)
    if (Date.now() - a.at > 900000) attempts.delete(key);
}, 60000).unref();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (["POST", "PATCH"].includes(req.method)) {
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return send(res, 403, "Forbidden");
      if (!rateAllowed(req))
        return send(
          res,
          429,
          JSON.stringify({ error: "محاولات كثيرة. حاول بعد قليل." }),
          "application/json",
          { "retry-after": "900" },
        );
      req.rawBody = await readBody(req);
    }
    let response;
    const buffered = {
      _head: false,
      writeHead: (...args) => {
        response = { args };
      },
      end: (body) => {
        response.body = body;
      },
    };
    const pathName = url.pathname;
    const readOnlyPostRoutes = new Set([
      "/account/login",
      "/admin/login",
      "/account/logout",
      "/admin/logout",
      "/api/quote",
    ]);
    const writableRequest =
      ["POST", "PATCH"].includes(req.method) && !readOnlyPostRoutes.has(pathName);
    await storage.run(writableRequest, () => handle(req, buffered));
    res.writeHead(...response.args);
    res.end(response.body);
  } catch (err) {
    console.error(
      "Request failed:",
      req.method,
      req.url,
      err.code || err.name,
      err.message || "",
    );
    send(
      res,
      err.status || 503,
      JSON.stringify({
        error:
          err.status === 413
            ? "حجم الطلب كبير جدًا."
            : "تعذر حفظ أو تحميل البيانات. حاول مجددًا.",
      }),
      "application/json",
    );
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
storage
  .init()
  .then(async () => {
    await storage.run(false, () => {
      const d = S();
      console.log(
        "NOVA storage verified: products=" +
          d.products.length +
          "; orders=" +
          d.orders.length +
          "; customers=" +
          (d.customers || []).length,
      );
    });
    if (!process.env.CUSTOMER_SESSION_SECRET)
      console.warn(
        "CUSTOMER_SESSION_SECRET is not configured; using a stable derived session secret",
      );
    if (!process.env.ADMIN_SESSION_SECRET)
      console.warn(
        "ADMIN_SESSION_SECRET is not configured; using a stable derived admin session secret",
      );
  })
  .then(() =>
    server.listen(PORT, "0.0.0.0", () =>
      console.log(
        "NOVA on " + PORT + "; storage=" + (pool ? "postgres" : "file"),
      ),
    ),
  )
  .catch(() => {
    console.error("Store startup failed; existing data was not replaced");
    process.exitCode = 1;
    pool?.end();
  });
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    await storage.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
