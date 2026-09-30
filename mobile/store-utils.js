export function decodeList(raw, type) {
  try {
    const list = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) return [];
    if (type === "favorites")
      return [...new Set(list.filter((x) => typeof x === "string"))];
    const merged = new Map();
    for (const x of list) {
      if (typeof x?.id === "string" && Number.isInteger(x.q) && x.q > 0)
        merged.set(x.id, Math.min(20, (merged.get(x.id) || 0) + x.q));
    }
    return [...merged].map(([id, q]) => ({ id, q }));
  } catch {
    return [];
  }
}
export function normalizeSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[\u064b-\u065f\u0640]/g, "")
    .trim();
}
export function basketTotals(items, settings = {}) {
  const round = (n) => Math.round(n * 100) / 100;
  const sub = round(items.reduce((sum, x) => sum + x.price * x.q, 0));
  const ship =
    !items.length || (+settings.free > 0 && sub >= +settings.free)
      ? 0
      : Math.max(0, +settings.ship || 0);
  return { sub, ship, total: round(sub + ship) };
}
