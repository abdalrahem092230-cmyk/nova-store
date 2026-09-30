const fs = require("node:fs");
const path = require("node:path");
exports.css = fs.readFileSync(path.join(__dirname, "storefront.css"), "utf8");
const icon = (exports.icon = (name) => {
  const paths = {
    bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    home: '<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    track:
      '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
    arrow: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    truck:
      '<path d="M1 4h14v13H1zM15 9h4l4 4v4h-8"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/>',
    shield:
      '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    star: '<path d="m12 2 2.8 6.6L22 12l-7.2 3.4L12 22l-2.8-6.6L2 12l7.2-3.4Z"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  };
  return (
    '<svg class="novaIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (paths[name] || paths.bag) +
    "</svg>"
  );
});
const link = (exports.productLink = (p) =>
  "/product?id=" + encodeURIComponent(p.id));
exports.card = (p, s, esc, money) =>
  `<article class="productCard" data-id="${esc(p.id)}"><div class="productMedia"><a href="${link(p)}" aria-label="${esc(p.name)}"><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="560" height="600"></a><button class="favBtn" data-favorite="${esc(p.id)}" data-id="${esc(p.id)}" type="button" aria-label="حفظ ${esc(p.name)} في المفضلة" aria-pressed="false">${icon("heart")}</button>${p.stock <= 0 ? '<span class="novaBadge sold">نفدت الكمية</span>' : p.old > p.price ? `<span class="novaBadge">−${Math.round((1 - p.price / p.old) * 100)}%</span>` : ""}</div><div class="productBody"><div class="productMeta"><span>${esc(p.cat)}</span><span class="stockDot">${p.stock > 0 ? "متوفر" : "غير متوفر"}</span></div><a href="${link(p)}"><h3>${esc(p.name)}</h3></a><div class="productBottom"><div class="priceLine"><b>${money(p.price)} <small>${esc(s.currency)}</small></b>${p.old > p.price ? `<del>${money(p.old)}</del>` : ""}</div><button class="addCircle" ${p.stock > 0 ? `data-add="${esc(p.id)}"` : "disabled"} type="button" aria-label="إضافة ${esc(p.name)} للسلة">${icon("plus")}</button></div></div></article>`;
