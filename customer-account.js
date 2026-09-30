const crypto = require("crypto");
const LIBYA_AREAS = require("./libya-locations");

const COOKIE_NAME = "nova_customer";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function ensureCustomers(state) {
  if (!Array.isArray(state.customers)) state.customers = [];
  return state.customers;
}

function normalizePhone(v) {
  return String(v || "").replace(/\D/g, "");
}

function validPhone(v) {
  return /^09\d{8}$/.test(normalizePhone(v));
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function safeEqualHex(a, b) {
  try {
    const x = Buffer.from(String(a), "hex"),
      y = Buffer.from(String(b), "hex");
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  } catch {
    return false;
  }
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function makeSession(customerId, secret, version = 0) {
  const exp = Date.now() + THIRTY_DAYS * 1000;
  const payload = customerId + "." + exp + "." + version;
  return payload + "." + sign(payload, secret);
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf("=");
        return i < 0
          ? [x.trim(), ""]
          : [x.slice(0, i).trim(), decodeURIComponent(x.slice(i + 1))];
      }),
  );
}

function sessionCustomer(req, state, secret) {
  ensureCustomers(state);
  const raw = parseCookies(req)[COOKIE_NAME];
  if (!raw) return null;
  const parts = raw.split(".");
  if (![3, 4].includes(parts.length)) return null;
  const id = parts[0],
    exp = parts[1],
    version = parts.length === 4 ? parts[2] : "0",
    sig = parts.at(-1),
    payload = parts.slice(0, -1).join(".");
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig),
    b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return (
    state.customers.find(
      (c) => c.id === id && String(c.sessionVersion || 0) === version,
    ) || null
  );
}

function sessionCookie(customerId, secret, version = 0) {
  const token = makeSession(customerId, secret, version);
  return (
    COOKIE_NAME +
    "=" +
    encodeURIComponent(token) +
    "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" +
    THIRTY_DAYS
  );
}

