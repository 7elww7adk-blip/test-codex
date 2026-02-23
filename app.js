/*
Developer Notes:
1) لإظهار "وصل حديثاً" أضف عمود new_arrival في Sheet المنتجات (قيم مقبولة: نعم/Yes/true/1).
2) لإظهار "جميع/أشهر الماركات" المميزة أضف عمود featured في Sheet الماركات (نعم/Yes/true/1).
3) تغيير رقم واتساب/الشحن يتم من Settings: keys مثل whatsapp_number و shipping و write_orders.
4) إضافة أي قسم رئيسي جديد تعمل تلقائيًا: فقط أضفه في MainCategories مع enabled=true، وستظهر صفحة القسم عبر نفس الـ routing.
*/

const { APPS_SCRIPT_BASE_URL, DEFAULT_CATEGORY, FALLBACK_SETTINGS, CACHE_TTL_MS } = window.APP_CONFIG;

const state = {
  currentView: "home",
  currentCategory: "",
  selectedSubcategory: "",
  selectedBrand: "",
  searchQuery: "",
  cart: JSON.parse(localStorage.getItem("msdr_cart") || "[]"),
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

  const newArrivals = products.filter((p) => p.new_arrival).slice(0, 12);
  $("homeNewArrivals").innerHTML = newArrivals.length ? newArrivals.map(productCard).join("") : emptyState("لا توجد منتجات وصل حديثاً حالياً.");

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
  $("subcategoryChips").innerHTML = [`<button class='pill ${!state.selectedSubcategory ? "active" : ""}' data-sub=''>الكل</button>`, ...subs.map((s) => `<button class='pill ${state.selectedSubcategory === s.sub_category_name ? "active" : ""}' data-sub='${s.sub_category_name}'>${s.sub_category_name}</button>`)].join("");
  $("subcategoryChips").querySelectorAll("button").forEach((b) => b.onclick = () => updateRoute({ view: "category", cat, sub: b.dataset.sub, brand: state.selectedBrand, q: "" }));

  const catBrands = getCategoryBrands(cat);
  $("categoryBrands").innerHTML = catBrands.length
    ? catBrands.map((b) => `<article class='card brand-card'><img src='${safeImage(b.logo_url)}' alt='${b.brand_name}' loading='lazy' onerror="this.src='${PLACEHOLDER_IMAGE}'" /><h3>${b.brand_name}</h3><button class='pill ${state.selectedBrand === b.brand_name ? "active" : ""}' data-brand='${b.brand_name}'>تصفية</button></article>`).join("")
    : emptyState("لا توجد ماركات مميزة لهذا القسم.");
  $("categoryBrands").querySelectorAll("button[data-brand]").forEach((b) => b.onclick = () => updateRoute({ view: "category", cat, sub: state.selectedSubcategory, brand: b.dataset.brand, q: "" }));

  const activeBrand = state.selectedBrand
    ? `<div class="active-brand-filter"><span>الفلتر الحالي: <strong>${state.selectedBrand}</strong></span><button class="text-link" type="button" id="clearBrandFilterBtn">مسح فلتر الماركة</button></div>`
    : "";

  const arrivals = categoryProducts.filter((p) => p.new_arrival).slice(0, 12);
  $("categoryNewArrivals").innerHTML = arrivals.length ? arrivals.map(productCard).join("") : emptyState("لا توجد منتجات جديدة في هذا القسم حالياً.");
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

function bindAddToCart() {
  document.querySelectorAll(".add-cart").forEach((btn) => btn.onclick = () => {
    const p = state.data.products.find((x) => x.id === btn.dataset.id);
    if (!p) return;
    const found = state.cart.find((x) => x.id === p.id);
    if (found) found.qty += 1;
    else state.cart.push({ id: p.id, name: p.name, price: p.sale_price > 0 ? p.sale_price : p.price, image: p.image, qty: 1 });
    saveCart();
    renderCart();
  });
}

function saveCart() {
  localStorage.setItem("msdr_cart", JSON.stringify(state.cart));
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
  renderCart();
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
      $("orderStatus").textContent = result?.order_id ? `تم تسجيل الطلب. رقم الطلب: ${result.order_id}` : "تم تسجيل الطلب بنجاح.";
    } catch (err) {
      $("orderStatus").textContent = "تعذر تسجيل الطلب حالياً.";
    }
  };

  window.__goHome = () => updateRoute({ view: "home", cat: "", sub: "", brand: "", q: "" });
}

(async function init() {
  try {
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
