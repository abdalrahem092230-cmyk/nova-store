// Customer storefront. All content comes from the existing store data.
const fs = require('fs');
const path = require('path');
exports.css = fs.readFileSync(path.join(__dirname, 'storefront.css'), 'utf8');
exports.home = function({settings:s, products:all}, req, esc, money) {
  const u = new URL(req.url, 'http://localhost');
  const q = (u.searchParams.get('q') || '').trim();
  const cat = (u.searchParams.get('cat') || '').trim();
  const sort = u.searchParams.get('sort') || 'featured';
  const cats = [...new Set(all.map(p => p.cat).filter(Boolean))];
  const products = all.filter(p => (!cat || p.cat === cat) && (!q || `${p.name} ${p.cat} ${p.desc || ''}`.toLowerCase().includes(q.toLowerCase())));
  if (sort === 'price-low') products.sort((a,b) => a.price-b.price);
  if (sort === 'price-high') products.sort((a,b) => b.price-a.price);
  if (sort === 'new') products.sort((a,b) => String(b.id).localeCompare(String(a.id)));
  const featured = all.find(p => p.stock > 0) || all[0];
  const price = n => `${money(n)} <small>${esc(s.currency)}</small>`;
  const href = p => `/product?id=${encodeURIComponent(p.id)}`;
  const filtered = q || cat || u.searchParams.has('favorites');
  const cards = products.map(p => `<article class="productCard" data-id="${esc(p.id)}">
    <div class="productMedia"><a href="${href(p)}" aria-label="${esc(p.name)}"><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="560" height="600"></a>
      <button class="favBtn" data-id="${esc(p.id)}" type="button" data-favorite="${esc(p.id)}" aria-label="إضافة ${esc(p.name)} للمفضلة" aria-pressed="false">♡</button>
      ${p.stock <= 0 ? '<span class="novaBadge sold">نفدت الكمية</span>' : p.old > p.price ? `<span class="novaBadge">خصم ${money(Math.round((1-p.price/p.old)*100))}٪</span>` : ''}
    </div>
    <div class="productBody"><div class="productCat">${esc(p.cat)}</div><a href="${href(p)}"><h3 class="productName">${esc(p.name)}</h3></a><div class="priceLine"><span class="productPrice">${price(p.price)}</span>${p.old>p.price?`<del class="productOld">${price(p.old)}</del>`:''}</div>
    <button class="novaAdd" type="button" ${p.stock>0?`data-add="${esc(JSON.stringify({id:p.id,n:p.name,p:p.price,img:p.img}))}"`:'disabled'}>${p.stock>0?'أضف للسلة <span aria-hidden="true">+</span>':'غير متوفر حاليًا'}</button></div>
  </article>`).join('');
  return `<main id="main-content">
    ${!filtered?`<section class="novaHero wrap"><div class="novaCopy"><span class="novaEyebrow"><i></i> اختيارات نوفا · تفاصيل تصنع الفرق</span><h1>أشياء تحبّها.<br><em>كل يوم.</em></h1><p>${esc(s.tag)}. اكتشف ما يناسب ذوقك، من أساسيات يومك إلى التفاصيل اللي تكمّل إطلالتك.</p><div class="novaHeroActions"><a class="btn hot" href="#shop">اكتشف المجموعة <span aria-hidden="true">↙</span></a><a class="novaTextLink" href="#categories">تصفّح الأقسام ←</a></div><div class="novaHeroNote"><span>✦</span> اختيارك القادم يبدأ من هنا</div></div>
    ${featured?`<a class="novaHeroVisual" href="${href(featured)}"><img src="${esc(featured.img)}" alt="${esc(featured.name)}" fetchpriority="high" width="700" height="800"><span class="novaImageLabel">THE EVERYDAY EDIT</span><div class="novaFeatured"><div><small>تحت الضوء</small><b>${esc(featured.name)}</b></div><span>${price(featured.price)} <i aria-hidden="true">↖</i></span></div></a>`:'<div class="novaHeroVisual novaComing"><span>✦</span><h2>اختيارات جديدة<br>قريبًا.</h2></div>'}</section>`:''}
    <div class="novaServices wrap"><a href="/shipping"><span aria-hidden="true">↗</span><div><b>توصيل داخل ليبيا</b><small>اعرف تفاصيل الشحن</small></div></a><a href="/track"><span aria-hidden="true">◎</span><div><b>طلبك، خطوة بخطوة</b><small>تابع حالة طلبك بسهولة</small></div></a><a href="/returns"><span aria-hidden="true">↺</span><div><b>تسوّق على بيّنة</b><small>سياسة الاستبدال والاسترجاع</small></div></a></div>
    <section class="novaCollection wrap" id="shop"><div class="novaCollectionHead"><div><span class="novaEyebrow">THE COLLECTION / المجموعة</span><h2>${q?'نتائج البحث':cat?esc(cat):'اكتشف ذوقك.'}</h2></div><p>قطع تختارها لنفسك.<br>وتفاصيل تحب تهديها.</p></div>
    <div class="categoryScroller" id="categories"><a class="catChip ${!cat?'active':''}" href="/#shop">الكل <small>${all.length}</small></a>${cats.map(c=>`<a class="catChip ${cat===c?'active':''}" href="/?cat=${encodeURIComponent(c)}#shop">${esc(c)}</a>`).join('')}</div>
    <form class="novaFilters" method="get" action="/#shop"><input type="hidden" name="cat" value="${esc(cat)}"><label class="novaSearch"><span aria-hidden="true">⌕</span><input name="q" value="${esc(q)}" placeholder="شنو تدور عليه؟" aria-label="ابحث عن منتج"></label><label class="novaSort"><span>ترتيب حسب</span><select name="sort" aria-label="ترتيب المنتجات">${[['featured','اختيارات نوفا'],['new','الأحدث'],['price-low','السعر: من الأقل'],['price-high','السعر: من الأعلى']].map(([value,label])=>`<option value="${value}" ${sort===value?'selected':''}>${label}</option>`).join('')}</select></label><button class="btn" type="submit">بحث</button><button id="favoriteFilter" class="btn" type="button" onclick="toggleFavoritesView()" aria-pressed="false">♡ المفضلة</button></form>
    <div class="novaResults"><span id="resultCount" aria-live="polite">${products.length} منتج${q?` للبحث عن «${esc(q)}»`:''}</span>${q||cat||sort!=='featured'?'<a href="/#shop">مسح الفلاتر ×</a>':''}</div>
    <div class="productGrid">${cards}</div><div class="emptyState" id="favoriteEmpty" ${products.length?'hidden':''}><span aria-hidden="true">⌕</span><b>${products.length?'المفضلة لسه فاضية':'ما لقيناش منتجات مطابقة'}</b><p>${products.length?'اضغط على القلب بجانب القطع اللي عجبتك، وتلقاها هنا.':'جرّب كلمة ثانية أو تصفّح المجموعة كاملة.'}</p><a class="btn hot" href="/#shop">تصفّح المنتجات</a></div>
    </section><section class="novaClosing wrap"><div><span class="novaEyebrow">LESS SCROLLING. MORE LIVING.</span><h2>اختيار بسيط.<br>يوم أجمل.</h2><p>تسوّق براحتك، واحفظ اللي يعجبك للمرة الجاية.</p></div><a class="btn hot" href="#shop">لقطتك الجاية هنا <span aria-hidden="true">↖</span></a><span class="novaStar" aria-hidden="true">✳</span></section>
    </main>`;
};
exports.script = `
let favoriteMode = new URLSearchParams(location.search).get('favorites') === '1';
function refreshFavoriteView(){
 const cards=[...document.querySelectorAll('.productCard[data-id]')];
 if(!document.getElementById('resultCount'))return;
 let visible=0; cards.forEach(c=>{c.hidden=favoriteMode&&!favorites().includes(c.dataset.id);if(!c.hidden)visible++});
 document.getElementById('resultCount').textContent=visible+(favoriteMode?' منتج في المفضلة':' منتج');
 const empty=document.getElementById('favoriteEmpty');if(empty){empty.hidden=visible>0;const b=empty.querySelector('b'),p=empty.querySelector('p');b.textContent=favoriteMode?'ما فيش منتجات محفوظة في النتائج الحالية':'ما لقيناش منتجات مطابقة';p.textContent=favoriteMode?'احفظ القطع اللي تعجبك بالضغط على القلب، أو امسح فلاتر البحث.':'جرّب كلمة ثانية أو تصفّح المجموعة كاملة.'}
 const btn=document.getElementById('favoriteFilter');if(btn){btn.setAttribute('aria-pressed',String(favoriteMode));btn.classList.toggle('selected',favoriteMode)}
}
toggleFavoritesView=function(){if(!document.getElementById('shop')){location.href='/?favorites=1#shop';return}favoriteMode=!favoriteMode;const url=new URL(location.href);favoriteMode?url.searchParams.set('favorites','1'):url.searchParams.delete('favorites');history.replaceState(null,'',url.pathname+url.search+'#shop');refreshFavoriteView();document.getElementById('shop').scrollIntoView({behavior:'smooth'})};
document.addEventListener('click',event=>{const fav=event.target.closest('[data-favorite]');if(fav){toggleFav(fav.dataset.favorite);fav.setAttribute('aria-pressed',String(favorites().includes(fav.dataset.favorite)));refreshFavoriteView()}const btn=event.target.closest('[data-add]');if(btn){const p=JSON.parse(btn.dataset.add);add(p.id,p.n,p.p,p.img);btn.innerHTML='تمت الإضافة ✓';setTimeout(()=>btn.innerHTML='أضف للسلة <span aria-hidden="true">+</span>',1200)}});
count();document.querySelectorAll('[data-favorite]').forEach(b=>b.setAttribute('aria-pressed',String(favorites().includes(b.dataset.favorite))));refreshFavoriteView();
window.addEventListener('storage',()=>{count();refreshFavoriteView()});
`;

exports.icon = function(name){
 const paths={bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',home:'<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',track:'<circle cx="12" cy="10" r="3"/><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/>',user:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>'};
 return '<svg class="novaIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.bag)+'</svg>';
};