function clearCookie() {
  return COOKIE_NAME + "=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

function csrfToken(customerId, secret) {
  return sign("customer-csrf:" + customerId, secret);
}

function csrfValid(customerId, secret, token) {
  const expected = csrfToken(customerId, secret);
  const a = Buffer.from(String(token || "")),
    b = Buffer.from(expected);
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function register(state, input) {
  const customers = ensureCustomers(state);
  const phone = normalizePhone(input.phone);
  if (!String(input.name || "").trim()) return { error: "اكتب الاسم الكامل" };
  if (!validPhone(phone))
    return { error: "رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 09" };
  if (customers.some((c) => c.phone === phone))
    return { error: "يوجد حساب مسجل بهذا الرقم بالفعل" };
  if (
    String(input.password || "").length < 8 ||
    String(input.password || "").length > 128
  )
    return { error: "كلمة المرور يجب أن تكون من 8 إلى 128 حرفًا" };
  if (input.city && !LIBYA_AREAS[input.city])
    return { error: "اختر مدينة صحيحة" };
  if (
    input.area &&
    (!LIBYA_AREAS[input.city] || !LIBYA_AREAS[input.city].includes(input.area))
  )
    return { error: "اختر منطقة صحيحة" };
  const salt = crypto.randomBytes(16).toString("hex");
  const customer = {
    id: "CUS-" + crypto.randomBytes(8).toString("hex"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: String(input.name || "").trim(),
    phone,
    phone2: normalizePhone(input.phone2),
    email: String(input.email || "")
      .trim()
      .toLowerCase(),
    city: String(input.city || "").trim(),
    area: String(input.area || "").trim(),
    address: String(input.address || "").trim(),
    landmark: String(input.landmark || "").trim(),
    passwordSalt: salt,
    passwordHash: hashPassword(input.password, salt),
  };
  customers.push(customer);
  return { customer };
}

function login(state, phone, password) {
  const customers = ensureCustomers(state);
  const p = normalizePhone(phone);
  const customer = customers.find((c) => c.phone === p);
  if (!customer) return { error: "رقم الهاتف أو كلمة المرور غير صحيحة" };
  const h = hashPassword(password, customer.passwordSalt);
  if (!safeEqualHex(h, customer.passwordHash))
    return { error: "رقم الهاتف أو كلمة المرور غير صحيحة" };
  return { customer };
}

function updateProfile(state, customer, input) {
  ensureCustomers(state);
  const phone = normalizePhone(input.phone);
  if (!String(input.name || "").trim()) return { error: "اكتب الاسم الكامل" };
  if (!validPhone(phone))
    return { error: "رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 09" };
  if (state.customers.some((c) => c.id !== customer.id && c.phone === phone))
    return { error: "رقم الهاتف مستخدم في حساب آخر" };
  if (input.city && !LIBYA_AREAS[input.city])
    return { error: "اختر مدينة صحيحة" };
  if (
    input.area &&
    (!LIBYA_AREAS[input.city] || !LIBYA_AREAS[input.city].includes(input.area))
  )
    return { error: "اختر منطقة صحيحة" };
  Object.assign(customer, {
    name: String(input.name || "").trim(),
    phone,
    phone2: normalizePhone(input.phone2),
    email: String(input.email || "")
      .trim()
      .toLowerCase(),
    city: String(input.city || "").trim(),
    area: String(input.area || "").trim(),
    address: String(input.address || "").trim(),
    landmark: String(input.landmark || "").trim(),
    updatedAt: new Date().toISOString(),
  });
  return { customer };
}

function changePassword(customer, currentPassword, newPassword) {
  const currentHash = hashPassword(currentPassword, customer.passwordSalt);
  if (!safeEqualHex(currentHash, customer.passwordHash))
    return { error: "كلمة المرور الحالية غير صحيحة" };
  if (
    String(newPassword || "").length < 8 ||
    String(newPassword || "").length > 128
  )
    return { error: "كلمة المرور الجديدة يجب أن تكون من 8 إلى 128 حرفًا" };
  const salt = crypto.randomBytes(16).toString("hex");
  customer.sessionVersion = (customer.sessionVersion || 0) + 1;
  customer.passwordSalt = salt;
  customer.passwordHash = hashPassword(newPassword, salt);
  customer.updatedAt = new Date().toISOString();
  return { customer };
}

function accountCss() {
  return `
  .accountShell{display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start}
  .accountSide,.accountMain{background:#11151a;border:1px solid #252c34;border-radius:22px}
  .accountSide{padding:18px;position:sticky;top:100px}
  .accountAvatar{width:58px;height:58px;border-radius:18px;background:#d8ff45;color:#111;display:grid;place-items:center;font-size:24px;font-weight:950;margin-bottom:12px}
  .accountSide h3{margin:0 0 4px}.accountSide .muted{font-size:12px}
  .accountMenu{display:grid;gap:7px;margin-top:18px}.accountMenu a{padding:11px 12px;border-radius:12px;background:#0d1116;border:1px solid #242b33}.accountMenu a:hover{border-color:#d8ff45}
  .accountMain{padding:22px}.accountHero{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:18px}
  .accountStats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0 22px}.accountStat{padding:15px;border-radius:16px;background:#0d1116;border:1px solid #252c34}.accountStat b{display:block;font-size:21px}.accountStat span{font-size:11px;color:#8f97a3}
  .orderHistory{display:grid;gap:12px}.historyCard{border:1px solid #27303a;border-radius:17px;padding:15px;background:#0d1116}.historyTop{display:flex;justify-content:space-between;gap:12px}.historyMeta{display:flex;gap:7px;flex-wrap:wrap;color:#929aa7;font-size:11px}.statusPill{padding:5px 8px;border-radius:99px;background:#1b2111;color:#d8ff45;border:1px solid #344021;font-size:10px;font-weight:900}
  .accountForm{border-top:1px solid #252c34;margin-top:20px;padding-top:18px}.accountForm h3{margin-top:0}
  .authWrap{width:min(520px,calc(100% - 24px));margin:50px auto}.authCard{padding:24px;background:#11151a;border:1px solid #252c34;border-radius:24px}.authSwitch{text-align:center;margin-top:16px;color:#9aa1ad}.authSwitch a{color:#d8ff45;font-weight:800}
  @media(max-width:820px){.accountShell{grid-template-columns:1fr}.accountSide{position:static}.accountMenu{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:560px){.accountStats{grid-template-columns:1fr 1fr}.accountHero{align-items:flex-start;flex-direction:column}.historyTop{flex-direction:column}}
  `;
}

function authBody(mode, error, esc) {
  const registerMode = mode === "register";
  const title = registerMode ? "إنشاء حساب" : "تسجيل الدخول";
  const extra = registerMode
    ? `
    <div class="field"><label>الاسم الكامل</label><input class="input" name="name" aria-label="الاسم الكامل" autocomplete="name" maxlength="120" required></div>
    <div class="field"><label>البريد الإلكتروني <span class="muted">(اختياري)</span></label><input class="input" type="email" name="email"></div>
  `
    : "";
  return `<main class="authWrap" id="main-content"><div class="authCard"><div class="brand"><span class="logo">N</span><span>NOVA ACCOUNT<small>حساب العميل</small></span></div><h2>${title}</h2>${error ? '<p style="color:#ff8b95">' + esc(error) + "</p>" : ""}<form method="post" action="/account/${registerMode ? "register" : "login"}">${extra}<div class="field"><label>رقم الهاتف</label><input class="input" name="phone" aria-label="رقم الهاتف" autocomplete="tel-national" inputmode="numeric" maxlength="10" placeholder="0920000000" required></div><div class="field"><label>كلمة المرور</label><input class="input" name="password" type="password" aria-label="كلمة المرور" autocomplete="${registerMode ? "new-password" : "current-password"}" maxlength="128" minlength="8" required></div><button class="btn hot" style="width:100%">${title}</button></form><div class="authSwitch">${registerMode ? 'عندك حساب؟ <a href="/account/login">سجل دخول</a>' : 'ما عندكش حساب؟ <a href="/account/register">أنشئ حساب</a>'}</div></div></main>`;
}

function accountBody(
  customer,
  state,
  settings,
  esc,
  money,
  message = "",
  csrf = "",
) {
  const orders = (state.orders || [])
    .filter((o) => o.customerId === customer.id && !o.archivedAt)
    .slice()
    .reverse();
  const active = orders.filter(
    (o) => !["مكتمل", "ملغي"].includes(o.status),
  ).length;
  const spent = orders
    .filter((o) => o.status === "مكتمل")
    .reduce((a, o) => a + (+o.total || 0), 0);
  const cities = Object.keys(LIBYA_AREAS)
    .map(
      (c) =>
        '<option value="' +
        esc(c) +
        '" ' +
        (c === customer.city ? "selected" : "") +
        ">" +
        esc(c) +
        "</option>",
    )
    .join("");
  const areas = (LIBYA_AREAS[customer.city] || [])
    .map(
      (a) =>
        '<option value="' +
        esc(a) +
        '" ' +
        (a === customer.area ? "selected" : "") +
        ">" +
        esc(a) +
        "</option>",
    )
    .join("");
  const history = orders
    .map(
      (o) =>
        '<article class="historyCard"><div class="historyTop"><div><b>' +
        esc(o.id) +
        '</b><div class="historyMeta"><span>' +
        new Date(o.created).toLocaleString("ar-LY") +
        "</span><span>•</span><span>" +
        esc(o.city || "") +
        (o.area ? " / " + esc(o.area) : "") +
        '</span></div></div><div><span class="statusPill">' +
        esc(o.status) +
        '</span> <b style="margin-right:8px">' +
        money(o.total) +
        " " +
        esc(settings.currency) +
        '</b></div></div><details style="margin-top:12px"><summary class="muted" style="cursor:pointer">تفاصيل الطلب</summary><div style="margin-top:8px">' +
        (o.items || [])
          .map(
            (i) =>
              '<div class="row"><span>' +
              esc(i.name) +
              " × " +
              i.q +
              "</span><b>" +
              money((+i.price || 0) * (+i.q || 0)) +
              " " +
              esc(settings.currency) +
              "</b></div>",
          )
          .join("") +
        '<div class="row"><span>العنوان</span><b>' +
        esc(o.address || "") +
        "</b></div></div></details></article>",
    )
    .join("");
  const csrfField =
    '<input type="hidden" name="csrf" value="' + esc(csrf) + '">';
  return `<main class="section" id="main-content"><div class="wrap"><div class="accountShell"><aside class="accountSide"><div class="accountAvatar">${esc((customer.name || "ن")[0])}</div><h3>${esc(customer.name)}</h3><div class="muted">${esc(customer.phone)}</div><div class="accountMenu"><a href="#orders">طلباتي</a><a href="#profile">بياناتي</a><a href="#security">الأمان</a><form method="post" action="/account/logout">${csrfField}<button class="btn danger" style="width:100%">تسجيل خروج</button></form></div></aside><section class="accountMain">${message ? '<p class="ok">' + esc(message) + "</p>" : ""}<div class="accountHero"><div><h2 style="margin:0">مرحبًا، ${esc(customer.name)}</h2><p class="muted">هنا تلقى بياناتك وكل طلباتك في مكان واحد.</p></div><a class="btn hot" href="/#shop">تسوّق الآن</a></div><div class="accountStats"><div class="accountStat"><b>${orders.length}</b><span>إجمالي الطلبات</span></div><div class="accountStat"><b>${active}</b><span>طلبات نشطة</span></div><div class="accountStat"><b>${money(spent)} ${esc(settings.currency)}</b><span>مشتريات مكتملة</span></div></div><section id="orders"><h3>طلباتي</h3><div class="orderHistory">${history || '<div class="historyCard"><b>ما عندكش طلبات مرتبطة بالحساب حتى الآن.</b><p class="muted">أي طلب جديد تسويه وأنت مسجل دخول بيظهر هنا تلقائيًا.</p></div>'}</div></section><section id="profile" class="accountForm"><h3>بيانات الحساب والتوصيل</h3><form method="post" action="/account/profile">${csrfField}<div class="two"><div class="field"><label>الاسم الكامل</label><input class="input" name="name" value="${esc(customer.name)}" required></div><div class="field"><label>رقم الهاتف</label><input class="input" name="phone" aria-label="رقم الهاتف" autocomplete="tel-national" inputmode="numeric" maxlength="10" value="${esc(customer.phone)}" required></div><div class="field"><label>هاتف بديل</label><input class="input" name="phone2" inputmode="numeric" maxlength="10" value="${esc(customer.phone2 || "")}"></div><div class="field"><label>البريد الإلكتروني</label><input class="input" type="email" name="email" value="${esc(customer.email || "")}"></div><div class="field"><label>المدينة</label><select class="input" id="accountCity" name="city"><option value="">اختر المدينة</option>${cities}</select></div><div class="field"><label>المنطقة / الحي</label><select class="input" id="accountArea" name="area"><option value="">اختر المنطقة</option>${areas}</select></div></div><div class="field"><label>تفاصيل العنوان</label><input class="input" name="address" value="${esc(customer.address || "")}" placeholder="الشارع ورقم المنزل"></div><div class="field"><label>أقرب نقطة دالة</label><input class="input" name="landmark" value="${esc(customer.landmark || "")}" placeholder="مثال: بجانب المدرسة أو المسجد"></div><button class="btn hot">حفظ البيانات</button></form></section><section id="security" class="accountForm"><h3>تغيير كلمة المرور</h3><form method="post" action="/account/password">${csrfField}<div class="two"><div class="field"><label>كلمة المرور الحالية</label><input class="input" type="password" name="currentPassword" required></div><div class="field"><label>كلمة المرور الجديدة</label><input class="input" type="password" minlength="8" name="newPassword" required></div></div><button class="btn">تغيير كلمة المرور</button></form></section></section></div></div></main><script>const accountAreas=${JSON.stringify(LIBYA_AREAS)};let ac=document.getElementById('accountCity'),aa=document.getElementById('accountArea');if(ac&&aa)ac.addEventListener('change',()=>{let list=accountAreas[ac.value]||[];aa.innerHTML='<option value="">اختر المنطقة</option>'+list.map(x=>'<option value="'+x+'">'+x+'</option>').join('')})</script>`;
}

module.exports = {
  ensureCustomers,
  sessionCustomer,
  sessionCookie,
  clearCookie,
  csrfToken,
  csrfValid,
  register,
  login,
  updateProfile,
  changePassword,
  authBody,
  accountBody,
  accountCss,
  validPhone,
  normalizePhone,
};
