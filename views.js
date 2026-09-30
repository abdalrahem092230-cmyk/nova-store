const fs = require("node:fs"),
  path = require("node:path");
const UI = require("./storefront"),
  AREAS = require("./libya-locations");
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
exports.json = json;
exports.product = (d, product, esc, money) => {
  const s = d.settings,
    p = product,
    images = [p.img, ...(Array.isArray(p.images) ? p.images : [])]
      .filter((x, i, a) => x && a.indexOf(x) === i)
      .slice(0, 8),
    wa = String(s.wa || "").replace(/\D/g, "");
  const related = d.products
    .filter((x) => !x.archivedAt && x.id !== p.id && x.cat === p.cat)
    .slice(0, 3);
  return `<main class="section" id="main-content"><div class="wrap"><nav class="breadcrumb" aria-label="مسار التصفح"><a href="/">الرئيسية</a><span>/</span><a href="/?cat=${encodeURIComponent(p.cat)}#shop">${esc(p.cat)}</a><span>/</span><span>${esc(p.name)}</span></nav><div class="productDetail"><div class="productPhotos"><img id="productMainImage" class="productMainImage" src="${esc(images[0])}" alt="${esc(p.name)}" width="700" height="700" fetchpriority="high">${images.length > 1 ? `<div class="productThumbnails">${images.map((img, i) => `<button class="productThumb" type="button" data-gallery="${esc(img)}" aria-label="عرض صورة ${i + 1}" aria-pressed="${i === 0}"><img src="${esc(img)}" alt="" width="58" height="58" loading="lazy"></button>`).join("")}</div>` : ""}</div><div class="productInfo"><span class="eyebrow">${esc(p.cat)} / NOVA SELECTION</span><h1>${esc(p.name)}</h1><div class="priceLine"><b>${money(p.price)} <small>${esc(s.currency)}</small></b>${p.old > p.price ? `<del>${money(p.old)} ${esc(s.currency)}</del>` : ""}</div><span class="availability">${p.stock > 0 ? "متوفر الآن" : "غير متوفر حاليًا"}</span><p class="description">${esc(p.desc || "من اختيارات نوفا اليومية. راجع الصور وتفاصيل السعر، ولو تحتاج معلومات إضافية عن المنتج تواصل معنا قبل الطلب.")}</p>${p.stock > 0 ? `<label for="productQty" class="eyebrow">الكمية</label><div class="quantity"><button type="button" data-quantity="-1" aria-label="تقليل الكمية">${UI.icon("minus")}</button><input id="productQty" aria-label="كمية المنتج" type="number" min="1" max="${Math.min(20, p.stock)}" value="1"><button type="button" data-quantity="1" aria-label="زيادة الكمية">${UI.icon("plus")}</button></div>` : ""}<div class="productActions"><button class="btn hot" type="button" ${p.stock > 0 ? `data-add="${esc(p.id)}"` : "disabled"}>${UI.icon("bag")} ${p.stock > 0 ? "أضف للسلة" : "نفدت الكمية"}</button><button class="btn" type="button" data-favorite="${esc(p.id)}" aria-label="حفظ المنتج في المفضلة" aria-pressed="false">${UI.icon("heart")}</button></div><a class="textLink" href="/checkout">مراجعة السلة ${UI.icon("arrow")}</a><div class="productHelp" style="margin-top:25px">${UI.icon("truck")}<span>الشحن ${money(s.ship)} ${esc(s.currency)}${s.free > 0 ? ` · مجاني من ${money(s.free)} ${esc(s.currency)}` : ""}</span></div><a class="productHelp" href="/returns">${UI.icon("shield")} سياسة الاستبدال والاسترجاع</a>${wa ? `<a class="productHelp" href="https://wa.me/${wa}?text=${encodeURIComponent("مرحبًا، أريد الاستفسار عن " + p.name)}" target="_blank" rel="noopener">${UI.icon("user")} عندك سؤال عن المنتج؟ تواصل معنا</a>` : ""}</div></div>${related.length ? `<section class="related"><div class="sectionHeading"><div><span class="eyebrow">تكمّل اختيارك</span><h2>يمكن تعجبك أيضًا.</h2></div></div><div class="productGrid">${related.map((p) => UI.card(p, s, esc, money)).join("")}</div></section>` : ""}</div></main>`;
};
exports.checkout = (settings, pref, esc) =>
  `<main class="section" id="main-content"><div class="wrap"><div class="head"><div><span class="eyebrow">قربنا نكمّل</span><h2>اختياراتك، في سلة.</h2><p class="checkoutLead">راجع المنتجات وبيانات التوصيل قبل تأكيد الطلب.</p></div><a class="textLink" href="/#shop">واصل التسوّق ${UI.icon("arrow")}</a></div><div class="steps"><b>01 / مراجعة السلة</b><span>02 / بيانات التوصيل</span><span>03 / تأكيد الطلب</span></div><div id="orderSuccess" hidden></div><div id="checkoutLayout" class="checkoutLayout"><form id="checkoutForm" class="checkout checkoutForm"><h3>وين نوصّل اختياراتك؟</h3><p class="checkoutLead">تقدر تطلب كزائر، أو <a class="textLink" href="/account/login">تسجّل دخول</a> لحفظ بياناتك.</p><div class="two"><div class="field"><label for="name">الاسم الكامل</label><input class="input" id="name" name="name" autocomplete="name" maxlength="120" value="${esc(pref.name || "")}" required></div><div class="field"><label for="phone">رقم الهاتف</label><input class="input" id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="10" pattern="09[0-9]{8}" placeholder="0920000000" dir="ltr" value="${esc(pref.phone || "")}" required><small class="muted">رقم ليبي يبدأ بـ 09، من 10 أرقام.</small></div></div><div class="two"><div class="field"><label for="city">المدينة</label><select class="input" id="city" name="city" autocomplete="address-level1" required><option value="">اختر المدينة</option>${Object.keys(
    AREAS,
  )
    .map(
      (c) =>
        `<option ${pref.city === c ? "selected" : ""} value="${esc(c)}">${esc(c)}</option>`,
    )
    .join(
      "",
    )}</select></div><div class="field"><label for="area">المنطقة / الحي</label><select class="input" id="area" name="area" autocomplete="address-level2" ${pref.city ? "" : "disabled"} required><option value="">اختر المنطقة</option>${(AREAS[pref.city] || []).map((a) => `<option ${pref.area === a ? "selected" : ""} value="${esc(a)}">${esc(a)}</option>`).join("")}</select></div></div><div class="field"><label for="address">العنوان بالتفصيل</label><input class="input" id="address" name="address" autocomplete="street-address" placeholder="الشارع، رقم المنزل أو أقرب نقطة دالة" maxlength="500" value="${esc(pref.address || "")}" required></div><div class="field"><label for="notes">ملاحظة للمندوب <span class="muted">(اختياري)</span></label><textarea class="input" id="notes" name="notes" rows="2" maxlength="1000" placeholder="أي تفاصيل تساعدنا نوصل لك"></textarea></div><div id="checkoutMessage" class="message" role="alert" hidden></div><button class="btn hot" id="orderBtn" type="submit" disabled>جارٍ مراجعة السلة…</button><p class="checkoutNotice">${UI.icon("shield")} تُستخدم بياناتك لتجهيز وتوصيل طلبك. <a href="/privacy">سياسة الخصوصية</a></p></form><aside class="checkoutSummary"><h3>ملخّص الطلب</h3><div id="cart" aria-live="polite"><p>جارٍ تحميل السلة…</p></div></aside></div></div></main>`;
exports.checkoutScript = fs.readFileSync(
  path.join(__dirname, "checkout-client.js"),
  "utf8",
);
