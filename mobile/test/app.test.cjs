const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const project = path.resolve(__dirname, '..');
const babel = require("@babel/core");
const React = require("react");
const renderer = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const { act } = renderer;
function compile(file, mocked = {}) {
  const source = babel.transformSync(fs.readFileSync(file, "utf8"), {
    cwd: project, presets: ["babel-preset-expo"],
    plugins: ["@babel/plugin-transform-modules-commonjs"],
    filename: file,
  }).code;
  const module = { exports: {} };
  const req = (id) => (id in mocked ? mocked[id] : require(id));
  vm.runInThisContext("(function(require,module,exports){" + source + "\n})", {
    filename: file,
  })(req, module, module.exports);
  return module.exports;
}
const utils = compile(path.join(project, "store-utils.js"));
const data = {
  settings: { currency: "د.ل", ship: 10, free: 0 },
  locations: { طرابلس: ["المركز"] },
  products: [
    {
      id: "p1",
      name: "حقيبة",
      cat: "اكسسوارات",
      price: 100,
      stock: 4,
      img: "https://example.com/a.png",
    },
  ],
};
const customer = {
  id: "c1",
  name: "عميل",
  phone: "0920000000",
  city: "طرابلس",
  area: "المركز",
  address: "شارع 1",
};
function text(n) {
  return n
    .findAllByType("Text")
    .flatMap((x) => x.children.filter((y) => typeof y === "string"))
    .join(" ");
}
async function setup(handler, saved = {}) {
  const storage = new Map(Object.entries(saved));
  const requests = [];
  global.fetch = async (url, opt = {}) => {
    const route = new URL(url).pathname;
    requests.push({ route, opt });
    return handler(route, opt, requests);
  };
  const native = {};
  for (const name of [
    "ActivityIndicator",
    "Image",
    "KeyboardAvoidingView",
    "Modal",
    "Pressable",
    "RefreshControl",
    "SafeAreaView",
    "ScrollView",
    "StatusBar",
    "Text",
    "TextInput",
    "View",
  ])
    native[name] = name;
  Object.assign(native, {
    Platform: { OS: "android" },
    StyleSheet: { create: (x) => x },
    Alert: { alert() {} },
    AppState: { addEventListener: () => ({ remove() {} }) },
  });
  const App = compile(path.join(project, "App.js"), {
    "react-native": native,
    "@expo/vector-icons/Ionicons": "Icon",
    "expo-navigation-bar": {
      setVisibilityAsync: async () => {},
      setBehaviorAsync: async () => {},
    },
    "./store-utils": utils,
    "./assets/icon.png": 1,
    "@react-native-async-storage/async-storage": {
      getItem: async (k) => storage.get(k) || null,
      setItem: async (k, v) => storage.set(k, v),
      removeItem: async (k) => storage.delete(k),
      multiRemove: async (ks) => ks.forEach((k) => storage.delete(k)),
    },
  }).default;
  let app;
  await act(async () => {
    app = renderer.create(React.createElement(App));
  });
  const press = async (label) => {
    const b = app.root
      .findAllByType("Pressable")
      .find((x) => text(x).includes(label));
    assert.ok(b, "Missing button: " + label);
    await act(async () => {
      await b.props.onPress();
    });
  };
  const input = async (label, value) => {
    await act(async () => {
      app.root
        .findByProps({ accessibilityLabel: label })
        .props.onChangeText(value);
    });
  };
  return {
    app,
    storage,
    requests,
    press,
    input,
    close: async () => act(async () => app.unmount()),
  };
}
const response = (json, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => json,
});
test("shipping, decimal totals, saved data and Arabic search", () => {
  assert.deepEqual(
    utils.basketTotals([{ price: 0.1, q: 3 }], { ship: 0.2, free: 0 }),
    { sub: 0.3, ship: 0.2, total: 0.5 },
  );
  assert.equal(
    utils.basketTotals([{ price: 100, q: 1 }], { ship: 10, free: 100 }).ship,
    0,
  );
  assert.equal(utils.basketTotals([], { ship: 10 }).total, 0);
  assert.deepEqual(utils.decodeList("broken", "cart"), []);
  assert.deepEqual(
    utils.decodeList(
      '[{"id":"p","q":2},{"id":"p","q":30},{"id":"z","q":-1}]',
      "cart",
    ),
    [{ id: "p", q: 20 }],
  );
  assert.equal(utils.normalizeSearch("إكْسِسوارات"), "اكسسوارات");
});
test("network failure preserves cart, retry loads app and every tab", async () => {
  let boot = 0;
  const s = await setup(
    (route) => {
      if (route.endsWith("/bootstrap") && ++boot === 1) throw Error("offline");
      return response(data);
    },
    { "nova.cart": '[{"id":"p1","q":2}]' },
  );
  assert.equal(s.storage.get("nova.cart"), '[{"id":"p1","q":2}]');
  await s.press("إعادة المحاولة");
  for (const tab of ["المنتجات", "السلة", "تتبع", "حسابي", "الرئيسية"])
    await s.press(tab);
  assert.equal(JSON.parse(s.storage.get("nova.cart"))[0].q, 2);
  await s.close();
});
test("HTML response displays recovery screen", async () => {
  const s = await setup(() => ({
    ok: true,
    status: 200,
    json: async () => {
      throw Error("HTML");
    },
  }));
  assert.match(JSON.stringify(s.app.toJSON()), /المتجر يستعد/);
  await s.close();
});
test("login, profile edit and logout do not change hook order; order outage preserves login", async () => {
  let saved = customer;
  const s = await setup((route, opt) => {
    if (route.endsWith("/bootstrap")) return response(data);
    if (route.endsWith("/login"))
      return response({ token: "test-token", customer });
    if (route.endsWith("/orders"))
      return response({ error: "unavailable" }, 503);
    if (route.endsWith("/profile")) {
      saved = { ...customer, ...JSON.parse(opt.body) };
      return response({ customer: saved });
    }
    throw Error(route);
  });
  await s.press("حسابي");
  await s.input("رقم الهاتف", customer.phone);
  await s.input("كلمة المرور", "test-only");
  await s.press("تسجيل الدخول");
  assert.equal(s.storage.get("nova.token"), "test-token");
  await s.press("تعديل بياناتي");
  await s.input("الاسم الكامل", "اسم جديد");
  await s.press("حفظ البيانات");
  assert.equal(saved.name, "اسم جديد");
  await s.press("تسجيل الخروج");
  assert.equal(s.storage.has("nova.token"), false);
  assert.match(JSON.stringify(s.app.toJSON()), /تسجيل الدخول/);
  await s.close();
});
test("checkout prevents double taps and reuses request ID after reconnect and tab changes", async () => {
  const ids = [];
  let rejectFirst;
  const s = await setup((route, opt) => {
    if (route.endsWith("/bootstrap")) return response(data);
    if (route.endsWith("/order")) {
      const payload = JSON.parse(opt.body);
      ids.push(payload.requestId);
      assert.equal(payload.expectedTotal, 110);
      if (ids.length === 1)
        return new Promise((_, reject) => {
          rejectFirst = reject;
        });
      return response({
        order: {
          ...payload,
          id: "ORD-TEST",
          status: "جديد",
          total: 110,
          items: [{ name: "حقيبة", price: 100, q: 1 }],
        },
      });
    }
    throw Error(route);
  });
  await s.press("أضف للسلة");
  await s.press("السلة");
  async function fill() {
    await s.input("الاسم الكامل", "عميل");
    await s.input("رقم الهاتف", "0920000000");
    await s.press("طرابلس");
    await s.press("المركز");
    await s.input("العنوان", "شارع 1");
  }
  await fill();
  const btn = s.app.root
    .findAllByType("Pressable")
    .find((x) => text(x).includes("تأكيد الطلب"));
  await act(async () => {
    btn.props.onPress();
    btn.props.onPress();
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.equal(ids.length, 1);
  await act(async () => {
    rejectFirst(Error("offline"));
  });
  await s.press("المنتجات");
  await s.press("السلة");
  await fill();
  await s.press("تأكيد الطلب");
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(s.storage.has("nova.pendingOrder"), false);
  assert.deepEqual(JSON.parse(s.storage.get("nova.cart")), []);
  await s.close();
});
