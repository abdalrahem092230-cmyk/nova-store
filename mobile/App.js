import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as NavigationBar from "expo-navigation-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { decodeList, normalizeSearch, basketTotals } from "./store-utils";

const brandIcon = require("./assets/icon.png");

const API = (
  process.env.EXPO_PUBLIC_API_URL || "https://nova-store-icxo.onrender.com"
).replace(/\/$/, "");
const C = {
  bg: "#090b0e",
  panel: "#11151a",
  panel2: "#171c22",
  line: "#29313a",
  text: "#f7f8f4",
  muted: "#929aa7",
  lime: "#d8ff45",
  danger: "#ff7886",
};
async function req(path, opt = {}, token = "") {
  const h = { Accept: "application/json", ...(opt.headers || {}) };
  if (opt.body) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const controller = new AbortController(),
    timer = setTimeout(
      () => controller.abort(),
      path.endsWith("/bootstrap") ? 90000 : 30000,
    );
  try {
    const r = await fetch(API + path, {
      ...opt,
      headers: h,
      signal: controller.signal,
    });
    let j;
    try {
      j = await r.json();
    } catch {
      throw Error("المتجر يستعد للاتصال. حاول مرة أخرى بعد قليل.");
    }
    if (!r.ok) {
      const error = Error(j.error || "تعذر تنفيذ الطلب");
      error.status = r.status;
      throw error;
    }
    return j;
  } catch (e) {
    if (e?.name === "AbortError")
      throw Error("الاتصال بالمتجر أخذ وقتًا طويلًا. حاول مرة أخرى.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
const api = {
  boot: async () => {
    const d = await req("/api/mobile/bootstrap");
    if (!d?.settings || !Array.isArray(d.products) || !d.locations)
      throw Error("تعذر تحميل بيانات المتجر. حاول مرة أخرى.");
    return d;
  },
  login: (p, w) =>
    req("/api/mobile/login", {
      method: "POST",
      body: JSON.stringify({ phone: p, password: w }),
    }),
  register: (x) =>
    req("/api/mobile/register", { method: "POST", body: JSON.stringify(x) }),
  me: (t) => req("/api/mobile/me", {}, t),
  orders: (t) => req("/api/mobile/orders", {}, t),
  profile: (x, t) =>
    req("/api/mobile/profile", { method: "PATCH", body: JSON.stringify(x) }, t),
  order: (x, t) =>
    req("/api/mobile/order", { method: "POST", body: JSON.stringify(x) }, t),
  track: (id, p, t) =>
    req(
      "/api/mobile/track?id=" +
        encodeURIComponent(id) +
        "&phone=" +
        encodeURIComponent(p || ""),
      {},
      t,
    ),
};
const money = (n) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(+n || 0);
const dateText = (d) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(d));
function Btn({ children, onPress, hot, disabled, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        hot && s.hot,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.82 },
        style,
      ]}
    >
      <Text style={[s.bt, hot && { color: "#111" }]}>{children}</Text>
    </Pressable>
  );
}
function Input({ label, ltr = false, ...p }) {
  return (
    <View style={{ marginBottom: 11 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        {...p}
        accessibilityLabel={label || p.placeholder}
        placeholderTextColor="#68717d"
        textAlign={ltr ? "left" : "right"}
        style={[s.input, ltr && s.inputLtr, p.style]}
      />
    </View>
  );
}
function Pill({ onPress, active, children }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.pill,
        active && { backgroundColor: C.lime, borderColor: C.lime },
      ]}
    >
      <Text style={[s.pillText, active && { color: "#111" }]}>{children}</Text>
    </Pressable>
  );
}
function Card({ p, currency, fav, onFav, onOpen, onAdd }) {
  return (
    <View style={s.card}>
      <Pressable onPress={() => onOpen(p)}>
        <Image source={{ uri: p.img }} style={s.pic} />
        {p.old > p.price ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>خصم</Text>
          </View>
        ) : null}
      </Pressable>
      <View style={s.cardBody}>
        <View style={s.row}>
          <Text style={s.cat}>{p.cat}</Text>
          <Pressable onPress={() => onFav(p.id)}>
            <Text style={[s.heart, fav && { color: C.lime }]}>♡</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => onOpen(p)}>
          <Text style={s.name} numberOfLines={2}>
            {p.name}
          </Text>
        </Pressable>
        <Text style={s.price}>
          {money(p.price)} {currency}
        </Text>
        <Btn
          hot
          disabled={p.stock <= 0}
          onPress={() => onAdd(p.id)}
          style={{ minHeight: 40, marginTop: 9 }}
        >
          {p.stock > 0 ? "أضف للسلة +" : "غير متوفر"}
        </Btn>
      </View>
    </View>
  );
}
export default function App() {
  const [tab, setTab] = useState("home"),
    [data, setData] = useState(null),
    [cart, setCart] = useState([]),
    [fav, setFav] = useState([]),
    [sel, setSel] = useState(null),
    [q, setQ] = useState(""),
    [cat, setCat] = useState(""),
    [token, setToken] = useState(""),
    [user, setUser] = useState(null),
    [orders, setOrders] = useState([]),
    [loading, setLoading] = useState(true),
    [bootError, setBootError] = useState(""),
    [last, setLast] = useState(null),
    [toast, setToast] = useState(""),
    [refreshing, setRefreshing] = useState(false),
    [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setVisibilityAsync("hidden").catch(() => {});
      NavigationBar.setBehaviorAsync?.("overlay-swipe").catch(() => {});
    }
  }, []);
  const boot = async () => {
    setLoading(true);
    setBootError("");
    try {
      const [c, f, t, b] = await Promise.all([
        AsyncStorage.getItem("nova.cart"),
        AsyncStorage.getItem("nova.fav"),
        AsyncStorage.getItem("nova.token"),
        api.boot(),
      ]);
      setCart(decodeList(c, "cart"));
      setFav(decodeList(f, "favorites"));
      setHydrated(true);
      setData(b);
      if (t) {
        try {
          const m = await api.me(t);
          setToken(t);
          setUser(m.customer);
          try {
            setOrders((await api.orders(t)).orders || []);
          } catch {}
        } catch (e) {
          if (e.status === 401) {
            await AsyncStorage.removeItem("nova.token");
            setToken("");
            setUser(null);
          }
        }
      }
    } catch (e) {
      setBootError(e.message || "تعذر الاتصال بالمتجر");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    boot();
  }, []);
  async function refreshStore(show = true) {
    if (show) setRefreshing(true);
    try {
      const b = await api.boot();
      setData(b);
      if (show) flash("تم تحديث المتجر ✓");
    } catch (e) {
      if (show) flash("تعذر تحديث المتجر");
    } finally {
      if (show) setRefreshing(false);
    }
  }
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshStore(false);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (hydrated)
      AsyncStorage.setItem("nova.cart", JSON.stringify(cart)).catch(() => {});
  }, [cart, hydrated]);
  useEffect(() => {
    if (hydrated)
      AsyncStorage.setItem("nova.fav", JSON.stringify(fav)).catch(() => {});
  }, [fav, hydrated]);
  const products = data?.products || [],
    currency = data?.settings?.currency || "د.ل",
    cats = [...new Set(products.map((x) => x.cat).filter(Boolean))],
    filtered = products.filter(
      (p) =>
        (!cat || p.cat === cat) &&
        (!q ||
          normalizeSearch(`${p.name} ${p.cat} ${p.desc || ""}`).includes(
            normalizeSearch(q),
          )),
    ),
    detailed = cart
      .map((x) => {
        const p = products.find((z) => z.id === x.id);
        return p ? { ...p, q: x.q } : null;
      })
      .filter(Boolean),
    { sub, ship, total } = basketTotals(detailed, data?.settings),
    count = cart.reduce((a, x) => a + x.q, 0);
  const flash = (m) => {
      setToast(m);
      setTimeout(() => setToast(""), 1500);
    },
    add = (id) => {
      const p = products.find((x) => x.id === id);
      if (!p || p.stock <= 0) return;
      setCart((a) =>
        a.some((x) => x.id === id)
          ? a.map((x) =>
              x.id === id ? { ...x, q: Math.min(x.q + 1, p.stock, 20) } : x,
            )
          : [...a, { id, q: 1 }],
      );
      flash("تمت الإضافة للسلة ✓");
    },
    qty = (id, n) =>
      setCart((a) =>
        n <= 0
          ? a.filter((x) => x.id !== id)
          : a.map((x) =>
              x.id === id
                ? {
                    ...x,
                    q: Math.min(
                      n,
                      products.find((p) => p.id === id)?.stock || 1,
                      20,
                    ),
                  }
                : x,
            ),
      ),
    toggle = (id) =>
      setFav((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  async function auth(r) {
    await AsyncStorage.setItem("nova.token", r.token);
    setToken(r.token);
    setUser(r.customer);
    try {
      setOrders((await api.orders(r.token)).orders || []);
    } catch {
      setOrders([]);
    }
  }
  async function reloadOrders() {
    if (token) {
      try {
        const o = await api.orders(token);
        setOrders(o.orders || []);
      } catch {}
    }
  }
  if (loading)
    return (
      <View style={s.load}>
        <StatusBar hidden />
        <ActivityIndicator size="large" color={C.lime} />
        <Text style={s.muted}>جاري فتح NOVA STORE...</Text>
      </View>
    );
  if (bootError || !data)
    return (
      <View style={s.load}>
        <StatusBar hidden />
        <Ionicons name="cloud-offline-outline" size={46} color={C.lime} />
        <Text style={s.errorTitle}>تعذر فتح المتجر</Text>
        <Text style={s.errorCenter}>
          {bootError || "تعذر تحميل بيانات المتجر."}
        </Text>
        <Btn hot onPress={boot} style={{ minWidth: 180 }}>
          إعادة المحاولة
        </Btn>
      </View>
    );
  return (
    <View style={s.safe}>
      <StatusBar hidden />
      <View style={{ flex: 1 }}>
        {tab === "home" ? (
          <ScrollView
            contentContainerStyle={s.pad}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => refreshStore(true)}
                tintColor={C.lime}
                colors={[C.lime]}
              />
            }
          >
            <Head title={data.settings.name} sub="NOVA STORE" />
            <View style={s.hero}>
              <Text style={s.ey}>THE EVERYDAY EDIT</Text>
              <View style={{ marginTop: 9 }}>
                <Text style={s.heroTitle}>أشياء تحبّها.</Text>
                <Text style={s.heroAccent}>كل يوم.</Text>
              </View>
              <Text style={s.desc}>
                {data.settings.tag}. تسوق من التطبيق بنفس منتجات ومخزون الموقع.
              </Text>
              <View style={s.row}>
                <Btn hot onPress={() => setTab("shop")} style={{ flex: 1 }}>
                  اكتشف المجموعة
                </Btn>
                <Btn onPress={() => setTab("track")} style={{ flex: 1 }}>
                  تتبع طلبك
                </Btn>
              </View>
            </View>
            <Title
              t="مختارات نوفا"
              a="كل المنتجات ←"
              on={() => setTab("shop")}
            />
            <View style={s.grid}>
              {products
                .filter((x) => x.stock > 0)
                .slice(0, 4)
                .map((p) => (
                  <Card
                    key={p.id}
                    p={p}
                    currency={currency}
                    fav={fav.includes(p.id)}
                    onFav={toggle}
                    onOpen={setSel}
                    onAdd={add}
                  />
                ))}
            </View>
          </ScrollView>
        ) : null}
        {tab === "shop" ? (
          <ScrollView
            contentContainerStyle={s.pad}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => refreshStore(true)}
                tintColor={C.lime}
                colors={[C.lime]}
              />
            }
          >
            <Head title="المنتجات" sub="THE COLLECTION" />
            <Input value={q} onChangeText={setQ} placeholder="شنو تدور عليه؟" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chips}
            >
              <Pill onPress={() => setCat("")} active={!cat}>
                الكل
              </Pill>
              {cats.map((x) => (
                <Pill key={x} onPress={() => setCat(x)} active={cat === x}>
                  {x}
                </Pill>
              ))}
            </ScrollView>
            <Text style={[s.muted, { marginVertical: 12, textAlign: "right" }]}>
              {filtered.length} منتج
            </Text>
            <View style={s.grid}>
              {filtered.map((p) => (
                <Card
                  key={p.id}
                  p={p}
                  currency={currency}
                  fav={fav.includes(p.id)}
                  onFav={toggle}
                  onOpen={setSel}
                  onAdd={add}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
        {tab === "cart" ? (
          <Cart
            data={data}
            items={detailed}
            sub={sub}
            ship={ship}
            total={total}
            qty={qty}
            token={token}
            user={user}
            setCart={setCart}
            setLast={setLast}
            setTab={setTab}
            reloadOrders={reloadOrders}
            refreshStore={refreshStore}
          />
        ) : null}
        {tab === "track" ? (
          <Track token={token} last={last} user={user} />
        ) : null}
        {tab === "account" ? (
          <Account
            token={token}
            user={user}
            orders={orders}
            currency={currency}
            locations={data.locations || {}}
            onAuth={auth}
            onUserUpdate={setUser}
            onLogout={async () => {
              await AsyncStorage.removeItem("nova.token");
              setToken("");
              setUser(null);
              setOrders([]);
            }}
          />
        ) : null}
      </View>
      <View style={s.tabs}>
        {[
          ["home", "home-outline", "home", "الرئيسية"],
          ["shop", "grid-outline", "grid", "المنتجات"],
          ["cart", "bag-outline", "bag", "السلة"],
          ["track", "location-outline", "location", "تتبع"],
          ["account", "person-outline", "person", "حسابي"],
        ].map(([id, off, on, l]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={[s.tab, tab === id && s.tabActive]}
          >
            <Ionicons
              name={tab === id ? on : off}
              size={27}
              color={tab === id ? C.lime : "#98a1ad"}
            />
            {id === "cart" && count > 0 ? (
              <View style={s.bubble}>
                <Text style={s.bubbleText}>{count}</Text>
              </View>
            ) : null}
            <Text style={[s.tabText, tab === id && { color: C.lime }]}>
              {l}
            </Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={!!sel}
        animationType="slide"
        transparent
        onRequestClose={() => setSel(null)}
      >
        {sel ? (
          <View style={s.modalBg}>
            <SafeAreaView style={s.modal}>
              <ScrollView>
                <View style={s.modalTop}>
                  <Pressable onPress={() => setSel(null)}>
                    <Text style={s.close}>×</Text>
                  </Pressable>
                  <Text style={s.ey}>NOVA STORE</Text>
                </View>
                <Image source={{ uri: sel.img }} style={s.detailPic} />
                <View style={{ padding: 20 }}>
                  <Text style={s.ey}>{sel.cat}</Text>
                  <Text style={s.detailTitle}>{sel.name}</Text>
                  <Text style={s.desc}>
                    {sel.desc || "منتج مختار من نوفا ستور بعناية."}
                  </Text>
                  <Text style={[s.price, { fontSize: 24, marginTop: 12 }]}>
                    {money(sel.price)} {currency}
                  </Text>
                  <Text style={[s.muted, { textAlign: "right", marginTop: 8 }]}>
                    {sel.stock > 0
                      ? "متوفر الآن · " + sel.stock + " قطعة"
                      : "غير متوفر حاليًا"}
                  </Text>
                  <Btn
                    hot
                    disabled={sel.stock <= 0}
                    onPress={() => {
                      add(sel.id);
                      setSel(null);
                    }}
                    style={{ marginTop: 16 }}
                  >
                    أضف للسلة
                  </Btn>
                </View>
              </ScrollView>
            </SafeAreaView>
          </View>
        ) : null}
      </Modal>
      {toast ? (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={20} color="#111" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}
function Head({ title, sub }) {
  return (
    <View style={s.head}>
      <View>
        <Text style={s.sub}>{sub}</Text>
        <Text style={s.headTitle}>{title}</Text>
      </View>
      <Image
        source={brandIcon}
        style={s.logo}
        accessibilityLabel="NOVA STORE"
      />
    </View>
  );
}
function Title({ t, a, on }) {
  return (
    <View style={s.titleRow}>
      <Text style={s.title}>{t}</Text>
      {a ? (
        <Pressable onPress={on}>
          <Text style={s.action}>{a}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
function Cart({
  data,
  items,
  sub,
  ship,
  total,
  qty,
  token,
  user,
  setCart,
  setLast,
  setTab,
  reloadOrders,
  refreshStore,
}) {
  const [f, setF] = useState({
      name: user?.name || "",
      phone: user?.phone || "",
      city: user?.city || "",
      area: user?.area || "",
      address: user?.address || "",
      notes: "",
    }),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    if (user)
      setF((x) => ({
        ...x,
        name: user.name || "",
        phone: user.phone || "",
        city: user.city || "",
        area: user.area || "",
        address: user.address || "",
      }));
  }, [user]);
  const locations = data.locations,
    areas = locations[f.city] || [],
    set = (k, v) =>
      setF((x) => ({ ...x, [k]: v, ...(k === "city" ? { area: "" } : {}) }));
  async function place() {
    if (submitting.current) return;
    setMsg("");
    if (
      !f.name.trim() ||
      !f.phone.trim() ||
      !f.city ||
      !f.area ||
      !f.address.trim()
    ) {
      setMsg("أكمل الاسم والهاتف والمدينة والمنطقة والعنوان قبل تأكيد الطلب.");
      return;
    }
    if (!/^09\d{8}$/.test(f.phone)) {
      setMsg("رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 09.");
      return;
    }
    if (!items.length) {
      setMsg("السلة فارغة.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const payload = {
        ...f,
        items: items.map((x) => ({ id: x.id, q: x.q })),
        expectedTotal: total,
      };
      const signature = JSON.stringify({
        ...payload,
        customer: user?.id || "guest",
      });
      let pending;
      try {
        pending = JSON.parse(await AsyncStorage.getItem("nova.pendingOrder"));
      } catch {}
      const rid =
        pending?.signature === signature
          ? pending.requestId
          : "app-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2);
      await AsyncStorage.setItem(
        "nova.pendingOrder",
        JSON.stringify({ signature, requestId: rid }),
      );
      const r = await api.order({ ...payload, requestId: rid }, token);
      if (!r?.order?.id)
        throw Error("تعذر تأكيد حالة الطلب. أعد المحاولة بنفس البيانات.");
      setCart([]);
      setLast(r.order);
      await AsyncStorage.multiRemove(["nova.pendingOrder"]).catch(() => {});
      await reloadOrders();
      await refreshStore(false);
      Alert.alert("تم استلام طلبك ✓", "رقم الطلب: " + r.order.id, [
        { text: "تتبع الطلب", onPress: () => setTab("track") },
      ]);
      setTab("track");
    } catch (e) {
      setMsg(e.message || "تعذر إرسال الطلب. حاول مرة أخرى.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={s.pad}
        keyboardShouldPersistTaps="handled"
      >
        <Head title="السلة" sub="CHECKOUT" />
        {!items.length ? (
          <View style={s.empty}>
            <Text style={s.bigIcon}>▣</Text>
            <Text style={s.emptyTitle}>السلة فاضية</Text>
            <Btn hot onPress={() => setTab("shop")} style={{ marginTop: 14 }}>
              تصفح المنتجات
            </Btn>
          </View>
        ) : (
          <>
            <View style={s.box}>
              {items.map((x) => (
                <View key={x.id} style={s.cartItem}>
                  <Image source={{ uri: x.img }} style={s.cartPic} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.cartName}>{x.name}</Text>
                    <Text style={s.price}>
                      {money(x.price * x.q)} {data.settings.currency}
                    </Text>
                    <View style={s.qty}>
                      <Pressable
                        onPress={() => qty(x.id, x.q - 1)}
                        style={s.qb}
                      >
                        <Text style={s.qt}>−</Text>
                      </Pressable>
                      <Text style={s.qt}>{x.q}</Text>
                      <Pressable
                        onPress={() => qty(x.id, x.q + 1)}
                        style={s.qb}
                      >
                        <Text style={s.qt}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
            <View style={s.box}>
              <Line a="المجموع" b={money(sub) + " " + data.settings.currency} />
              <Line
                a="الشحن"
                b={ship ? money(ship) + " " + data.settings.currency : "مجاني"}
              />
              <Line
                a="الإجمالي"
                b={money(total) + " " + data.settings.currency}
                strong
              />
            </View>
            <Title t="بيانات التوصيل" />
            <Input
              label="الاسم الكامل"
              value={f.name}
              onChangeText={(v) => set("name", v)}
            />
            <Input
              label="رقم الهاتف"
              keyboardType="phone-pad"
              maxLength={10}
              value={f.phone}
              onChangeText={(v) =>
                set("phone", v.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="0920000000"
            />
            <Text style={s.label}>المدينة</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chips}
            >
              {Object.keys(locations).map((x) => (
                <Pill
                  key={x}
                  onPress={() => set("city", x)}
                  active={f.city === x}
                >
                  {x}
                </Pill>
              ))}
            </ScrollView>
            {f.city ? (
              <>
                <Text style={s.label}>المنطقة</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.chips}
                >
                  {areas.map((x) => (
                    <Pill
                      key={x}
                      onPress={() => set("area", x)}
                      active={f.area === x}
                    >
                      {x}
                    </Pill>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <Input
              label="العنوان"
              value={f.address}
              onChangeText={(v) => set("address", v)}
              placeholder="الشارع ورقم المنزل"
            />
            <Input
              label="ملاحظات"
              value={f.notes}
              onChangeText={(v) => set("notes", v)}
              multiline
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
            {msg ? <Text style={s.error}>{msg}</Text> : null}
            <Btn hot disabled={busy} onPress={place}>
              {busy
                ? "جاري إرسال الطلب..."
                : "تأكيد الطلب · " +
                  money(total) +
                  " " +
                  data.settings.currency}
            </Btn>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
function Line({ a, b, strong }) {
  return (
    <View style={s.line}>
      <Text style={strong ? s.total : s.muted}>{a}</Text>
      <Text style={strong ? s.total : s.lineValue}>{b}</Text>
    </View>
  );
}
function DetailRow({ label, value }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value || "-"}</Text>
    </View>
  );
}
function Track({ token, last, user }) {
  const [id, setId] = useState(last?.id || ""),
    [phone, setPhone] = useState(last?.phone || user?.phone || ""),
    [order, setOrder] = useState(last || null),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (last) {
      setId(last.id);
      setPhone(last.phone || "");
      setOrder(last);
    }
  }, [last]);
  async function go() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api.track(id, phone, token);
      setOrder(r.order);
    } catch (e) {
      setOrder(null);
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Head title="تتبع الطلب" sub="حالة طلبك" />
      <View style={s.box}>
        <Input
          ltr
          label="رقم الطلب"
          value={id}
          onChangeText={setId}
          autoCapitalize="characters"
          placeholder="ORD-..."
        />
        <Input
          ltr
          label="رقم الهاتف"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="0920000000"
        />
        {msg ? <Text style={s.error}>{msg}</Text> : null}
        <Btn hot onPress={go} disabled={busy}>
          {busy ? "جاري البحث..." : "تتبع الطلب"}
        </Btn>
      </View>
      {order ? (
        <View style={s.box}>
          <View style={s.row}>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.orderCode}>{order.id}</Text>
              <Text style={s.orderStatus}>{order.status}</Text>
            </View>
            <Text style={s.price}>{money(order.total)} د.ل</Text>
          </View>
          <View style={s.orderDetails}>
            <DetailRow label="المدينة" value={order.city} />
            <DetailRow label="المنطقة" value={order.area} />
            <DetailRow label="العنوان" value={order.address} />
          </View>
          <View style={s.itemsBlock}>
            {order.items.map((x, i) => (
              <View key={i} style={s.orderItem}>
                <View style={s.orderItemInfo}>
                  <Text style={s.itemName}>{x.name}</Text>
                  <Text style={s.itemQty}>الكمية: {String(x.q)}</Text>
                </View>
                <Text style={s.itemPrice}>{money(x.price * x.q)} د.ل</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
function Account(props) {
  return props.token && props.user ? (
    <AccountProfile {...props} />
  ) : (
    <Auth onAuth={props.onAuth} />
  );
}
function AccountProfile({
  token,
  user,
  orders,
  currency,
  locations,
  onAuth,
  onUserUpdate,
  onLogout,
}) {
  const [f, setF] = useState({
      name: user.name || "",
      phone: user.phone || "",
      email: user.email || "",
      city: user.city || "",
      area: user.area || "",
      address: user.address || "",
    }),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  useEffect(() => {
    setF({
      name: user.name || "",
      phone: user.phone || "",
      email: user.email || "",
      city: user.city || "",
      area: user.area || "",
      address: user.address || "",
    });
  }, [user]);
  const set = (k, v) =>
      setF((x) => ({ ...x, [k]: v, ...(k === "city" ? { area: "" } : {}) })),
    areas = locations[f.city] || [];
  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api.profile(f, token);
      onUserUpdate(r.customer);
      setEditing(false);
      setMsg("تم حفظ بياناتك ✓");
    } catch (e) {
      setMsg(e.message || "تعذر حفظ البيانات");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Head title="حسابي" sub="الملف الشخصي" />
      <View style={s.hero}>
        <Text style={s.heroTitle}>
          مرحبًا،{"\n"}
          <Text style={{ color: C.lime }}>{user.name}</Text>
        </Text>
        <Text style={s.phoneText}>{user.phone}</Text>
        <Btn onPress={() => setEditing((x) => !x)} style={{ marginTop: 4 }}>
          {editing ? "إلغاء التعديل" : "تعديل بياناتي"}
        </Btn>
      </View>
      {editing ? (
        <View style={[s.box, { marginTop: 14 }]}>
          <Input
            label="الاسم الكامل"
            value={f.name}
            onChangeText={(v) => set("name", v)}
          />
          <Input
            ltr
            label="رقم الهاتف"
            value={f.phone}
            onChangeText={(v) =>
              set("phone", v.replace(/\D/g, "").slice(0, 10))
            }
            keyboardType="phone-pad"
          />
          <Input
            ltr
            label="البريد الإلكتروني"
            value={f.email}
            onChangeText={(v) => set("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={s.label}>المدينة</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips}
          >
            {Object.keys(locations).map((x) => (
              <Pill
                key={x}
                onPress={() => set("city", x)}
                active={f.city === x}
              >
                {x}
              </Pill>
            ))}
          </ScrollView>
          {f.city ? (
            <>
              <Text style={s.label}>المنطقة</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chips}
              >
                {areas.map((x) => (
                  <Pill
                    key={x}
                    onPress={() => set("area", x)}
                    active={f.area === x}
                  >
                    {x}
                  </Pill>
                ))}
              </ScrollView>
            </>
          ) : null}
          <Input
            label="العنوان"
            value={f.address}
            onChangeText={(v) => set("address", v)}
          />
          {msg ? (
            <Text style={msg.includes("✓") ? s.ok : s.error}>{msg}</Text>
          ) : null}
          <Btn hot disabled={busy} onPress={save}>
            {busy ? "جاري الحفظ..." : "حفظ البيانات"}
          </Btn>
        </View>
      ) : msg ? (
        <Text style={s.ok}>{msg}</Text>
      ) : null}
      <Title t="طلباتي" />
      {orders.length ? (
        orders.map((o) => (
          <View key={o.id} style={s.box}>
            <View style={s.row}>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.orderCode}>{o.id}</Text>
                <Text style={s.muted}>{dateText(o.created)}</Text>
              </View>
              <Text style={s.price}>{o.status}</Text>
            </View>
            <Line
              a={(o.items || []).reduce((a, x) => a + x.q, 0) + " قطعة"}
              b={money(o.total) + " " + currency}
            />
          </View>
        ))
      ) : (
        <View style={s.empty}>
          <Text style={s.muted}>ما عندكش طلبات مرتبطة بالحساب حتى الآن.</Text>
        </View>
      )}
      <Btn onPress={onLogout} style={{ marginTop: 14 }}>
        تسجيل الخروج
      </Btn>
    </ScrollView>
  );
}
function Auth({ onAuth }) {
  const [mode, setMode] = useState("login"),
    [f, setF] = useState({ name: "", email: "", phone: "", password: "" }),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false),
    set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function go() {
    setBusy(true);
    setMsg("");
    try {
      const r =
        mode === "login"
          ? await api.login(f.phone, f.password)
          : await api.register(f);
      await onAuth(r);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={s.authPad}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={brandIcon}
          style={s.logo}
          accessibilityLabel="NOVA STORE"
        />
        <Text style={[s.ey, { marginTop: 18 }]}>حساب نوفا</Text>
        <Text style={s.heroTitle}>
          {mode === "login" ? "مرحبًا برجوعك." : "حسابك يبدأ هنا."}
        </Text>
        <View style={s.box}>
          {mode === "register" ? (
            <>
              <Input
                label="الاسم الكامل"
                value={f.name}
                onChangeText={(v) => set("name", v)}
              />
              <Input
                ltr
                label="البريد الإلكتروني"
                value={f.email}
                onChangeText={(v) => set("email", v)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </>
          ) : null}
          <Input
            ltr
            label="رقم الهاتف"
            value={f.phone}
            onChangeText={(v) =>
              set("phone", v.replace(/\D/g, "").slice(0, 10))
            }
            keyboardType="phone-pad"
            placeholder="0920000000"
          />
          <Input
            label="كلمة المرور"
            value={f.password}
            onChangeText={(v) => set("password", v)}
            secureTextEntry
          />
          {msg ? <Text style={s.error}>{msg}</Text> : null}
          <Btn hot disabled={busy} onPress={go}>
            {busy
              ? "لحظة..."
              : mode === "login"
                ? "تسجيل الدخول"
                : "إنشاء الحساب"}
          </Btn>
          <Pressable
            onPress={() => setMode(mode === "login" ? "register" : "login")}
          >
            <Text style={s.switch}>
              {mode === "login"
                ? "ما عندكش حساب؟ إنشاء حساب"
                : "عندك حساب؟ تسجيل الدخول"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: Platform.OS === "android" ? 16 : 0,
  },
  pad: { padding: 16, paddingBottom: 128 },
  authPad: { padding: 22, paddingTop: 34, paddingBottom: 128 },
  load: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  head: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sub: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "right",
    writingDirection: "ltr",
  },
  headTitle: {
    color: C.text,
    fontSize: 23,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 3,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#111", fontSize: 23, fontWeight: "900" },
  hero: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 26,
    padding: 22,
  },
  ey: {
    color: C.lime,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "right",
  },
  heroTitle: {
    color: C.text,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: "900",
    textAlign: "right",
    writingDirection: "rtl",
  },
  heroAccent: {
    color: C.lime,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: "900",
    textAlign: "right",
    writingDirection: "rtl",
  },
  desc: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 23,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 8,
    marginBottom: 16,
  },
  row: {
    flexDirection: "row-reverse",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 28,
    marginBottom: 14,
  },
  title: { color: C.text, fontSize: 25, fontWeight: "900" },
  action: { color: C.lime, fontSize: 11, fontWeight: "800" },
  grid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 9,
  },
  card: {
    width: "48.5%",
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 19,
    overflow: "hidden",
    marginBottom: 3,
  },
  pic: { width: "100%", aspectRatio: 0.93, backgroundColor: C.panel2 },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: C.lime,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 50,
  },
  badgeText: { color: "#111", fontSize: 9, fontWeight: "900" },
  cardBody: { padding: 10 },
  cat: { color: C.muted, fontSize: 9 },
  heart: { color: C.muted, fontSize: 23 },
  name: {
    color: C.text,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 42,
    fontWeight: "800",
    textAlign: "right",
    writingDirection: "rtl",
  },
  price: { color: C.text, fontSize: 15, fontWeight: "900", textAlign: "right" },
  btn: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#343c46",
    backgroundColor: C.panel2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  hot: { backgroundColor: C.lime, borderColor: C.lime },
  bt: { color: C.text, fontSize: 13, fontWeight: "900" },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#303843",
    backgroundColor: "#0e1216",
    color: C.text,
    paddingHorizontal: 13,
    writingDirection: "rtl",
  },
  inputLtr: { writingDirection: "ltr" },
  label: {
    color: "#d7dbe0",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 6,
  },
  chips: { flexDirection: "row-reverse", gap: 7, paddingVertical: 5 },
  pill: {
    borderWidth: 1,
    borderColor: "#303843",
    borderRadius: 50,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "#11161c",
  },
  pillText: { color: "#b3bac4", fontSize: 11, fontWeight: "800" },
  muted: { color: C.muted },
  box: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 19,
    padding: 14,
    marginBottom: 11,
  },
  cartItem: {
    flexDirection: "row-reverse",
    gap: 11,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  cartPic: { width: 82, height: 88, borderRadius: 13 },
  cartName: {
    color: C.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 7,
  },
  qty: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  qb: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel2,
    alignItems: "center",
    justifyContent: "center",
  },
  qt: { color: C.text, fontWeight: "800" },
  line: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  lineValue: { color: C.text, fontWeight: "800" },
  total: { color: C.lime, fontSize: 17, fontWeight: "900" },
  empty: {
    minHeight: 250,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  bigIcon: { fontSize: 38, color: C.lime },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: "900", marginTop: 8 },
  error: {
    color: C.danger,
    textAlign: "right",
    marginVertical: 8,
    fontWeight: "800",
  },
  ok: {
    color: C.lime,
    textAlign: "right",
    marginVertical: 8,
    fontWeight: "800",
  },
  orderStatus: {
    color: C.text,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "right",
    writingDirection: "rtl",
  },
  orderDetails: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 8,
  },
  detailRow: { paddingVertical: 7 },
  detailLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 3,
  },
  detailValue: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },
  itemsBlock: { marginTop: 8, borderTopWidth: 1, borderTopColor: C.line },
  orderItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  orderItemInfo: { flex: 1, alignItems: "flex-end" },
  itemName: {
    color: C.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },
  itemQty: { color: C.muted, fontSize: 11, marginTop: 4, textAlign: "right" },
  itemPrice: {
    color: C.text,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "left",
    writingDirection: "ltr",
  },
  orderCode: {
    color: C.lime,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textAlign: "left",
    writingDirection: "ltr",
  },
  phoneText: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 22,
    textAlign: "left",
    writingDirection: "ltr",
    marginTop: 8,
    marginBottom: 16,
  },
  switch: {
    color: C.lime,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 16,
  },
  tabs: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 8,
    height: 82,
    backgroundColor: "#101419f5",
    borderWidth: 1,
    borderColor: "#2b333d",
    borderRadius: 22,
    flexDirection: "row-reverse",
    padding: 5,
  },
  tab: {
    flex: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabActive: { backgroundColor: "#19200f" },
  tabText: {
    color: "#8f98a4",
    fontSize: 10.5,
    fontWeight: "900",
    marginTop: 1,
  },
  bubble: {
    position: "absolute",
    top: 5,
    left: "56%",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleText: { color: "#111", fontSize: 8, fontWeight: "900" },
  toast: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 104,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: C.lime,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  toastText: {
    color: "#111",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  errorTitle: { color: C.text, fontSize: 22, fontWeight: "900", marginTop: 8 },
  errorCenter: {
    color: C.muted,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 290,
    marginBottom: 8,
  },
  modalBg: { flex: 1, backgroundColor: "#000a", justifyContent: "flex-end" },
  modal: {
    height: "91%",
    backgroundColor: C.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
  },
  modalTop: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  close: { color: C.text, fontSize: 28 },
  detailPic: { width: "100%", aspectRatio: 1.05 },
  detailTitle: {
    color: C.text,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 8,
  },
});
