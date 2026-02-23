/*
Developer Notes:
1) لإظهار "وصل حديثاً" أضف عمود new_arrival في Sheet المنتجات (قيم مقبولة: نعم/Yes/true/1).
2) لإظهار "جميع/أشهر الماركات" المميزة أضف عمود featured في Sheet الماركات (نعم/Yes/true/1).
3) تغيير رقم واتساب/الشحن يتم من Settings: keys مثل whatsapp_number و shipping و write_orders.
4) إضافة أي قسم رئيسي جديد تعمل تلقائيًا: فقط أضفه في MainCategories مع enabled=true، وستظهر صفحة القسم عبر نفس الـ routing.
*/

const { APPS_SCRIPT_BASE_URL, DEFAULT_CATEGORY, FALLBACK_SETTINGS, CACHE_TTL_MS, AUTH_HOOK_URL } = window.APP_CONFIG;

const state = {
  currentView: "home",
  currentCategory: "",
  selectedSubcategory: "",
  selectedBrand: "",
  searchQuery: "",
  users: JSON.parse(localStorage.getItem("msdr_users") || "[]"),
  currentUser: JSON.parse(localStorage.getItem("msdr_current_user") || "null"),
  cart: [],
  data: { products: [], brands: [], mainCategories: [], subCategories: [], banners: [], settings: {} },
  heroIndex: 0
};

const memoryCache = new Map();
const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'><rect width='100%' height='100%' fill='#edf2f1'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#7d8a89' font-size='28' font-family='Arial'>صورة غير متوفرة</text></svg>`);

