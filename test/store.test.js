const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  vm = require("node:vm");
const { spawn } = require("node:child_process");
const { quote, createOrder } = require("../commerce"),
  Store = require("../storage"),
  accounts = require("../customer-account"),
  areas = require("../libya-locations");
const fixture = () => ({
  settings: {
    name: "نوفا ستور",
    en: "NOVA STORE",
    tag: "اختيارات",
    currency: "د.ل",
    ship: 15,
    free: 250,
    wa: "",
  },
  products: [
    {
      id: "p1",
      name: "ساعة",
      cat: "إكسسوارات",
      img: "https://example.com/image.jpg",
      price: 100,
      old: 150,
      stock: 5,
    },
  ],
  orders: [],
});
const city = Object.keys(areas)[0],
  area = areas[city][0];
const orderInput = (overrides = {}) => ({
  name: "عميل اختبار",
  phone: "0920000000",
  city,
  area,
  address: "عنوان اختبار",
  notes: "",
  items: [{ id: "p1", q: 1 }],
  requestId: "test-request-00000001",
  expectedTotal: 115,
  ...overrides,
});
test("quote uses server prices, aggregates duplicate items, rounds totals", () => {
  const d = fixture();
  assert.equal(quote(d, [{ id: "p1", q: 1, price: 0.01 }]).total, 115);
  assert.equal(
    quote(d, [
      { id: "p1", q: 2 },
      { id: "p1", q: 1 },
    ]).shipping,
    0,
  );
  assert.throws(
    () =>
      quote(d, [
        { id: "p1", q: 3 },
        { id: "p1", q: 3 },
      ]),
    /غير متاحة/,
  );
  assert.throws(() => quote(d, [{ id: "p1", q: 1.5 }]));
  assert.throws(() => quote(d, [null]));
});
test("checkout never silently reduces requested quantities and detects price changes", () => {
  const d = fixture();
  assert.throws(
    () => createOrder(d, orderInput({ items: [{ id: "p1", q: 6 }] })),
    /غير متاحة/,
  );
  assert.throws(
    () => createOrder(d, orderInput({ expectedTotal: 1 })),
    /تغيّر إجمالي/,
  );
  assert.equal(d.orders.length, 0);
  assert.equal(d.products[0].stock, 5);
});
test("a retried request returns its original order without deducting stock twice", () => {
  const d = fixture(),
    first = createOrder(d, orderInput());
  const retry = createOrder(d, orderInput());
  assert.equal(retry.order.id, first.order.id);
  assert.equal(retry.replayed, true);
  assert.equal(d.products[0].stock, 4);
  assert.equal(d.orders.length, 1);
  assert.throws(
    () => createOrder(d, orderInput({ name: "عميل آخر" })),
    /تغيّرت بيانات/,
  );
});
test("archived products are not purchasable and zero free-shipping threshold disables promotion", () => {
  const d = fixture();
  d.settings.free = 0;
  assert.equal(quote(d, [{ id: "p1", q: 3 }]).shipping, 15);
  d.products[0].archivedAt = "2026-01-01";
  assert.throws(() => quote(d, [{ id: "p1", q: 1 }]));
});
test("file storage serializes concurrent stock deductions and refuses corrupt data", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unit-")),
    file = path.join(dir, "store.json"),
    store = new Store({ file, seed: fixture() });
  try {
    await store.init();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        store.run(true, async () => {
          const d = store.read();
          createOrder(
            d,
            orderInput({
              requestId: "test-request-" + String(i).padStart(12, "0"),
            }),
          );
          await new Promise((r) => setImmediate(r));
          store.write(d);
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
    const state = JSON.parse(fs.readFileSync(file));
    assert.equal(state.products[0].stock, 0);
    assert.equal(state.orders.length, 5);
    await assert.rejects(
      store.run(true, () => {
        store.write(fixture());
        throw Error("rollback");
      }),
    );
    assert.equal(JSON.parse(fs.readFileSync(file)).orders.length, 5);
    fs.writeFileSync(file, "broken");
    await assert.rejects(store.run(false, () => {}));
    assert.equal(fs.readFileSync(file, "utf8"), "broken");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("PostgreSQL waits for COMMIT and rolls back failed writes", async () => {
  const calls = [];
  let fail = false,
    notified = false;
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith("SELECT")) return { rows: [{ data: fixture() }] };
      if (fail && sql.startsWith("UPDATE")) throw Error("db failed");
      return {};
    },
    release: () => calls.push("release"),
  };
  const store = new Store({ pool: { connect: async () => client } });
  await store.run(true, () => {
    store.write(fixture());
    store.afterCommit(() => {
      assert(calls.includes("COMMIT"));
      notified = true;
    });
  });
  await new Promise((r) => setImmediate(r));
  assert(notified);
  assert(calls.some((s) => s.includes("FOR UPDATE")));
  calls.length = 0;
  fail = true;
  notified = false;
  await assert.rejects(
    store.run(true, () => {
      store.write(fixture());
      store.afterCommit(() => {
        notified = true;
      });
    }),
  );
  assert(calls.includes("ROLLBACK"));
  assert(!calls.includes("COMMIT"));
  assert(!notified);
});
test("password changes revoke prior customer cookies", () => {
  const d = fixture(),
    { customer } = accounts.register(d, {
      name: "اختبار",
      phone: "0920000000",
      password: "test-password",
    });
  const old = accounts.sessionCookie(customer.id, "secret");
  assert(accounts.sessionCustomer({ headers: { cookie: old } }, d, "secret"));
  assert(
    !accounts.changePassword(customer, "test-password", "new-test-password")
      .error,
  );
  assert.equal(
    accounts.sessionCustomer({ headers: { cookie: old } }, d, "secret"),
    null,
  );
  const current = accounts.sessionCookie(
    customer.id,
    "secret",
    customer.sessionVersion,
  );
  assert(
    accounts.sessionCustomer({ headers: { cookie: current } }, d, "secret"),
  );
});
test("HTTP pages, embedded scripts, escaping, checkout, tracking, admin inventory and persistence", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-http-"));
  const d = fixture();
  d.products[0].name = `ساعة ' <script>alert(1)</script>`;
  fs.writeFileSync(path.join(dir, "store.json"), JSON.stringify(d));
  const port = 31000 + Math.floor(Math.random() * 10000),
    base = "http://127.0.0.1:" + port;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      DATABASE_URL: "",
      NEON_DATABASE_URL: "",
      RENDER: "",
      ADMIN_EMAIL: "test@example.test",
      ADMIN_PASSWORD: "test-password",
      CUSTOMER_SESSION_SECRET: "test-secret",
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_CHAT_ID: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stderr.on("data", (b) => (output += b));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error(output || "server did not start")),
      5000,
    );
    server.stdout.on("data", (b) => {
      if (String(b).includes("NOVA on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once("exit", (c) => reject(Error("exit " + c + " " + output)));
  });
  t.after(async () => {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const post = (url, payload, headers = {}) =>
    fetch(base + url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
      redirect: "manual",
    });
  for (const route of [
    "/",
    "/?q=ساعة",
    "/?favorites=1",
    "/?sale=1",
    "/product?id=p1",
    "/checkout",
    "/track",
    "/shipping",
    "/returns",
    "/privacy",
    "/account/login",
    "/account/register",
    "/admin",
  ]) {
    const r = await fetch(base + route);
    assert.equal(r.status, 200, route);
    const html = await r.text();
    for (const match of html.matchAll(
      /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g,
    )) {
      if (match[0].includes("application/ld+json")) JSON.parse(match[1]);
      else new vm.Script(match[1], { filename: route });
    }
    assert(
      !html.includes("<script>alert(1)</script>"),
      route + " escapes product names",
    );
  }
  for (const size of [32, 192, 512]) {
    const icon = await fetch(base + `/nova-icon-${size}.png`);
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get("content-type"), /image\/png/);
    assert.deepEqual(Buffer.from(await icon.arrayBuffer()).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  assert.equal((await fetch(base + "/product?id=missing")).status, 404);
  assert.equal((await fetch(base + "/missing")).status, 404);
  const quoteResponse = await post("/api/quote", {
    items: [{ id: "p1", q: 1 }],
  });
  assert.equal((await quoteResponse.json()).total, 115);
  const [r1, r2] = await Promise.all([
    post("/order", orderInput()),
    post("/order", orderInput()),
  ]);
  assert.equal(r1.status, 200);
  const first = await r1.json();
  assert.equal((await r2.json()).id, first.id);
  const disk = () => JSON.parse(fs.readFileSync(path.join(dir, "store.json")));
  assert.equal(disk().products[0].stock, 4);
  assert.equal(disk().orders.length, 1);
  const cross = await post("/order", orderInput(), {
    origin: "https://untrusted.example",
  });
  assert.equal(cross.status, 403);
  const tracked = await fetch(
    base + "/track?order=" + first.id + "&phone=0920000000",
  );
  const trackedHtml = await tracked.text();
  assert(trackedHtml.includes(first.id));
  assert(trackedHtml.includes("الإجمالي"));
  const incorrect = await (
    await fetch(base + "/track?order=" + first.id + "&phone=0921111111")
  ).text();
  assert(incorrect.includes("لم نجد طلبًا بهذه البيانات"));
  assert(!incorrect.includes('class="row"><span>الإجمالي'));
  const login = await fetch(base + "/admin/login", {
    method: "POST",
    body: new URLSearchParams({
      email: "test@example.test",
      password: "test-password",
    }),
    redirect: "manual",
  });
  assert.equal(login.status, 302);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const admin = await (
    await fetch(base + "/admin", { headers: { cookie } })
  ).text();
  for (const match of admin.matchAll(/<script>([\s\S]*?)<\/script>/g))
    new vm.Script(match[1]);
  const csrf = admin.match(/name="csrf" value="([^"]+)"/)[1];
  const mutate = (route, data) =>
    fetch(base + route, {
      method: "POST",
      headers: { cookie },
      body: new URLSearchParams({ csrf, ...data }),
      redirect: "manual",
    });
  assert.equal(
    (await mutate("/admin/status", { id: first.id, status: "wrong" })).status,
    400,
  );
  await mutate("/admin/status", { id: first.id, status: "مكتمل" });
  await mutate("/admin/order-archive", { id: first.id });
  assert.equal(
    disk().products[0].stock,
    4,
    "archiving completed orders does not restock",
  );
  await mutate("/admin/order-restore", { id: first.id });
  assert(!disk().orders[0].archivedAt);
  await mutate("/admin/status", { id: first.id, status: "ملغي" });
  assert.equal(disk().products[0].stock, 5);
  await mutate("/admin/status", { id: first.id, status: "ملغي" });
  assert.equal(disk().products[0].stock, 5, "cancel twice restores once");
  await mutate("/admin/delete", { id: "p1" });
  assert.equal(
    (await (await fetch(base + "/api/catalog")).json()).products.length,
    0,
  );
  await mutate("/admin/product-restore", { id: "p1" });
  assert.equal(
    (await (await fetch(base + "/api/catalog")).json()).products.length,
    1,
  );
  const invalid = await mutate("/admin/product", {
    name: "test",
    cat: "test",
    price: -1,
    old: 0,
    stock: 1,
    img: "https://example.com/a.jpg",
  });
  assert.equal(invalid.status, 400);
  // Preserve installed native app response shapes and shared inventory.
  const bootstrap = await (await fetch(base + "/api/mobile/bootstrap")).json();
  assert.equal(bootstrap.products[0].id, "p1");
  assert(bootstrap.locations[city]);
  const registered = await post("/api/mobile/register", {
    name: "مستخدم التطبيق",
    phone: "0921111111",
    password: "native-password",
  });
  assert.equal(registered.status, 201);
  const auth = await registered.json();
  assert(auth.token);
  assert(!auth.customer.passwordHash);
  const authHeaders = { authorization: "Bearer " + auth.token };
  const me = await (
    await fetch(base + "/api/mobile/me", { headers: authHeaders })
  ).json();
  assert.equal(me.customer.id, auth.customer.id);
  const profile = await fetch(base + "/api/mobile/profile", {
    method: "PATCH",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ name: "اسم التطبيق المحدّث" }),
  });
  assert.equal(profile.status, 200);
  const mobileInput = {
    ...orderInput({ requestId: "mobile-test-0000001" }),
    phone: "0921111111",
  };
  const mobileFirst = await post("/api/mobile/order", mobileInput, authHeaders);
  assert.equal(mobileFirst.status, 201);
  const mobileOrder = (await mobileFirst.json()).order;
  const mobileAgain = await post("/api/mobile/order", mobileInput, authHeaders);
  assert.equal((await mobileAgain.json()).order.id, mobileOrder.id);
  assert.equal(disk().products[0].stock, 4);
  const legacyInput = { ...orderInput(), phone: "0921111111" };
  delete legacyInput.requestId;
  delete legacyInput.expectedTotal;
  const legacy = await post("/api/mobile/order", legacyInput, authHeaders);
  assert.equal(legacy.status, 201, "installed v1 app contract");
  assert((await legacy.json()).order.id);
  const history = await (
    await fetch(base + "/api/mobile/orders", { headers: authHeaders })
  ).json();
  assert.equal(history.orders.length, 2);
  assert.equal(
    (
      await fetch(
        base + "/api/mobile/track?id=" + mobileOrder.id + "&phone=0920000000",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(base + "/api/mobile/track?id=" + mobileOrder.id, {
        headers: authHeaders,
      })
    ).status,
    200,
  );
  assert(!output.includes("Request failed"), output);
});
