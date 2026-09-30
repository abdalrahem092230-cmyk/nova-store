const crypto = require("node:crypto");
const AREAS = require("./libya-locations");
const statuses = [
  "جديد",
  "مؤكد",
  "قيد التجهيز",
  "قيد التوصيل",
  "مكتمل",
  "ملغي",
];
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function quote(state, requested) {
  if (!Array.isArray(requested) || !requested.length || requested.length > 100)
    fail("أضف منتجات إلى السلة أولًا.");
  const counts = new Map();
  for (const item of requested) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !Number.isInteger(item.q) ||
      item.q < 1 ||
      item.q > 20
    )
      fail("الكمية يجب أن تكون عددًا صحيحًا من 1 إلى 20.");
    counts.set(item.id, (counts.get(item.id) || 0) + item.q);
  }
  const items = [];
  for (const [id, q] of counts) {
    const p = state.products.find((p) => p.id === id && !p.archivedAt);
    if (!p || p.stock < q || q > 20)
      fail(
        p
          ? "الكمية المطلوبة من «" + p.name + "» غير متاحة. حدّث السلة."
          : "أحد المنتجات لم يعد متاحًا. حدّث السلة.",
        409,
      );
    if (!Number.isFinite(p.price) || p.price < 0)
      fail("تعذر احتساب سعر المنتج.", 409);
    items.push({ id, name: p.name, price: p.price, q });
  }
  const subtotal = round(items.reduce((sum, i) => sum + i.price * i.q, 0));
  const shipping =
    state.settings.free > 0 && subtotal >= state.settings.free
      ? 0
      : Math.max(0, +state.settings.ship || 0);
  return {
    items,
    subtotal,
    shipping,
    total: round(subtotal + shipping),
    currency: state.settings.currency,
  };
}
function createOrder(state, input, customer) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("بيانات الطلب غير صالحة.");
  for (const [key, max] of Object.entries({
    name: 120,
    phone: 10,
    city: 100,
    area: 100,
    address: 500,
    notes: 1000,
  })) {
    if (key === "notes" && input[key] == null) input[key] = "";
    if (
      typeof input[key] !== "string" ||
      input[key].trim().length > max ||
      (!input[key].trim() && key !== "notes")
    )
      fail("راجع الاسم ورقم الهاتف وبيانات التوصيل.");
    input[key] = input[key].trim();
  }
  if (!/^09[0-9]{8}$/.test(input.phone))
    fail("رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 09.");
  if (!AREAS[input.city]?.includes(input.area))
    fail("اختر المدينة والمنطقة من القوائم.");
  if (
    typeof input.requestId !== "string" ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)
  )
    fail("حدّث صفحة السلة وأعد المحاولة.");
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        name: input.name,
        phone: input.phone,
        city: input.city,
        area: input.area,
        address: input.address,
        notes: input.notes,
        items: input.items,
        customer: customer?.id || null,
      }),
    )
    .digest("hex");
  const prior = state.orders.find((o) => o.requestId === input.requestId);
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      fail("تغيّرت بيانات الطلب. حدّث السلة وحاول مجددًا.", 409);
    return { order: prior, replayed: true };
  }
  const totals = quote(state, input.items);
  if (
    !Number.isFinite(input.expectedTotal) ||
    round(input.expectedTotal) !== totals.total
  )
    fail("تغيّر إجمالي الطلب. راجع المبلغ الجديد قبل التأكيد.", 409);
  const order = {
    id: "ORD-" + crypto.randomBytes(6).toString("hex").toUpperCase(),
    created: new Date().toISOString(),
    status: "جديد",
    readAt: null,
    archivedAt: null,
    customerId: customer?.id || null,
    requestId: input.requestId,
    fingerprint,
    name: input.name,
    phone: input.phone,
    city: input.city,
    area: input.area,
    address: input.address,
    notes: input.notes,
    ...totals,
    inventoryRestored: false,
  };
  for (const item of totals.items)
    state.products.find((p) => p.id === item.id).stock -= item.q;
  state.orders.push(order);
  return { order, replayed: false };
}
module.exports = { quote, createOrder, statuses };
