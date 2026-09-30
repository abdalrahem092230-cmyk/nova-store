let quoteTotal = null,
  cartBusy = false,
  orderBusy = false,
  quoteVersion = 0;
const form = document.getElementById("checkoutForm"),
  cartEl = document.getElementById("cart"),
  orderButton = document.getElementById("orderBtn"),
  message = document.getElementById("checkoutMessage");
const fmt = (n) =>
  new Intl.NumberFormat("ar-LY", { maximumFractionDigits: 2 }).format(n) +
  " " +
  novaSettings.currency;
const safe = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const htmlFmt = (n) => safe(fmt(n));
function showMessage(text) {
  message.textContent = text;
  message.hidden = !text;
}
function buttonState() {
  orderButton.disabled = orderBusy || cartBusy || quoteTotal === null;
  orderButton.textContent = orderBusy
    ? "جارٍ تأكيد الطلب…"
    : cartBusy
      ? "جارٍ مراجعة الأسعار…"
      : quoteTotal === null
        ? "راجع السلة أولًا"
        : "تأكيد الطلب · " + fmt(quoteTotal);
}
async function renderCart() {
  const version = ++quoteVersion;
  cartBusy = true;
  quoteTotal = null;
  buttonState();
  let cart = get();
  if (!cart.length) {
    cartEl.innerHTML =
      '<div class="emptyState"><h3>السلة لسه فاضية</h3><p>اختياراتك القادمة تنتظرك.</p><a class="btn hot" href="/#shop">اكتشف المجموعة</a></div>';
    cartBusy = false;
    buttonState();
    return;
  }
  try {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    if (!response.ok) throw Error("تعذر تحميل السلة. أعد المحاولة.");
    const catalog = await response.json();
    if (version !== quoteVersion) return;
    novaCatalog = catalog.products;
    novaSettings = catalog.settings;
    cart = cart.map((item) => {
      const p = novaCatalog.find((p) => p.id === item.id);
      return {
        ...item,
        n: p?.name || item.n,
        p: p?.price ?? item.p,
        img: p?.img || item.img,
        available: !!p && p.stock >= item.q,
        max: Math.min(20, p?.stock || 0),
      };
    });
    cartEl.innerHTML = cart
      .map(
        (item) =>
          '<div class="cartItem"><img src="' +
          safe(item.img) +
          '" alt="' +
          safe(item.n) +
          '"><div><h4>' +
          safe(item.n) +
          '</h4><div class="quantity"><button type="button" data-cart-id="' +
          safe(item.id) +
          '" data-step="-1" aria-label="تقليل كمية ' +
          safe(item.n) +
          '">−</button><span>' +
          item.q +
          '</span><button type="button" data-cart-id="' +
          safe(item.id) +
          '" data-step="1" ' +
          (item.q >= item.max ? "disabled" : "") +
          ' aria-label="زيادة كمية ' +
          safe(item.n) +
          '">+</button></div>' +
          (!item.available
            ? '<small class="danger">الكمية غير متاحة؛ قلّلها أو احذف المنتج.</small>'
            : "") +
          '</div><div><span class="cartPrice">' +
          htmlFmt(item.p * item.q) +
          '</span><button class="cartRemove" data-remove="' +
          safe(item.id) +
          '" type="button" aria-label="حذف ' +
          safe(item.n) +
          '">حذف</button></div></div>',
      )
      .join("");
    set(cart.map(({ available, max, ...item }) => item));
    if (cart.some((x) => !x.available))
      throw Error("بعض الكميات غير متاحة. عدّل السلة للمتابعة.");
    const result = await fetch("/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: cart.map(({ id, q }) => ({ id, q })) }),
    });
    const data = await result.json();
    if (version !== quoteVersion) return;
    if (!result.ok) throw Error(data.error || "تعذر مراجعة السلة");
    quoteTotal = data.total;
    const progress =
      novaSettings.free > 0
        ? Math.min(100, (data.subtotal / novaSettings.free) * 100)
        : 0;
    cartEl.insertAdjacentHTML(
      "beforeend",
      (novaSettings.free > 0
        ? '<div class="shippingProgress">' +
          (data.shipping === 0
            ? "وصلت للشحن المجاني!"
            : "باقي " +
              htmlFmt(Math.max(0, novaSettings.free - data.subtotal)) +
              " للشحن المجاني") +
          '<div class="progressTrack"><i style="width:' +
          progress +
          '%"></i></div></div>'
        : "") +
        '<div class="row"><span>قيمة المنتجات</span><b>' +
        htmlFmt(data.subtotal) +
        '</b></div><div class="row"><span>التوصيل</span><b>' +
        (data.shipping ? htmlFmt(data.shipping) : "مجاني") +
        '</b></div><div class="row totalRow"><b>الإجمالي</b><b>' +
        htmlFmt(data.total) +
        "</b></div>",
    );
  } catch (error) {
    if (version === quoteVersion) {
      quoteTotal = null;
      showMessage(error.message);
      cartEl.insertAdjacentHTML(
        "beforeend",
        '<button class="btn" id="retryCart" type="button">تحديث السلة</button>',
      );
    }
  } finally {
    if (version === quoteVersion) {
      cartBusy = false;
      buttonState();
    }
  }
}
cartEl.addEventListener("click", (event) => {
  if (orderBusy) return;
  const step = event.target.closest("[data-step]"),
    remove = event.target.closest("[data-remove]");
  if (step || remove) {
    let cart = get();
    if (remove) cart = cart.filter((i) => i.id !== remove.dataset.remove);
    else {
      const item = cart.find((i) => i.id === step.dataset.cartId);
      item.q += Number(step.dataset.step);
      cart = cart.filter((i) => i.q > 0);
    }
    set(cart);
    showMessage("");
    renderCart();
  }
  if (event.target.closest("#retryCart")) {
    showMessage("");
    renderCart();
  }
});
document.getElementById("city").addEventListener("change", (event) => {
  const area = document.getElementById("area"),
    list = novaAreas[event.target.value] || [];
  area.replaceChildren(
    new Option("اختر المنطقة", ""),
    ...list.map((a) => new Option(a, a)),
  );
  area.disabled = !list.length;
});
document.getElementById("phone").addEventListener("input", (event) => {
  event.target.value = event.target.value
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[^0-9]/g, "")
    .slice(0, 10);
});
let memoryAttempt = null;
function attemptKey(payload) {
  const signature = JSON.stringify(payload);
  let prior = memoryAttempt;
  try {
    prior = JSON.parse(sessionStorage.getItem("novaOrderAttempt")) || prior;
  } catch {}
  if (prior?.signature === signature) return prior.id;
  const id = crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2) +
      "-" +
      Math.random().toString(36).slice(2);
  memoryAttempt = { signature, id };
  try {
    sessionStorage.setItem("novaOrderAttempt", JSON.stringify(memoryAttempt));
  } catch {}
  return id;
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (orderBusy || cartBusy || quoteTotal === null || !form.reportValidity())
    return;
  const payload = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(payload)) payload[key] = payload[key].trim();
  payload.items = get().map(({ id, q }) => ({ id, q }));
  payload.expectedTotal = quoteTotal;
  payload.requestId = attemptKey(payload);
  orderBusy = true;
  buttonState();
  showMessage("");
  try {
    const response = await fetch("/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 409) await renderCart();
      throw Error(data.error || "تعذر تأكيد الطلب. حاول مجددًا.");
    }
    set([]);
    try {
      sessionStorage.removeItem("novaOrderAttempt");
    } catch {}
    memoryAttempt = null;
    document.getElementById("checkoutLayout").hidden = true;
    const success = document.getElementById("orderSuccess");
    success.className = "successBox";
    success.innerHTML =
      "<h2>وصلنا طلبك!</h2><p>احتفظ برقم الطلب. تقدر تتابع حالته برقم الهاتف المستخدم في الشراء.</p><code>" +
      safe(data.id) +
      "</code><p>الإجمالي المؤكّد: " +
      htmlFmt(data.total) +
      '</p><a class="btn hot" href="/track?order=' +
      encodeURIComponent(data.id) +
      '">تتبّع طلبي</a> <a class="btn" href="/#shop">العودة للتسوّق</a>';
    success.hidden = false;
    success.setAttribute("tabindex", "-1");
    success.focus();
    document.querySelector(".steps").innerHTML = "<b>تم استلام الطلب بنجاح</b>";
  } catch (error) {
    showMessage(
      error.message || "تعذر الاتصال. أعد المحاولة؛ لن يتكرر نفس الطلب.",
    );
  } finally {
    orderBusy = false;
    buttonState();
  }
});
renderCart();
