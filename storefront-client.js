const readList = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const get = () =>
  readList("novaCart")
    .filter(
      (x) => x && typeof x.id === "string" && Number.isInteger(x.q) && x.q > 0,
    )
    .map((x) => ({ ...x, q: Math.min(x.q, 20) }));
const favorites = () =>
  readList("novaFavorites").filter((x) => typeof x === "string");
function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast("المتصفح يمنع حفظ البيانات. فعّل التخزين للموقع.");
    return false;
  }
}
const set = (items) => {
  saveLocal("novaCart", items);
  count();
};
function count() {
  const count = get().reduce((n, x) => n + x.q, 0);
  document
    .querySelectorAll("[data-cart-count]")
    .forEach((el) => (el.textContent = count));
  document.querySelectorAll("[data-favorite]").forEach((el) => {
    const active = favorites().includes(el.dataset.favorite);
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });
  const fc = document.getElementById("fc");
  if (fc) fc.textContent = favorites().length;
}
let toastTimer;
function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 3000);
}
function toggleFav(id) {
  const list = favorites(),
    i = list.indexOf(id);
  i < 0 ? list.push(id) : list.splice(i, 1);
  saveLocal("novaFavorites", list);
  count();
  refreshFavoriteView();
  toast(i < 0 ? "حفظناها لك في المفضلة" : "تمت الإزالة من المفضلة");
}
function add(id, n, p, img, q = 1) {
  const product = novaCatalog.find((p) => p.id === id);
  if (!product || product.stock <= 0) return toast("هذا المنتج غير متوفر الآن");
  const qty = Math.min(20, Math.max(1, Math.floor(Number(q) || 1)));
  const cart = get(),
    old = cart.find((x) => x.id === id);
  if ((old?.q || 0) + qty > Math.min(product.stock, 20))
    return toast("وصلت للكمية المتاحة لهذا المنتج");
  if (old) old.q += qty;
  else
    cart.push({
      id,
      n: product.name,
      p: product.price,
      img: product.img,
      q: qty,
    });
  set(cart);
  toast("أُضيف للسلة. اختيار حلو!");
}
let favoriteMode =
  new URLSearchParams(location.search).get("favorites") === "1";
function refreshFavoriteView() {
  const counter = document.getElementById("resultCount");
  if (!counter) return;
  const cards = [...document.querySelectorAll(".productCard[data-id]")];
  let visible = 0;
  cards.forEach((c) => {
    c.hidden = favoriteMode && !favorites().includes(c.dataset.id);
    if (!c.hidden) visible++;
  });
  counter.textContent = visible + (favoriteMode ? " منتجات محفوظة" : " منتجات");
  const empty = document.getElementById("favoriteEmpty");
  if (empty) {
    empty.hidden = visible > 0;
    empty.querySelector("h3").textContent = favoriteMode
      ? "المفضلة تنتظر اختياراتك"
      : "ما لقيناش منتجات مطابقة";
    empty.querySelector("p").textContent = favoriteMode
      ? "اضغط على القلب لحفظ منتج، أو امسح الفلاتر لرؤية كل اختياراتك."
      : "جرّب كلمة ثانية أو امسح الفلاتر.";
  }
  document
    .getElementById("favoriteFilter")
    ?.setAttribute("aria-pressed", String(favoriteMode));
}
function toggleFavoritesView() {
  if (!document.getElementById("shop")) {
    location.href = "/?favorites=1#shop";
    return;
  }
  favoriteMode = !favoriteMode;
  const url = new URL(location.href);
  favoriteMode
    ? url.searchParams.set("favorites", "1")
    : url.searchParams.delete("favorites");
  history.replaceState(null, "", url.pathname + url.search + "#shop");
  const form = document.querySelector(".novaFilters");
  let input = form?.querySelector("[name=favorites]");
  if (favoriteMode && !input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = "favorites";
    input.value = "1";
    form.append(input);
  } else if (!favoriteMode) input?.remove();
  refreshFavoriteView();
  document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
}
document.addEventListener("click", (event) => {
  const favorite = event.target.closest("[data-favorite]");
  if (favorite) toggleFav(favorite.dataset.favorite);
  const addBtn = event.target.closest("[data-add]");
  if (addBtn) {
    const qty = document.getElementById("productQty")?.value || 1;
    add(addBtn.dataset.add, "", 0, "", qty);
  }
  if (event.target.closest("#favoriteFilter")) toggleFavoritesView();
  const thumb = event.target.closest("[data-gallery]");
  if (thumb) {
    document.getElementById("productMainImage").src = thumb.dataset.gallery;
    document
      .querySelectorAll("[data-gallery]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === thumb)));
  }
  const step = event.target.closest("[data-quantity]");
  if (step) {
    const input = document.getElementById("productQty");
    Number(step.dataset.quantity) > 0 ? input.stepUp() : input.stepDown();
  }
});
document.querySelectorAll("img").forEach((img) =>
  img.addEventListener(
    "error",
    () => {
      img.classList.add("imageFailed");
      img.alt = img.alt || "صورة المنتج غير متاحة";
    },
    { once: true },
  ),
);
count();
refreshFavoriteView();
window.addEventListener("storage", () => {
  count();
  refreshFavoriteView();
  if (typeof renderCart === "function") renderCart();
});