const $ = (id) => document.getElementById(id);
const isTruthy = (v) => ["1", "true", "yes", "نعم", "enabled"].includes(String(v || "").trim().toLowerCase());
const asNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const formatMoney = (n) => `${asNum(n).toLocaleString("ar-EG")} ${state.data.settings.currency || FALLBACK_SETTINGS.currency}`;
const sortBy = (arr) => [...arr].sort((a, b) => asNum(a.sort, 9999) - asNum(b.sort, 9999));
const parseImages = (s) => String(s || "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const safeImage = (url) => (url && /^https?:\/\//i.test(url) ? url : PLACEHOLDER_IMAGE);

function fetchJsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `jsonp_cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[cb];
      script.remove();
    };
    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };
    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${cb}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("فشل تحميل البيانات عبر JSONP"));
    };
    document.body.appendChild(script);
  });
}

async function getCached(action) {
  if (memoryCache.has(action)) return memoryCache.get(action);
  const localKey = `msdr_cache_${action}`;
  const fromLocal = JSON.parse(localStorage.getItem(localKey) || "null");
  if (fromLocal && Date.now() - fromLocal.ts < CACHE_TTL_MS) {
    memoryCache.set(action, fromLocal.data);
    return fromLocal.data;
  }
  const response = await fetchJsonp(`${APPS_SCRIPT_BASE_URL}?action=${encodeURIComponent(action)}`);
  const data = Array.isArray(response) ? response : response?.data || response?.items || [];
  memoryCache.set(action, data);
  localStorage.setItem(localKey, JSON.stringify({ ts: Date.now(), data }));
  return data;
}

async function loadData() {
  const [products, brands, mainCategories, subCategories, banners, settingsRows] = await Promise.all([
    getCached("products"),
    getCached("brands"),
    getCached("main_categories"),
    getCached("sub_categories"),
    getCached("banners"),
    getCached("settings")
  ]);

  const settings = { ...FALLBACK_SETTINGS };
  settingsRows.forEach((row) => {
    if (row.key) settings[String(row.key).trim()] = String(row.value ?? "").trim();
  });

  state.data = {
    products: products.map((p, idx) => ({
      id: p.id || p.code || `${p.name || "p"}-${idx}`,
      name: p.name || "منتج",
      main_category_name: p.main_category_name || "",
      sub_category_name: p.sub_category_name || "",
      brand_name: p.brand_name || "",
      image: safeImage(parseImages(p.image_urls)[0]),
      price: asNum(p.price),
      sale_price: asNum(p.sale_price),
      stock_qty: asNum(p.stock_qty, 0),
      available: isTruthy(p.available),
      sort: p.sort,
      new_arrival: isTruthy(p.new_arrival),
      description: p.description || ""
    })),
    brands: brands.map((b) => ({ ...b, enabled: isTruthy(b.enabled), featured: "featured" in b ? isTruthy(b.featured) : null })),
    mainCategories: sortBy(mainCategories.filter((c) => isTruthy(c.enabled))),
    subCategories: sortBy(subCategories.filter((s) => isTruthy(s.enabled))),
    banners: sortBy(banners.filter((b) => isTruthy(b.enabled))),
    settings
  };
}

function updateRoute(params = {}) {
  const search = new URLSearchParams();
  search.set("view", params.view || state.currentView || "home");
  if (params.cat || state.currentCategory) search.set("cat", params.cat ?? state.currentCategory);
  if (params.sub || state.selectedSubcategory) search.set("sub", params.sub ?? state.selectedSubcategory);
  if (params.brand || state.selectedBrand) search.set("brand", params.brand ?? state.selectedBrand);
  if (params.q || state.searchQuery) search.set("q", params.q ?? state.searchQuery);
  history.pushState({}, "", `?${search.toString()}`);
  syncStateFromRoute();
  render();
}

function syncStateFromRoute() {
  const p = new URLSearchParams(location.search);
  state.currentView = p.get("view") || "home";
  state.currentCategory = p.get("cat") || "";
  state.selectedSubcategory = p.get("sub") || "";
  state.selectedBrand = p.get("brand") || "";
  state.searchQuery = p.get("q") || "";
}

function renderHeaderCategories() {
  const nav = $("headerCategoryNav");
  nav.innerHTML = "";
  state.data.mainCategories.forEach((cat) => {
    const a = document.createElement("a");
    a.href = `?view=category&cat=${encodeURIComponent(cat.main_category_name)}`;
    a.className = `pill ${state.currentCategory === cat.main_category_name ? "active" : ""}`;
    a.textContent = cat.main_category_name;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      updateRoute({ view: "category", cat: cat.main_category_name, sub: "", brand: "", q: "" });
    });
    nav.appendChild(a);
  });
}

function featuredBrands(sourceBrands) {
  const hasFeatured = sourceBrands.some((b) => b.featured !== null);
  return (hasFeatured ? sourceBrands.filter((b) => b.featured) : sourceBrands.filter((b) => b.enabled));
}

function productCard(p) {
  const inStock = p.available && p.stock_qty > 0;
  return `<article class="card product-card">
    <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'" />
    <h3>${p.name}</h3>
    <p>${p.brand_name || ""}</p>
    <p>${p.sale_price > 0 ? `<span class='price'>${formatMoney(p.sale_price)}</span><span class='old-price'>${formatMoney(p.price)}</span>` : `<span class='price'>${formatMoney(p.price)}</span>`}</p>
    ${!inStock ? `<p class="badge-unavailable">غير متاح</p>` : ""}
    <button class="btn add-cart" data-id="${p.id}" ${inStock ? "" : "disabled"}>أضف للسلة</button>
  </article>`;
}

function emptyState(message) {
  return `<div class="empty-state">${message}<br><a class="pill" href="?view=home" onclick="event.preventDefault();window.__goHome()">العودة للرئيسية</a></div>`;
}

function renderHome() {
  const { mainCategories, products, banners, brands } = state.data;
  const homeView = $("homeView");
  homeView.classList.remove("hidden");

  const heroSlides = $("heroSlides");
  const heroDots = $("heroDots");
  const heroItems = banners.length ? banners : [{ title: "المصدر", image_url: PLACEHOLDER_IMAGE }];
  const current = heroItems[state.heroIndex % heroItems.length];
  heroSlides.innerHTML = `<article class="hero-slide">
    <img src="${safeImage(current.image_url)}" alt="${current.title || "بانر"}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'" />
    <div>
      <h1>${current.title || "مرحبًا بك في المصدر"}</h1>
      <p>أفضل المنتجات والماركات في مكان واحد.</p>
      <button class="btn" id="heroCta">تسوق الآن</button>
    </div>
  </article>`;
  $("heroCta").onclick = () => handleBannerNavigation(current);
  heroDots.innerHTML = heroItems.map((_, i) => `<button class='${i === state.heroIndex % heroItems.length ? "active" : ""}' aria-label='بنر ${i + 1}' data-idx='${i}'></button>`).join("");
  heroDots.querySelectorAll("button").forEach((d) => d.addEventListener("click", () => {
    state.heroIndex = Number(d.dataset.idx);
    renderHome();
  }));

  $("homeCategories").innerHTML = mainCategories.map((c) => `<article class="card category-card"><img src="${safeImage(c.image_url)}" alt="${c.main_category_name}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'" /><h3>${c.main_category_name}</h3><a class="pill" href="?view=category&cat=${encodeURIComponent(c.main_category_name)}" data-cat="${c.main_category_name}">تصفح القسم</a></article>`).join("");
  $("homeCategories").querySelectorAll("a[data-cat]").forEach((a) => a.onclick = (e) => {
    e.preventDefault();
    updateRoute({ view: "category", cat: a.dataset.cat, sub: "", brand: "", q: "" });
  });

  const showBrands = featuredBrands(brands);
  $("homeFeaturedBrands").innerHTML = showBrands.length
    ? showBrands.map((b) => `<article class='card brand-card'><img src='${safeImage(b.logo_url)}' alt='${b.brand_name}' loading='lazy' onerror="this.src='${PLACEHOLDER_IMAGE}'" /><h3>${b.brand_name || "ماركة"}</h3><button class='pill brand-go' data-brand='${b.brand_name || ""}'>عرض المنتجات</button></article>`).join("")
    : emptyState("لا توجد ماركات مميزة حالياً.");
  $("homeFeaturedBrands").querySelectorAll(".brand-go").forEach((btn) => btn.onclick = () => gotoBrand(btn.dataset.brand));

  bindAddToCart();
}

function getCategoryBrands(catName) {
  const { brands, products } = state.data;
  const featured = featuredBrands(brands);
  return featured.filter((b) => {
    if (b.main_category_name) return b.main_category_name === catName;
    return products.some((p) => p.main_category_name === catName && p.brand_name === b.brand_name);
  });
}

function renderCategory() {
  const { products, subCategories, banners } = state.data;
  const cat = state.currentCategory || DEFAULT_CATEGORY;
  const categoryProducts = products.filter((p) => p.main_category_name === cat);
  const filtered = categoryProducts.filter((p) => (!state.selectedSubcategory || p.sub_category_name === state.selectedSubcategory) && (!state.selectedBrand || p.brand_name === state.selectedBrand));

  const catBanner = banners.find((b) => b.main_category_name === cat && !b.sub_category_name && !b.brand_name)
    || banners.find((b) => b.main_category_name === cat)
    || banners[0]
    || { title: cat, image_url: PLACEHOLDER_IMAGE };

  $("categoryBanner").innerHTML = `<img src="${safeImage(catBanner.image_url)}" alt="${catBanner.title || cat}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'" />
  <div class="overlay">
    <h1>${cat}</h1>
    ${state.selectedBrand ? `<p><strong>${state.selectedBrand}</strong></p>` : ""}
    <button class="btn btn-secondary" id="backHomeBtn">العودة للرئيسية</button>
  </div>`;
  $("backHomeBtn").onclick = () => updateRoute({ view: "home", cat: "", sub: "", brand: "", q: "" });

  const subs = subCategories.filter((s) => s.main_category_name === cat);
  $("subcategoryCards").innerHTML = [`<button class='card subcategory-card ${!state.selectedSubcategory ? "active" : ""}' data-sub=''>
    <img src='${PLACEHOLDER_IMAGE}' alt='كل الأقسام الفرعية' loading='lazy' />
    <h3>الكل</h3>
  </button>`, ...subs.map((s) => {
    const img = s.image_url || s.image || "";
    return `<button class='card subcategory-card ${state.selectedSubcategory === s.sub_category_name ? "active" : ""}' data-sub='${s.sub_category_name}'>
      <img src='${safeImage(img)}' alt='${s.sub_category_name}' loading='lazy' onerror="this.src='${PLACEHOLDER_IMAGE}'" />
      <h3>${s.sub_category_name}</h3>
    </button>`;
  })].join("");
  $("subcategoryCards").querySelectorAll("button[data-sub]").forEach((b) => b.onclick = () => updateRoute({ view: "category", cat, sub: b.dataset.sub, brand: "", q: "" }));

  const catBrands = getCategoryBrands(cat);
  $("categoryBrands").innerHTML = catBrands.length
    ? catBrands.map((b) => `<article class='card brand-card'><img src='${safeImage(b.logo_url)}' alt='${b.brand_name}' loading='lazy' onerror="this.src='${PLACEHOLDER_IMAGE}'" /><h3>${b.brand_name}</h3><button class='pill ${state.selectedBrand === b.brand_name ? "active" : ""}' data-brand='${b.brand_name}'>تصفية</button></article>`).join("")
    : emptyState("لا توجد ماركات مميزة لهذا القسم.");
  $("categoryBrands").querySelectorAll("button[data-brand]").forEach((b) => b.onclick = () => updateRoute({ view: "category", cat, sub: state.selectedSubcategory, brand: b.dataset.brand, q: "" }));

  const activeBrand = state.selectedBrand
    ? `<div class="active-brand-filter"><span>الفلتر الحالي: <strong>${state.selectedBrand}</strong></span><button class="text-link" type="button" id="clearBrandFilterBtn">مسح فلتر الماركة</button></div>`
    : "";

  $("categoryProducts").innerHTML = `${activeBrand}${filtered.length ? filtered.map(productCard).join("") : emptyState("لا توجد منتجات مطابقة للفلتر الحالي.")}`;
  if (state.selectedBrand) {
    $("clearBrandFilterBtn").onclick = () => updateRoute({ view: "category", cat, sub: state.selectedSubcategory, brand: "", q: "" });
  }

  bindAddToCart();
}

function renderSearch() {
  const q = state.searchQuery.trim().toLowerCase();
  const view = $("searchView");
  if (!q) {
    view.classList.add("hidden");
    return;
  }
  view.classList.remove("hidden");
  const hits = state.data.products.filter((p) => [p.name, p.brand_name, p.main_category_name, p.sub_category_name, p.description].join(" ").toLowerCase().includes(q));
  $("searchResults").innerHTML = hits.length ? hits.map(productCard).join("") : emptyState("لا توجد نتائج بحث مطابقة.");
  bindAddToCart();
}

function handleBannerNavigation(b) {
  if (b.brand_name && b.main_category_name) return updateRoute({ view: "category", cat: b.main_category_name, brand: b.brand_name, sub: "", q: "" });
  if (b.sub_category_name && b.main_category_name) return updateRoute({ view: "category", cat: b.main_category_name, sub: b.sub_category_name, brand: "", q: "" });
  if (b.main_category_name) return updateRoute({ view: "category", cat: b.main_category_name, sub: "", brand: "", q: "" });
}

function gotoBrand(brandName) {
  const cat = state.currentCategory || state.data.products.find((p) => p.brand_name === brandName)?.main_category_name || DEFAULT_CATEGORY;
  updateRoute({ view: "category", cat, brand: brandName, sub: "", q: "" });
}

function getUserId(user = state.currentUser) {
  return user ? normalizePhone(user.phone) : "";
}

function getCartStorageKey(user = state.currentUser) {
  const userId = getUserId(user);
  return userId ? `msdr_cart_user_${userId}` : "msdr_cart_guest";
}

function loadCart(user = state.currentUser) {
  const key = getCartStorageKey(user);
  const fromKey = JSON.parse(localStorage.getItem(key) || "null");
  if (Array.isArray(fromKey)) return fromKey;
  if (key === "msdr_cart_guest") return JSON.parse(localStorage.getItem("msdr_cart") || "[]");
  return [];
}

function mergeCartItems(...carts) {
  const map = new Map();
  carts.flat().forEach((item) => {
    if (!item?.id) return;
    const found = map.get(item.id);
    if (found) found.qty += asNum(item.qty, 1);
    else map.set(item.id, { ...item, qty: Math.max(1, asNum(item.qty, 1)) });
  });
  return [...map.values()];
}

function applyCartAfterLogin(user) {
  const guestCart = loadCart(null);
  const userCart = loadCart(user);
  const merged = mergeCartItems(userCart, guestCart);
  localStorage.removeItem("msdr_cart_guest");
  localStorage.setItem(getCartStorageKey(user), JSON.stringify(merged));
  state.cart = merged;
}

function getOrdersStorageKey(user = state.currentUser) {
  const userId = getUserId(user);
  return userId ? `msdr_orders_user_${userId}` : "";
}

function getUserOrders(user = state.currentUser) {
  const key = getOrdersStorageKey(user);
  if (!key) return [];
  return JSON.parse(localStorage.getItem(key) || "[]");
}

function saveUserOrders(orders, user = state.currentUser) {
  const key = getOrdersStorageKey(user);
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(orders));
}

function saveOrderLocally(customer, result = {}) {
  if (!state.currentUser) return;
  const subtotal = state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shipping = asNum(state.data.settings.shipping || FALLBACK_SETTINGS.shipping);
  const total = subtotal + shipping;
  const orders = getUserOrders();
  orders.push({
    order_id: result?.order_id || `local_${Date.now()}`,
    created_at: Date.now(),
    customer_name: customer.customer_name,
    phone: customer.phone,
    area: customer.area,
    address: customer.address,
    notes: customer.notes || "",
    items: state.cart.map((i) => ({ ...i })),
    subtotal,
    shipping,
    total,
    status: "saved"
  });
  saveUserOrders(orders);
}

function bindAddToCart() {
  document.querySelectorAll(".add-cart").forEach((btn) => btn.onclick = () => {
    const p = state.data.products.find((x) => x.id === btn.dataset.id);
    if (!p) return;
    const found = state.cart.find((x) => x.id === p.id);
    if (found) found.qty += 1;
    else state.cart.push({ id: p.id, name: p.name, price: p.sale_price > 0 ? p.sale_price : p.price, image: p.image, qty: 1 });
    saveCart();
    renderCart();
    showToast(found ? "تمت زيادة الكمية في السلة" : "تمت إضافة المنتج إلى السلة");
  });
}

function showToast(message, type = "success") {
  let toast = $("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.remove("show", "success", "error");
  toast.classList.add(type);
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function saveCart() {
  localStorage.setItem(getCartStorageKey(), JSON.stringify(state.cart));
}

function renderCart() {
  $("cartCount").textContent = String(state.cart.reduce((s, i) => s + i.qty, 0));
  $("cartItems").innerHTML = state.cart.length ? state.cart.map((i) => `<article class='cart-item'>
    <img src='${i.image}' alt='${i.name}' onerror="this.src='${PLACEHOLDER_IMAGE}'" />
    <div><strong>${i.name}</strong><br><small>${formatMoney(i.price)}</small></div>
    <div>
      <div class='qty-controls'>
        <button data-op='plus' data-id='${i.id}'>+</button><span>${i.qty}</span><button data-op='minus' data-id='${i.id}'>-</button>
      </div>
      <button class='text-link' data-op='remove' data-id='${i.id}'>حذف</button>
    </div>
  </article>`).join("") : `<p class='empty-state'>السلة فارغة.</p>`;

  $("cartItems").querySelectorAll("button[data-op]").forEach((b) => b.onclick = () => {
    const item = state.cart.find((x) => x.id === b.dataset.id);
    if (!item) return;
    if (b.dataset.op === "plus") item.qty += 1;
    if (b.dataset.op === "minus") item.qty = Math.max(1, item.qty - 1);
    if (b.dataset.op === "remove") state.cart = state.cart.filter((x) => x.id !== b.dataset.id);
    saveCart();
    renderCart();
  });

  const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = asNum(state.data.settings.shipping || FALLBACK_SETTINGS.shipping);
  const total = subtotal + shipping;
  $("subtotalValue").textContent = formatMoney(subtotal);
  $("shippingValue").textContent = formatMoney(shipping);
  $("totalValue").textContent = formatMoney(total);
}

function getCustomerFormData() {
  prefillCheckoutFromUser();
  const form = $("checkoutForm");
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  const required = ["customer_name", "phone", "area", "address"];
  const missing = required.filter((k) => !String(data[k] || "").trim());
  if (missing.length) {
    $("formErrors").textContent = "يرجى تعبئة الحقول المطلوبة: الاسم، الهاتف، المنطقة، العنوان.";
    return null;
  }
  $("formErrors").textContent = "";
  return data;
}

function buildWhatsappMessage(customer) {
  const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = asNum(state.data.settings.shipping || FALLBACK_SETTINGS.shipping);
  const total = subtotal + shipping;
  const context = [state.currentCategory ? `القسم: ${state.currentCategory}` : "", state.selectedBrand ? `الماركة: ${state.selectedBrand}` : "", state.selectedSubcategory ? `القسم الفرعي: ${state.selectedSubcategory}` : ""].filter(Boolean).join(" | ");
  const lines = state.cart.map((i, idx) => `${idx + 1}) ${i.name} - الكمية: ${i.qty} - سعر الوحدة: ${formatMoney(i.price)} - الإجمالي: ${formatMoney(i.price * i.qty)}`);
  return [`طلب جديد من موقع المصدر`, context, `الاسم: ${customer.customer_name}`, `الهاتف: ${customer.phone}`, `المنطقة: ${customer.area}`, `العنوان: ${customer.address}`, customer.notes ? `ملاحظات: ${customer.notes}` : "", "", "المنتجات:", ...lines, "", `المجموع الفرعي: ${formatMoney(subtotal)}`, `الشحن: ${formatMoney(shipping)}`, `الإجمالي: ${formatMoney(total)}`].filter(Boolean).join("\n");
}

async function postOrder(customer) {
  const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = asNum(state.data.settings.shipping || FALLBACK_SETTINGS.shipping);
  const total = subtotal + shipping;
  const payload = {
    action: "order",
    ...customer,
    items: state.cart,
    subtotal,
    shipping,
    total,
    source: "website"
  };
  const resp = await fetch(APPS_SCRIPT_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return resp.json();
}

function render() {
  renderHeaderCategories();
  $("homeView").classList.toggle("hidden", state.currentView !== "home");
  $("categoryView").classList.toggle("hidden", state.currentView !== "category");
  if (state.currentView === "home") renderHome();
  else renderCategory();
  renderSearch();
  $("searchInput").value = state.searchQuery;
  renderAuthState();
  prefillCheckoutFromUser();
  renderCart();
}


async function syncAuthHook(payload) {
  if (!AUTH_HOOK_URL) return;
  try {
    await fetch(AUTH_HOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    // hook placeholder (best-effort)
  }
}

function normalizePhone(v) {
  return String(v || "").replace(/\D/g, "");
}

function persistUsers() {
  localStorage.setItem("msdr_users", JSON.stringify(state.users));
}

function setCurrentUser(user) {
  state.currentUser = user || null;
  if (state.currentUser) localStorage.setItem("msdr_current_user", JSON.stringify(state.currentUser));
  else localStorage.removeItem("msdr_current_user");
}

function renderAuthState() {
  const wrap = $("authArea");
  if (!wrap) return;
  if (!state.currentUser) {
    wrap.innerHTML = `<button class='btn btn-secondary' type='button' id='authBtn'>تسجيل الدخول</button>`;
    $("authBtn").onclick = () => openAuthModal("login");
    return;
  }
  wrap.innerHTML = `<div class='user-menu'><button class='btn btn-secondary' type='button' id='userMenuBtn'>${state.currentUser.full_name}</button><div class='user-dropdown' id='userDropdown'><button type='button' id='myOrdersBtn'>طلباتي</button><button type='button' id='logoutBtn'>تسجيل الخروج</button></div></div>`;
  $("userMenuBtn").onclick = () => $("userDropdown").classList.toggle("open");
  $("myOrdersBtn").onclick = openOrdersModal;
  $("logoutBtn").onclick = () => {
    setCurrentUser(null);
    state.cart = loadCart();
    renderAuthState();
    prefillCheckoutFromUser();
    renderCart();
    showToast("تم تسجيل الخروج", "success");
  };
}

function openAuthModal(tab = "login") {
  $("authModal").classList.remove("hidden");
  $("authModal").setAttribute("aria-hidden", "false");
  switchAuthTab(tab);
}

function closeAuthModal() {
  $("authModal").classList.add("hidden");
  $("authModal").setAttribute("aria-hidden", "true");
  $("authMessage").textContent = "";
}

function switchAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach((b) => b.classList.toggle("active", b.dataset.authTab === tab));
  $("loginForm").classList.toggle("hidden", tab !== "login");
  $("registerForm").classList.toggle("hidden", tab !== "register");
  $("authMessage").textContent = "";
}

function setAuthMessage(msg, isError = true) {
  const el = $("authMessage");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.toggle("success", !isError);
}

function prefillCheckoutFromUser() {
  const form = $("checkoutForm");
  if (!form || !state.currentUser) return;
  if (!form.customer_name.value.trim()) form.customer_name.value = state.currentUser.full_name || "";
  if (!form.phone.value.trim()) form.phone.value = state.currentUser.phone || "";
}

function openOrdersModal() {
  if (!state.currentUser) return openAuthModal("login");
  const modal = $("ordersModal");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  renderOrdersModal();
}

function closeOrdersModal() {
  const modal = $("ordersModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function renderOrdersModal() {
  const orders = getUserOrders().sort((a, b) => asNum(b.created_at) - asNum(a.created_at));
  const wrap = $("ordersList");
  if (!orders.length) {
    wrap.innerHTML = `<p class='empty-state'>لا توجد طلبات مسجلة لهذا الحساب حتى الآن.</p>`;
    return;
  }
  wrap.innerHTML = orders.map((order, idx) => {
    const dt = new Date(asNum(order.created_at, Date.now())).toLocaleString("ar-EG");
    const count = (order.items || []).reduce((s, i) => s + asNum(i.qty, 1), 0);
    const details = (order.items || []).map((i) => `<li>${i.name} × ${i.qty} — ${formatMoney(i.price * i.qty)}</li>`).join("");
    return `<article class='order-card'>
      <div class='order-head'>
        <strong>طلب #${order.order_id || "-"}</strong>
        <span>${dt}</span>
      </div>
      <p>الإجمالي: <strong>${formatMoney(order.total)}</strong> — عدد المنتجات: ${count}</p>
      <div class='order-actions'>
        <button class='pill' type='button' data-order-details='${idx}'>عرض التفاصيل</button>
        <button class='pill' type='button' data-order-reorder='${idx}'>إعادة الطلب</button>
      </div>
      <ul class='order-details hidden' id='orderDetails_${idx}'>${details || "<li>لا توجد عناصر.</li>"}</ul>
    </article>`;
  }).join("");

  wrap.querySelectorAll("[data-order-details]").forEach((btn) => {
    btn.onclick = () => {
      const el = $(`orderDetails_${btn.dataset.orderDetails}`);
      if (el) el.classList.toggle("hidden");
    };
  });
  wrap.querySelectorAll("[data-order-reorder]").forEach((btn) => {
    btn.onclick = () => {
      const order = orders[asNum(btn.dataset.orderReorder, -1)];
      if (!order) return;
      state.cart = (order.items || []).map((i) => ({ ...i, qty: Math.max(1, asNum(i.qty, 1)) }));
      saveCart();
      renderCart();
      closeOrdersModal();
      showToast("تمت إعادة الطلب وإضافة المنتجات للسلة");
    };
  });
}

function bindStaticEvents() {
  $("searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("searchInput").value.trim();
    updateRoute({ view: state.currentView, cat: state.currentCategory, sub: state.selectedSubcategory, brand: state.selectedBrand, q });
  });
  $("clearSearchBtn").onclick = () => updateRoute({ view: state.currentView, cat: state.currentCategory, sub: state.selectedSubcategory, brand: state.selectedBrand, q: "" });

  const open = () => {
    $("cartDrawer").classList.add("open");
    $("cartBackdrop").classList.remove("hidden");
    $("cartDrawer").setAttribute("aria-hidden", "false");
  };
  const close = () => {
    $("cartDrawer").classList.remove("open");
    $("cartBackdrop").classList.add("hidden");
    $("cartDrawer").setAttribute("aria-hidden", "true");
  };
  $("cartBtn").onclick = open;
  $("closeCart").onclick = close;
  $("cartBackdrop").onclick = close;

  $("ordersCloseBtn").onclick = closeOrdersModal;
  $("ordersModal").addEventListener("click", (e) => {
    if (e.target.id === "ordersModal") closeOrdersModal();
  });

  $("authCloseBtn").onclick = closeAuthModal;
  $("authModal").addEventListener("click", (e) => {
    if (e.target.id === "authModal") closeAuthModal();
  });
  document.querySelectorAll(".auth-tab").forEach((btn) => {
    btn.onclick = () => switchAuthTab(btn.dataset.authTab);
  });

  $("registerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("full_name") || "").trim();
    const phone = normalizePhone(fd.get("phone"));
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm_password") || "");
    if (!full_name) return setAuthMessage("الاسم الكامل مطلوب.");
    if (phone.length < 10) return setAuthMessage("رقم الموبايل يجب ألا يقل عن 10 أرقام.");
    if (password.length < 6) return setAuthMessage("كلمة المرور يجب ألا تقل عن 6 أحرف.");
    if (password !== confirm) return setAuthMessage("تأكيد كلمة المرور غير مطابق.");
    if (state.users.some((u) => normalizePhone(u.phone) === phone)) return setAuthMessage("هذا الرقم مسجل بالفعل.");
    const user = { id: `u_${Date.now()}`, full_name, phone, password };
    state.users.push(user);
    persistUsers();
    setCurrentUser(user);
    applyCartAfterLogin(user);
    syncAuthHook({ action: "register", full_name, phone });
    renderAuthState();
    prefillCheckoutFromUser();
    renderCart();
    setAuthMessage("تم إنشاء الحساب وتسجيل الدخول بنجاح.", false);
    setTimeout(closeAuthModal, 600);
  });

  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phone = normalizePhone(fd.get("phone"));
    const password = String(fd.get("password") || "");
    if (phone.length < 10) return setAuthMessage("رقم الموبايل يجب ألا يقل عن 10 أرقام.");
    if (password.length < 6) return setAuthMessage("كلمة المرور يجب ألا تقل عن 6 أحرف.");
    const user = state.users.find((u) => normalizePhone(u.phone) === phone && u.password === password);
    if (!user) return setAuthMessage("بيانات تسجيل الدخول غير صحيحة.");
    setCurrentUser(user);
    applyCartAfterLogin(user);
    syncAuthHook({ action: "login", phone });
    renderAuthState();
    prefillCheckoutFromUser();
    renderCart();
    setAuthMessage("تم تسجيل الدخول بنجاح.", false);
    setTimeout(closeAuthModal, 600);
  });

  $("checkoutForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.cart.length) return ($("formErrors").textContent = "السلة فارغة.");
    const customer = getCustomerFormData();
    if (!customer) return;
    const number = (state.data.settings.whatsapp_number || FALLBACK_SETTINGS.whatsapp_number).replace(/\D/g, "");
    const text = encodeURIComponent(buildWhatsappMessage(customer));
    window.open(`https://wa.me/${number}?text=${text}`, "_blank");
  });

  $("saveOrderBtn").onclick = async () => {
    if (!state.cart.length) return ($("formErrors").textContent = "السلة فارغة.");
    const customer = getCustomerFormData();
    if (!customer) return;
    if (!isTruthy(state.data.settings.write_orders || FALLBACK_SETTINGS.write_orders)) {
      $("orderStatus").textContent = "تسجيل الطلب غير مفعّل من الإعدادات.";
      return;
    }
    try {
      $("orderStatus").textContent = "جاري تسجيل الطلب...";
      const result = await postOrder(customer);
      saveOrderLocally(customer, result);
      state.cart = [];
      saveCart();
      renderCart();
      showToast("تم تسجيل الطلب بنجاح");
      $("orderStatus").textContent = result?.order_id ? `تم تسجيل الطلب. رقم الطلب: ${result.order_id}` : "تم تسجيل الطلب بنجاح.";
    } catch (err) {
      $("orderStatus").textContent = "تعذر تسجيل الطلب حالياً.";
    }
  };

  window.__goHome = () => updateRoute({ view: "home", cat: "", sub: "", brand: "", q: "" });
}

(async function init() {
  try {
    state.cart = loadCart();
    bindStaticEvents();
    await loadData();
    syncStateFromRoute();
    if (!state.currentCategory && state.currentView === "category") state.currentCategory = DEFAULT_CATEGORY;
    render();
    setInterval(() => {
      state.heroIndex += 1;
      if (state.currentView === "home") renderHome();
    }, 5000);
    window.addEventListener("popstate", () => {
      syncStateFromRoute();
      render();
    });
  } catch (e) {
    $("appRoot").innerHTML = `<div class='panel empty-state'>تعذر تحميل بيانات المتجر حالياً. يرجى المحاولة لاحقاً.</div>`;
  }
})();