exports.home = ({ settings: s, products: all }, req, esc, money) => {
  const u = new URL(req.url, "http://localhost"),
    q = (u.searchParams.get("q") || "").trim(),
    cat = u.searchParams.get("cat") || "",
    sort = u.searchParams.get("sort") || "featured",
    available = u.searchParams.get("stock") === "1",
    sale = u.searchParams.get("sale") === "1";
  const normalize = (x) =>
    String(x || "")
      .normalize("NFKC")
      .replace(/[\u064B-\u065F\u0640]/g, "")
      .replace(/[أإآ]/g, "ا")
      .toLowerCase();
  const cats = [...new Set(all.map((p) => p.cat).filter(Boolean))];
  const products = all.filter(
    (p) =>
      (!cat || p.cat === cat) &&
      (!q ||
        normalize([p.name, p.cat, p.desc].join(" ")).includes(normalize(q))) &&
      (!available || p.stock > 0) &&
      (!sale || p.old > p.price),
  );
  if (sort === "price-low") products.sort((a, b) => a.price - b.price);
  if (sort === "price-high") products.sort((a, b) => b.price - a.price);
  if (sort === "new") products.reverse();
  const featured = all.find((p) => p.stock > 0) || all[0],
    second = all.find((p) => p.stock > 0 && p.id !== featured?.id);
  const filtered =
    q || cat || sale || available || u.searchParams.has("favorites");
  return `<main id="main-content">${!filtered ? `<section class="novaHero wrap"><div class="novaCopy"><span class="eyebrow"><i></i> اختيارات يومية. بطابع مختلف.</span><h1>كل يوم،<br>شيء <em>يشبهك.</em></h1><p>من التفاصيل الصغيرة إلى اختياراتك المفضلة.<br>اكتشف عالم نوفا، واختر اللي يكمّل يومك.</p><a class="btn hot" href="#shop">اكتشف المجموعة ${icon("arrow")}</a><div class="heroFoot"><span class="miniStar">${icon("star")}</span><span>لذوقك مساحة هنا.<small>THE NOVA EDIT — مختارات نوفا</small></span></div></div><div class="heroCollage">${featured ? `<a class="heroMain" href="${link(featured)}"><img src="${esc(featured.img)}" alt="${esc(featured.name)}" fetchpriority="high" width="700" height="800"><span class="imageTag">اختيار يستحق نظرة</span><div class="heroCaption"><div><small>${esc(featured.cat)}</small><b>${esc(featured.name)}</b></div><span>${money(featured.price)} <small>${esc(s.currency)}</small> ${icon("arrow")}</span></div></a>` : '<div class="heroMain coming"><h2>اختيارات جديدة<br>قريبًا.</h2></div>'}${second ? `<a class="heroSmall" href="${link(second)}"><span>تفاصيل تفرق ${icon("arrow")}</span><img src="${esc(second.img)}" alt="${esc(second.name)}" width="350" height="350"><b>${esc(second.name)}</b></a>` : ""}<div class="heroStamp" aria-hidden="true">${icon("star")}<span>مختارة<br>لك</span></div></div></section><div class="ticker" aria-hidden="true"><span>تفاصيل تصنع يومك</span>${icon("star")}<span>THE NOVA EDIT</span>${icon("star")}<span>اختيارات تشبهك</span>${icon("star")}<span>LESS ORDINARY. MORE YOU.</span></div>` : ""}
 <section class="wrap benefits" aria-label="خدمات المتجر"><a href="/shipping">${icon("truck")}<div><b>من نوفا، لبابك</b><small>توصيل داخل ليبيا</small></div></a><a href="/track">${icon("track")}<div><b>طلبك تحت عينك</b><small>تتبّع واضح في كل خطوة</small></div></a><a href="/returns">${icon("shield")}<div><b>كل التفاصيل قدّامك</b><small>الشحن والاستبدال بكل وضوح</small></div></a></section>
 ${
   !filtered && cats.length
     ? `<section class="wrap categorySection" id="categories"><div class="sectionHeading"><div><span class="eyebrow">ابدأ من هنا</span><h2>على ذوقك.</h2></div><a class="textLink" href="#shop">كل المنتجات ${icon("arrow")}</a></div><div class="categoryGrid">${cats
         .map((c, i) => {
           const p = all.find((p) => p.cat === c);
           return `<a class="categoryTile tone${i % 3}" href="/?cat=${encodeURIComponent(c)}#shop"><div><small>0${i + 1}</small><h3>${esc(c)}</h3><span>${all.filter((p) => p.cat === c).length} منتجات ${icon("arrow")}</span></div><img src="${esc(p.img)}" alt="" loading="lazy" width="200" height="240"></a>`;
         })
         .join("")}</div></section>`
     : ""
 }
 <section class="novaCollection wrap" id="shop"><div class="sectionHeading"><div><span class="eyebrow">اختيارات نوفا / THE COLLECTION</span><h2>${q ? "لقينا لك." : cat ? esc(cat) : sale ? "فرصة لا تفوّتها." : "يمكن هذا اللي تدور عليه."}</h2></div><span class="muted">تفاصيل تحبّها. وتحب تهديها.</span></div><form class="novaFilters" action="/#shop" method="get"><input type="hidden" name="cat" value="${esc(cat)}">${sale ? '<input type="hidden" name="sale" value="1">' : ""}${u.searchParams.has("favorites") ? '<input type="hidden" name="favorites" value="1">' : ""}<label class="novaSearch">${icon("search")}<input name="q" value="${esc(q)}" placeholder="شنو تدور عليه؟" aria-label="ابحث في المجموعة"></label><select name="sort" aria-label="ترتيب المنتجات">${[
   ["featured", "اختيارات نوفا"],
   ["new", "الأحدث أولًا"],
   ["price-low", "السعر: من الأقل"],
   ["price-high", "السعر: من الأعلى"],
 ]
   .map(
     ([v, t]) =>
       `<option value="${v}" ${sort === v ? "selected" : ""}>${t}</option>`,
   )
   .join(
     "",
   )}</select><label class="stockFilter"><input type="checkbox" name="stock" value="1" ${available ? "checked" : ""}> المتوفر فقط</label><button class="btn" type="submit">تطبيق</button><button class="btn favoriteFilter" type="button" id="favoriteFilter" aria-pressed="false">${icon("heart")} المفضلة</button></form><div class="categoryScroller"><a href="/#shop" class="catChip ${!cat && !sale ? "active" : ""}">الكل</a>${cats.map((c) => `<a class="catChip ${cat === c ? "active" : ""}" href="/?cat=${encodeURIComponent(c)}#shop">${esc(c)}</a>`).join("")}<a href="/?sale=1#shop" class="catChip ${sale ? "active" : ""}">التخفيضات</a></div><div class="novaResults"><span id="resultCount" aria-live="polite">${products.length} منتجات</span>${filtered ? '<a href="/#shop">مسح الفلاتر ×</a>' : ""}</div><div class="productGrid">${products.map((p) => exports.card(p, s, esc, money)).join("")}</div><div class="emptyState" id="favoriteEmpty" ${products.length ? "hidden" : ""}>${icon("search")}<h3>ما لقيناش منتجات مطابقة</h3><p>جرّب كلمة ثانية أو امسح الفلاتر.</p><a class="btn hot" href="/#shop">تصفّح المجموعة</a></div></section>
 <section class="wrap editorial"><div><span class="eyebrow">أقل حيرة. أكثر ذوق.</span><h2>التفاصيل الصغيرة،<br><em>هي كل الحكاية.</em></h2><p>قطعة تكمّل إطلالتك، أو هدية تقول الكثير.<br>خذ وقتك، واحفظ اللي يعجبك للمرة الجاية.</p><a class="btn" href="/?favorites=1#shop">اختياراتي المحفوظة ${icon("heart")}</a></div><div class="editorialArt" aria-hidden="true"><span>N</span>${icon("star")}<small>CURATED FOR YOUR EVERYDAY.</small></div></section>
 <section class="wrap faq"><div><span class="eyebrow">نخليها سهلة عليك</span><h2>قبل ما تطلب.</h2><p class="muted">إجابات قصيرة لأسئلة مهمة.</p><a class="textLink" href="/shipping">تفاصيل الشحن ${icon("arrow")}</a></div><div><details><summary>كيف نطلب من نوفا؟</summary><p>اختار منتجاتك وأضفها للسلة، اكتب بيانات التوصيل وراجع الإجمالي. بعد التأكيد يظهر رقم طلبك للاحتفاظ به.</p></details><details><summary>كم تكلفة التوصيل؟</summary><p>تكلفة الشحن ${money(s.ship)} ${esc(s.currency)}${s.free > 0 ? `، ومجاني للطلبات من ${money(s.free)} ${esc(s.currency)}` : ""}. المبلغ النهائي يظهر في السلة قبل التأكيد.</p></details><details><summary>وين نلقى حالة طلبي؟</summary><p>افتح صفحة تتبّع الطلب، وأدخل رقم الطلب ورقم الهاتف المستخدم في الشراء.</p></details><details><summary>هل نقدر نطلب بدون حساب؟</summary><p>نعم، تقدر تكمل طلبك كزائر. الحساب يساعدك تحفظ بيانات التوصيل وتشوف طلباتك الجديدة في مكان واحد.</p></details></div></section></main>`;
};
exports.script = fs.readFileSync(
  path.join(__dirname, "storefront-client.js"),
  "utf8",
);
