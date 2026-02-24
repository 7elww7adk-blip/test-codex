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
  currentUser: null,
  minPrice: "",
  maxPrice: "",
  sort: "newest",
  cart: [],
  data: { products: [], brands: [], mainCategories: [], subCategories: [], banners: [], settings: {} },
  heroIndex: 0,
  currentProductId: "",
  currentOrderCode: "",
  ui: {
    productsLimit: { category: 0, search: 0, favorites: 0, similar: 0 },
    localSearch: { category: "", search: "", favorites: "" }
  },
  isLoading: true
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
const imageAttrs = (url, alt = "") => `src="${safeImage(url)}" alt="${alt}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}';this.classList.add('img-fallback')"`;
const getDefaultLimit = () => (window.matchMedia("(max-width: 600px)").matches ? 12 : 20);
const normalizePhone = (phone) => String(phone || "").replace(/\D/g, "");
const userStorageKey = (phone) => `msdr_cart_user_${normalizePhone(phone)}`;


function saveLastRoute(searchStr = location.search) {
  const p = new URLSearchParams(searchStr);
  const v = p.get("view") || state.currentView;
  if (["category", "search", "product", "favorites"].includes(v)) localStorage.setItem("msdr_last_route", `?${p.toString()}`);
}

function getFavorites() {
  return JSON.parse(localStorage.getItem("msdr_favorites") || "[]");
}

function saveFavorites(ids) {
  localStorage.setItem("msdr_favorites", JSON.stringify([...new Set(ids)]));
}

function isFavorite(productId) {
  return getFavorites().includes(productId);
}

function toggleFavorite(productId) {
  const current = getFavorites();
  const exists = current.includes(productId);
  const next = exists ? current.filter((x) => x !== productId) : [...current, productId];
  saveFavorites(next);
  showToast(exists ? "تمت الإزالة من المفضلة" : "تمت الإضافة للمفضلة");
}

function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function ensureLimit(viewName) {
  if (!state.ui.productsLimit[viewName]) state.ui.productsLimit[viewName] = getDefaultLimit();
}

function resetLimit(viewName) {
  state.ui.productsLimit[viewName] = getDefaultLimit();
}

function getDiscountPercent(p) {
  const oldPrice = asNum(p.old_price || p.compare_at_price, 0);
  const current = getProductEffectivePrice(p);
  if (asNum(p.discount_percent, 0) > 0) return asNum(p.discount_percent);
  if (oldPrice > current && current > 0) return Math.round(((oldPrice - current) / oldPrice) * 100);
  return 0;
}

function getProductBadges(p) {
  const badges = [];
  const discount = getDiscountPercent(p);
  if (p.new_arrival) badges.push(`<span class="badge badge-new">جديد</span>`);
  if (discount > 0) badges.push(`<span class="badge badge-discount">خصم -${discount}%</span>`);
  if (isTruthy(p.best_seller)) badges.push(`<span class="badge badge-best">الأكثر مبيعًا</span>`);
  return badges.join("");
}

function getProductUrl(productId) {
  return `${location.origin}${location.pathname}?view=product&id=${encodeURIComponent(productId)}`;
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

function renderProductPrice(p) {
  const price = getProductEffectivePrice(p);
  const oldPrice = asNum(p.old_price || p.compare_at_price, 0);
  const discount = getDiscountPercent(p);
  return `<div class="price-block"><span class='price'>${formatMoney(price)}</span>${oldPrice > price ? `<span class='old-price'>${formatMoney(oldPrice)}</span>` : ""}${discount > 0 ? `<span class='discount-chip'>-${discount}%</span>` : ""}</div>`;
}

function clearCacheWhenRefreshRequested() {
  const p = new URLSearchParams(location.search);
  if (p.get("refresh") !== "1") return;
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith("msdr_cache_")) localStorage.removeItem(key);
  });
  memoryCache.clear();
  p.delete("refresh");
  const next = p.toString();
  history.replaceState({}, "", `${location.pathname}${next ? `?${next}` : ""}`);
}

function getUsers() {
  return JSON.parse(localStorage.getItem("msdr_users") || "[]");
}

function saveUsers(users) {
  localStorage.setItem("msdr_users", JSON.stringify(users));
}

function getOrdersStorageKey() {
  return state.currentUser ? `msdr_orders_user_${normalizePhone(state.currentUser.phone)}` : "msdr_orders_guest";
}

function getOrders() {
  return JSON.parse(localStorage.getItem(getOrdersStorageKey()) || "[]");
}

function saveOrders(orders) {
  localStorage.setItem(getOrdersStorageKey(), JSON.stringify(orders));
}

function findOrderByCode(oid) {
  if (!oid) return null;
  return getOrders().find((o) => o.order_code === oid) || null;
}

function getCartStorageKey() {
  return state.currentUser ? userStorageKey(state.currentUser.phone) : "msdr_cart_guest";
}

function loadCart() {
  state.cart = JSON.parse(localStorage.getItem(getCartStorageKey()) || "[]");
}

function saveCart() {
  localStorage.setItem(getCartStorageKey(), JSON.stringify(state.cart));
}

function loadCurrentUser() {
  state.currentUser = JSON.parse(localStorage.getItem("msdr_current_user") || "null");
}

function setCurrentUser(user) {
  state.currentUser = user;
  if (user) localStorage.setItem("msdr_current_user", JSON.stringify(user));
  else localStorage.removeItem("msdr_current_user");
  loadCart();
  renderCart();
  renderAuthUI();
}

function mergeGuestCartIntoUser(phone) {
  const guestCart = JSON.parse(localStorage.getItem("msdr_cart_guest") || "[]");
  if (!guestCart.length) return;
  const key = userStorageKey(phone);
  const userCart = JSON.parse(localStorage.getItem(key) || "[]");
  guestCart.forEach((item) => {
    const found = userCart.find((x) => x.id === item.id);
    if (found) found.qty += asNum(item.qty, 1);
    else userCart.push({ ...item, qty: asNum(item.qty, 1) });
  });
  localStorage.setItem(key, JSON.stringify(userCart));
  localStorage.removeItem("msdr_cart_guest");
}

let toastTimer = null;
function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

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
      best_seller: isTruthy(p.best_seller),
      description: p.description || "",
      specs: p.specs || "",
      old_price: asNum(p.old_price || p.compare_at_price, 0),
      discount_percent: asNum(p.discount_percent, 0)
    })),
    brands: brands.map((b) => ({ ...b, enabled: isTruthy(b.enabled), featured: "featured" in b ? isTruthy(b.featured) : null })),
    mainCategories: sortBy(mainCategories.filter((c) => isTruthy(c.enabled))),
    subCategories: sortBy(subCategories.filter((s) => isTruthy(s.enabled))),
    banners: sortBy(banners.filter((b) => isTruthy(b.enabled))),
    settings
  };
}

function updateRoute(params = {}, opts = { scroll: "none" }) {
  const prev = { cat: state.currentCategory, sub: state.selectedSubcategory, brand: state.selectedBrand, q: state.searchQuery, view: state.currentView };
  const search = new URLSearchParams(location.search);
  const view = params.view ?? state.currentView ?? "home";
  search.set("view", view);

  const cat = params.cat ?? state.currentCategory;
  const sub = params.sub ?? state.selectedSubcategory;
  const brand = params.brand ?? state.selectedBrand;
  const q = params.q ?? state.searchQuery;
  const minPrice = params.min_price ?? state.minPrice;
  const maxPrice = params.max_price ?? state.maxPrice;
  const sort = params.sort ?? state.sort ?? "newest";
  const id = params.id ?? state.currentProductId;
  const oid = params.oid ?? state.currentOrderCode;

  cat ? search.set("cat", cat) : search.delete("cat");
  sub ? search.set("sub", sub) : search.delete("sub");
  brand ? search.set("brand", brand) : search.delete("brand");
  q ? search.set("q", q) : search.delete("q");
  minPrice ? search.set("min_price", minPrice) : search.delete("min_price");
  maxPrice ? search.set("max_price", maxPrice) : search.delete("max_price");
  sort && sort !== "newest" ? search.set("sort", sort) : search.delete("sort");
  id && view === "product" ? search.set("id", id) : search.delete("id");
  oid && view === "order_success" ? search.set("oid", oid) : search.delete("oid");

  if (view === "category" && (prev.cat !== cat || prev.sub !== sub || prev.brand !== brand || prev.view !== view)) resetLimit("category");
  if (view === "search" && (prev.q !== q || prev.brand !== brand || prev.view !== view)) resetLimit("search");
  if (view === "favorites" && prev.view !== view) resetLimit("favorites");

  setLoading(true);
  history.pushState({}, "", `?${search.toString()}`);
  saveLastRoute(`?${search.toString()}`);
  syncStateFromRoute();
  render();
  requestAnimationFrame(() => {
    setLoading(false);
    if (opts.scroll === "top") setTimeout(scrollToTop, 0);
    else if (opts.scroll === "products") setTimeout(scrollToProducts, 0);
    else if (opts.scroll === "view") setTimeout(scrollToViewStart, 0);
  });
}

function parseFiltersFromUrl() {
  const p = new URLSearchParams(location.search);
  return {
    brand: p.get("brand") || "",
    minPrice: p.get("min_price") || "",
    maxPrice: p.get("max_price") || "",
    sort: p.get("sort") || "newest"
  };
}

function syncStateFromRoute() {
  const p = new URLSearchParams(location.search);
  const filters = parseFiltersFromUrl();
  state.currentView = p.get("view") || "home";
  state.currentCategory = p.get("cat") || "";
  state.selectedSubcategory = p.get("sub") || "";
  state.selectedBrand = filters.brand;
  state.searchQuery = p.get("q") || "";
  state.currentProductId = p.get("id") || "";
  state.currentOrderCode = p.get("oid") || "";
  state.minPrice = filters.minPrice;
  state.maxPrice = filters.maxPrice;
  state.sort = filters.sort;
}

function getProductEffectivePrice(product) {
  return product.sale_price > 0 ? asNum(product.sale_price) : asNum(product.price);
}

function applyProductFilters(products) {
  const min = state.minPrice === "" ? null : asNum(state.minPrice, NaN);
  const max = state.maxPrice === "" ? null : asNum(state.maxPrice, NaN);
  let filtered = products.filter((p) => {
    const price = getProductEffectivePrice(p);
    if (Number.isFinite(min) && price < min) return false;
    if (Number.isFinite(max) && price > max) return false;
    return true;
  });

  if (state.sort === "price_asc") filtered = filtered.sort((a, b) => getProductEffectivePrice(a) - getProductEffectivePrice(b));
  else if (state.sort === "price_desc") filtered = filtered.sort((a, b) => getProductEffectivePrice(b) - getProductEffectivePrice(a));
  else if (state.sort === "name_asc") filtered = filtered.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  else filtered = filtered.sort((a, b) => asNum(b.sort, 0) - asNum(a.sort, 0));
  return filtered;
}

function filtersTemplate({ brands = [], subcategories = [], view = "category" }) {
  const currentSort = state.sort || "newest";
  const showSubcats = view === "category";
  return `<div class="filters-card">
    ${showSubcats ? `<div class="filter-group"><h4>الأقسام الفرعية</h4>
      <label class="filter-choice"><input type="radio" name="filterSub" value="" ${!state.selectedSubcategory ? "checked" : ""} /> الكل</label>
      ${subcategories.map((sub) => `<label class="filter-choice"><input type="radio" name="filterSub" value="${sub}" ${state.selectedSubcategory === sub ? "checked" : ""} /> ${sub}</label>`).join("")}
    </div>` : ""}
    <div class="filter-group">
      <h4>الماركة</h4>
      <label class="filter-choice"><input type="radio" name="filterBrand" value="" ${!state.selectedBrand ? "checked" : ""} /> كل الماركات</label>
      ${brands.map((b) => `<label class="filter-choice"><input type="radio" name="filterBrand" value="${b}" ${state.selectedBrand === b ? "checked" : ""} /> ${b}</label>`).join("")}
    </div>
    <div class="filter-group">
      <h4>السعر</h4>
      <div class="filter-price-grid">
        <input id="filterMinPrice" type="number" min="0" placeholder="من" value="${state.minPrice}" />
        <input id="filterMaxPrice" type="number" min="0" placeholder="إلى" value="${state.maxPrice}" />
      </div>
    </div>
    <div class="filter-group">
      <h4>الترتيب</h4>
      <select id="filterSort" class="filter-sort-select">
        <option value="newest" ${currentSort === "newest" ? "selected" : ""}>الأحدث</option>
        <option value="price_asc" ${currentSort === "price_asc" ? "selected" : ""}>السعر: الأقل للأعلى</option>
        <option value="price_desc" ${currentSort === "price_desc" ? "selected" : ""}>السعر: الأعلى للأقل</option>
        <option value="name_asc" ${currentSort === "name_asc" ? "selected" : ""}>الاسم: أ-ي</option>
      </select>
    </div>
    <div class="filter-actions">
      <button type="button" class="btn" id="applyFiltersBtn">تطبيق</button>
      <button type="button" class="btn btn-secondary" id="clearFiltersBtn">مسح الفلاتر</button>
    </div>
  </div>`;
}

function renderFiltersUI(context) {
  const desktopTarget = context.view === "search" ? $("searchFiltersSidebar") : $("filtersSidebar");
  if (!desktopTarget) return;
  desktopTarget.innerHTML = filtersTemplate(context);
  const sheetContent = $("filtersSheetContent");
  if (sheetContent) sheetContent.innerHTML = filtersTemplate(context);
  bindFiltersEvents(context.view);
  const showMobile = window.matchMedia("(max-width: 991px)").matches && (state.currentView === "category" || state.currentView === "search");
  $("mobileFiltersBar")?.classList.toggle("hidden", !showMobile);
  document.body.classList.toggle("has-mobile-filters", showMobile);
}

function closeFiltersSheet() {
  $("filtersSheet")?.classList.add("hidden");
  $("filtersSheetOverlay")?.classList.add("hidden");
  $("filtersSheet")?.setAttribute("aria-hidden", "true");
}

function getHeaderOffset() {
  const header = document.querySelector("header") || document.getElementById("siteHeader");
  if (!header) return 0;

  const style = window.getComputedStyle(header);
  const pos = style.position;
  if (pos !== "fixed" && pos !== "sticky") return 0;

  const rect = header.getBoundingClientRect();
  return Math.ceil(rect.height) + 8;
}

function scrollToElementWithOffset(el) {
  if (!el) return;
  const offset = getHeaderOffset();
  const top = window.pageYOffset + el.getBoundingClientRect().top - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToProducts() {
  const el = document.getElementById("productsAnchor") || document.getElementById("productsSectionTitle") || document.getElementById("productsGrid");
  if (!el) return;
  scrollToElementWithOffset(el);
}

function scrollToViewStart() {
  const el = document.querySelector("main") || document.getElementById("app");
  if (!el) return scrollToTop();
  scrollToElementWithOffset(el);
}

function setLoading(isLoading) {
  const bar = document.getElementById("topLoader");
  if (!bar) return;
  bar.classList.toggle("is-loading", !!isLoading);
  bar.setAttribute("aria-hidden", isLoading ? "false" : "true");
}

function openFiltersSheet() {
  $("filtersSheet")?.classList.remove("hidden");
  $("filtersSheetOverlay")?.classList.remove("hidden");
  $("filtersSheet")?.setAttribute("aria-hidden", "false");
}

function bindFiltersEvents(viewName) {
  const applyFilter = (sourceBtn) => {
    const root = sourceBtn?.closest(".filters-card") || document;
    const chosen = root.querySelector('input[name="filterBrand"]:checked');
    const chosenSub = root.querySelector('input[name="filterSub"]:checked');
    const min = root.querySelector('#filterMinPrice')?.value?.trim() || "";
    const max = root.querySelector('#filterMaxPrice')?.value?.trim() || "";
    const sort = root.querySelector('#filterSort')?.value || "newest";
    updateRoute({
      view: viewName,
      cat: state.currentCategory,
      sub: viewName === "category" ? (chosenSub?.value || "") : state.selectedSubcategory,
      q: state.searchQuery,
      brand: chosen?.value || "",
      min_price: min,
      max_price: max,
      sort
    }, { scroll: viewName === "category" ? "products" : "none" });
    closeFiltersSheet();
    setTimeout(scrollToProducts, 0);
  };

  const clearFilter = () => {
    updateRoute({
      view: viewName,
      cat: state.currentCategory,
      sub: "",
      q: state.searchQuery,
      brand: "",
      min_price: "",
      max_price: "",
      sort: "newest"
    }, { scroll: viewName === "category" ? "products" : "none" });
    closeFiltersSheet();
    setTimeout(scrollToProducts, 0);
  };

  document.querySelectorAll('#applyFiltersBtn').forEach((btn) => btn.onclick = () => applyFilter(btn));
  document.querySelectorAll('#clearFiltersBtn').forEach((btn) => btn.onclick = clearFilter);
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
  return hasFeatured ? sourceBrands.filter((b) => b.featured) : sourceBrands.filter((b) => b.enabled);
}

function productCard(p) {
  const inStock = p.available && p.stock_qty > 0;
  const favoriteClass = isFavorite(p.id) ? "active" : "";
  return `<article class="card product-card" data-product-card data-id="${p.id}">
    <div class="card-media-wrap" data-open-product="${p.id}">
      <img ${imageAttrs(p.image, p.name)} />
      <div class="badges-row">${getProductBadges(p)}</div>
      <button class="icon-btn fav-toggle ${favoriteClass}" type="button" data-fav="${p.id}" aria-label="المفضلة"><i class="fa-solid fa-heart"></i></button>
      <button class="icon-btn share-toggle" type="button" data-share="${p.id}" aria-label="مشاركة"><i class="fa-solid fa-share-nodes"></i></button>
    </div>
    <h3><a href="?view=product&id=${encodeURIComponent(p.id)}" data-open-product="${p.id}">${p.name}</a></h3>
    <p>${p.brand_name || ""}</p>
    ${renderProductPrice(p)}
    ${!inStock ? `<p class="badge-unavailable">غير متاح</p>` : ""}
    <button class="btn add-cart" data-id="${p.id}" ${inStock ? "" : "disabled"}>أضف للسلة</button>
  </article>`;
}

function emptyState(message) {
  return `<div class="empty-state">${message}<br><a class="pill" href="?view=home" onclick="event.preventDefault();window.__goHome()">العودة للرئيسية</a></div>`;
}

function renderHome() {
  const { mainCategories, banners, brands } = state.data;
  $("homeView").classList.remove("hidden");
  const homeSk = $("homeCategoriesSkeleton");
  if (homeSk) {
    homeSk.innerHTML = Array.from({ length: 6 }).map(() => `<article class="card skeleton-card"><div class="skeleton skeleton-media"></div><div class="skeleton skeleton-line"></div></article>`).join("");
    homeSk.classList.toggle("hidden", !state.isLoading);
  }
  $("homeCategories")?.classList.toggle("hidden", state.isLoading);

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
}

function getCategoryBrands(catName) {
  const { brands, products } = state.data;
  const featured = featuredBrands(brands);
  return featured.filter((b) => {
    if (b.main_category_name) return b.main_category_name === catName;
    return products.some((p) => p.main_category_name === catName && p.brand_name === b.brand_name);
  });
}

function getVisibleProducts(viewName, products) {
  ensureLimit(viewName);
  return products.slice(0, state.ui.productsLimit[viewName]);
}

function renderLoadMore(viewName, total, btnId) {
  const btn = $(btnId);
  if (!btn) return;
  const canLoadMore = total > state.ui.productsLimit[viewName];
  btn.classList.toggle("hidden", !canLoadMore);
  btn.onclick = canLoadMore
    ? () => {
      state.ui.productsLimit[viewName] += getDefaultLimit();
      render();
    }
    : null;
}

function bindLocalSearch(inputId, viewName) {
  const input = $(inputId);
  if (!input) return;
  input.value = state.ui.localSearch[viewName] || "";
  const onInput = debounce((value) => {
    state.ui.localSearch[viewName] = value;
    resetLimit(viewName);
    render();
  }, 200);
  input.oninput = (e) => onInput(e.target.value.trim().toLowerCase());
}

function renderCategory() {
  const { products, subCategories, banners } = state.data;
  const sk = $("categoryProductsSkeleton");
  if (sk) {
    sk.innerHTML = Array.from({ length: getDefaultLimit() }).map(() => `<article class="card skeleton-card"><div class="skeleton skeleton-media"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></article>`).join("");
    sk.classList.toggle("hidden", !state.isLoading);
  }
  $("categoryProducts")?.classList.toggle("hidden", state.isLoading);
  const cat = state.currentCategory || DEFAULT_CATEGORY;
  const categoryProducts = products.filter((p) => p.main_category_name === cat);
  const baseFiltered = categoryProducts.filter((p) => (!state.selectedSubcategory || p.sub_category_name === state.selectedSubcategory) && (!state.selectedBrand || p.brand_name === state.selectedBrand));
  const localQ = state.ui.localSearch.category || "";
  const localFiltered = baseFiltered.filter((p) => !localQ || [p.name, p.brand_name, p.description, p.specs].join(" ").toLowerCase().includes(localQ));
  const availableBrands = [...new Set(categoryProducts.filter((p) => !state.selectedSubcategory || p.sub_category_name === state.selectedSubcategory).map((p) => p.brand_name).filter(Boolean))];
  const filterSubcats = sortBy(subCategories.filter((sub) => sub.main_category_name === cat)).map((sub) => sub.sub_category_name);
  const filtered = applyProductFilters(localFiltered);
  const visible = getVisibleProducts("category", filtered);

  const catBanner = banners.find((b) => b.main_category_name === cat && !b.sub_category_name && !b.brand_name)
    || banners.find((b) => b.main_category_name === cat)
    || banners[0]
    || { title: cat, image_url: PLACEHOLDER_IMAGE };

  $("categoryBanner").innerHTML = `<img ${imageAttrs(catBanner.image_url, catBanner.title || cat)} />
  <div class="overlay">
    <h1>${cat}</h1>
    ${state.selectedBrand ? `<p><strong>${state.selectedBrand}</strong></p>` : ""}
    <button class="btn btn-secondary" id="backHomeBtn">العودة للرئيسية</button>
  </div>`;
  $("backHomeBtn").onclick = () => updateRoute({ view: "home", cat: "", sub: "", brand: "", q: "" }, { scroll: "top" });

  const subs = subCategories.filter((s) => s.main_category_name === cat);
  $("subcategoryCards").innerHTML = [`<article class='card subcategory-card ${!state.selectedSubcategory ? "active" : ""}' data-sub=''><div class='subcategory-image-wrap'><img ${imageAttrs(PLACEHOLDER_IMAGE, "الكل")} /></div><h3>الكل</h3></article>`, ...subs.map((s) => `<article class='card subcategory-card ${state.selectedSubcategory === s.sub_category_name ? "active" : ""}' data-sub='${s.sub_category_name}'><div class='subcategory-image-wrap'><img ${imageAttrs(s.image_url || "", s.sub_category_name)} /></div><h3>${s.sub_category_name}</h3></article>`)].join("");
  $("subcategoryCards").querySelectorAll(".subcategory-card").forEach((card) => card.onclick = () => {
    updateRoute({ view: "category", cat, sub: card.dataset.sub || "", brand: "", q: "", min_price: "", max_price: "", sort: "" }, { scroll: "products" });
  });

  $("categoryProducts").innerHTML = filtered.length ? visible.map(productCard).join("") : emptyState("لا توجد منتجات مطابقة للفلتر الحالي.");
  renderFiltersUI({ view: "category", brands: availableBrands, subcategories: filterSubcats });
  bindLocalSearch("categoryLocalInput", "category");
  renderLoadMore("category", filtered.length, "categoryLoadMoreBtn");

  const catBrands = getCategoryBrands(cat);
  $("categoryBrands").innerHTML = catBrands.length
    ? catBrands.map((b) => `<article class='card brand-card'><img ${imageAttrs(b.logo_url, b.brand_name)} /><h3>${b.brand_name}</h3><button class='pill' data-brand='${b.brand_name}'>تصفية</button></article>`).join("")
    : emptyState("لا توجد ماركات مميزة لهذا القسم.");
  $("categoryBrands").querySelectorAll("button[data-brand]").forEach((b) => b.onclick = () => updateRoute({ view: "category", cat, sub: state.selectedSubcategory, brand: b.dataset.brand, q: "" }));

  bindProductInteractions();
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
  const branded = hits.filter((p) => !state.selectedBrand || p.brand_name === state.selectedBrand);
  const localQ = state.ui.localSearch.search || "";
  const locallyFiltered = branded.filter((p) => !localQ || [p.name, p.brand_name, p.description, p.specs].join(" ").toLowerCase().includes(localQ));
  const filtered = applyProductFilters(locallyFiltered);
  const visible = getVisibleProducts("search", filtered);
  const brands = [...new Set(hits.map((p) => p.brand_name).filter(Boolean))];
  $("searchResults").innerHTML = filtered.length ? visible.map(productCard).join("") : emptyState("لا توجد نتائج بحث مطابقة.");
  renderFiltersUI({ view: "search", brands });
  bindLocalSearch("searchLocalInput", "search");
  renderLoadMore("search", filtered.length, "searchLoadMoreBtn");
  bindProductInteractions();
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

function bindAddToCart(root = document) {
  root.querySelectorAll(".add-cart").forEach((btn) => btn.onclick = () => {
    const p = state.data.products.find((x) => x.id === btn.dataset.id);
    if (!p) return;
    const found = state.cart.find((x) => x.id === p.id);
    if (found) {
      found.qty += 1;
      showToast("تمت زيادة الكمية في السلة");
    } else {
      state.cart.push({ id: p.id, name: p.name, price: getProductEffectivePrice(p), image: p.image, qty: 1 });
      showToast("تمت إضافة المنتج إلى السلة");
    }
    saveCart();
    renderCart();
  });
}

function bindProductInteractions(root = document) {
  bindAddToCart(root);
  root.querySelectorAll("[data-open-product]").forEach((el) => el.onclick = (e) => {
    e.preventDefault();
    const id = el.dataset.openProduct;
    if (!id) return;
    updateRoute({ view: "product", id, cat: state.currentCategory, sub: state.selectedSubcategory, brand: state.selectedBrand, q: state.searchQuery }, { scroll: "top" });
  });
  root.querySelectorAll("[data-fav]").forEach((el) => el.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(el.dataset.fav);
    render();
  });
  root.querySelectorAll("[data-share]").forEach((el) => el.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = el.dataset.share;
    const p = state.data.products.find((x) => x.id === id);
    if (!p) return;
    const url = getProductUrl(p.id);
    const text = `${p.name} - ${url}`;
    const target = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(target, "_blank");
  });
  root.querySelectorAll("[data-copy-link]").forEach((el) => el.onclick = async () => {
    const id = el.dataset.copyLink;
    const ok = await copyToClipboard(getProductUrl(id));
    showToast(ok ? "تم نسخ الرابط" : "تعذر نسخ الرابط");
  });
}

function renderProduct(productId) {
  const product = state.data.products.find((p) => p.id === productId);
  const wrap = $("productDetailsWrap");
  if (!wrap) return;
  if (!product) {
    wrap.innerHTML = emptyState("المنتج غير موجود.");
    return;
  }
  document.title = `${product.name} | المصدر`;
  const similarAll = state.data.products.filter((p) => p.id !== product.id && (p.main_category_name === product.main_category_name || p.brand_name === product.brand_name));
  const similarVisible = getVisibleProducts("similar", similarAll);
  wrap.innerHTML = `<div class="product-view-grid">
    <div>
      <img class="product-main-image" ${imageAttrs(product.image, product.name)} id="openLightboxImage" />
    </div>
    <div>
      <button class="text-link" type="button" id="backFromProductBtn">رجوع</button>
      <h2>${product.name}</h2>
      <div class="badges-row">${getProductBadges(product)}</div>
      ${renderProductPrice(product)}
      <p>${product.description || product.specs || "لا توجد تفاصيل إضافية"}</p>
      <div class="product-actions">
        <button class="btn add-cart" data-id="${product.id}">أضف للسلة</button>
        <button class="btn btn-secondary" data-share="${product.id}">مشاركة واتساب</button>
        <button class="btn btn-secondary" data-copy-link="${product.id}">نسخ الرابط</button>
        <button class="btn btn-secondary" data-fav="${product.id}">مفضلة ❤️</button>
      </div>
    </div>
  </div>
  <section class="panel">
    <h3>منتجات مشابهة</h3>
    <div class="products-grid">${similarVisible.map(productCard).join("") || ""}</div>
    <div class="load-more-wrap"><button class="btn btn-secondary ${similarAll.length > state.ui.productsLimit.similar ? "" : "hidden"}" id="similarLoadMoreBtn">تحميل المزيد</button></div>
  </section>`;
  $("backFromProductBtn").onclick = () => (history.length > 1 ? history.back() : updateRoute({ view: "category", cat: product.main_category_name, sub: "", brand: "", q: "" }));
  $("openLightboxImage").onclick = () => {
    $("lightboxImage").src = safeImage(product.image);
    $("imageLightbox").classList.remove("hidden");
    $("imageLightbox").setAttribute("aria-hidden", "false");
  };
  renderLoadMore("similar", similarAll.length, "similarLoadMoreBtn");
  bindProductInteractions(wrap);
}

function renderFavorites() {
  const ids = getFavorites();
  const localQ = state.ui.localSearch.favorites || "";
  const all = state.data.products.filter((p) => ids.includes(p.id) && (!localQ || [p.name, p.brand_name, p.description].join(" ").toLowerCase().includes(localQ)));
  const visible = getVisibleProducts("favorites", all);
  $("favoritesProducts").innerHTML = all.length ? visible.map(productCard).join("") : emptyState("لا توجد منتجات في المفضلة بعد.");
  bindLocalSearch("favoritesLocalInput", "favorites");
  renderLoadMore("favorites", all.length, "favoritesLoadMoreBtn");
  bindProductInteractions($("favoritesView"));
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

function generateOrderCode() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `MSDR-${stamp}-${rand}`;
}

function getOrGenerateOrderCode(order) {
  if (order.order_code) return order.order_code;
  return generateOrderCode();
}

function buildOrderFromCartAndForm(customer) {
  const subtotal = state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shipping = asNum(state.data.settings.shipping || FALLBACK_SETTINGS.shipping);
  const total = subtotal + shipping;
  return {
    created_at: new Date().toISOString(),
    customer: {
      name: customer.customer_name,
      phone: customer.phone,
      area: customer.area,
      address: customer.address,
      notes: customer.notes || ""
    },
    items: state.cart.map((i) => ({ id: i.id, name: i.name, price: asNum(i.price), qty: asNum(i.qty, 1), image_url: i.image || "" })),
    subtotal,
    shipping,
    total,
    whatsapp_number: (state.data.settings.whatsapp_number || FALLBACK_SETTINGS.whatsapp_number).replace(/\D/g, ""),
    status: "sent_whatsapp"
  };
}

function buildWhatsAppOrderMessage(order) {
  const dateText = new Date(order.created_at).toLocaleString("ar-EG");
  const distinctItems = order.items.length;
  const totalPieces = order.items.reduce((sum, item) => sum + asNum(item.qty, 0), 0);
  const itemsBlock = order.items
    .map((item, idx) => `#${idx + 1} — *${item.name}*
الكمية: ${item.qty}
سعر الوحدة: ${formatMoney(item.price)}
إجمالي الصنف: ${formatMoney(item.qty * item.price)}
──────────────`)
    .join("\n");

  return [
    "✅ *طلب جديد*",
    `🧾 *كود الطلب:* ${order.order_code}`,
    `📅 *التاريخ:* ${dateText}`,
    "",
    `👤 *العميل:* ${order.customer.name}`,
    `📞 *الموبايل:* ${order.customer.phone}`,
    `📍 *المنطقة:* ${order.customer.area}`,
    `🏠 *العنوان:* ${order.customer.address}`,
    order.customer.notes ? `📝 *ملاحظات:* ${order.customer.notes}` : "",
    "",
    "━━━━━━━━━━━━━━",
    "📦 *ملخص الطلب*",
    `• *عدد الأصناف:* ${distinctItems}`,
    `• *إجمالي القطع:* ${totalPieces}`,
    "━━━━━━━━━━━━━━",
    "",
    "🛒 *تفاصيل المنتجات*",
    itemsBlock,
    "━━━━━━━━━━━━━━",
    "",
    `💰 *الإجمالي الفرعي:* ${formatMoney(order.subtotal)}`,
    `🚚 *الشحن:* ${formatMoney(order.shipping)}`,
    `🧮 *الإجمالي النهائي:* ${formatMoney(order.total)}`,
    "",
    `🔁 *كود الطلب مرة أخرى:* ${order.order_code}`
  ].filter(Boolean).join("\n");
}

function saveOrderToHistory(order) {
  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
}

function openWhatsApp(message, number) {
  const text = encodeURIComponent(message || "");
  const to = String(number || "").replace(/\D/g, "");
  window.open(`https://wa.me/${to}?text=${text}`, "_blank");
}

function renderOrderSuccess(oid) {
  const order = findOrderByCode(oid);
  const codeEl = $("orderSuccessCode");
  const summaryEl = $("orderSuccessSummary");
  const itemsEl = $("orderSuccessItems");
  const totalsEl = $("orderSuccessTotals");
  const customerEl = $("orderSuccessCustomer");
  if (!codeEl || !summaryEl || !itemsEl || !totalsEl || !customerEl) return;
  if (!order) {
    codeEl.textContent = oid || "-";
    summaryEl.innerHTML = `<p class='empty-state'>تعذر العثور على الطلب.</p>`;
    itemsEl.innerHTML = "";
    totalsEl.innerHTML = "";
    customerEl.innerHTML = "";
    return;
  }
  const distinctItems = order.items.length;
  const totalPieces = order.items.reduce((s, i) => s + asNum(i.qty, 0), 0);
  codeEl.textContent = order.order_code;
  summaryEl.innerHTML = `<p>عدد الأصناف: <strong>${distinctItems}</strong></p><p>إجمالي القطع: <strong>${totalPieces}</strong></p>`;
  itemsEl.innerHTML = order.items.map((i) => `<article class='order-success-item'><strong>${i.name}</strong><p>الكمية: ${i.qty}</p><p>سعر الوحدة: ${formatMoney(i.price)}</p><p>إجمالي الصنف: ${formatMoney(i.qty * i.price)}</p></article>`).join("");
  totalsEl.innerHTML = `<p>الإجمالي الفرعي: <strong>${formatMoney(order.subtotal)}</strong></p><p>الشحن: <strong>${formatMoney(order.shipping)}</strong></p><p>الإجمالي النهائي: <strong>${formatMoney(order.total)}</strong></p>`;
  customerEl.innerHTML = `<p>الاسم: ${order.customer?.name || "-"}</p><p>الموبايل: ${order.customer?.phone || "-"}</p><p>المنطقة: ${order.customer?.area || "-"}</p><p>العنوان: ${order.customer?.address || "-"}</p>${order.customer?.notes ? `<p>ملاحظات: ${order.customer.notes}</p>` : ""}`;
  $("copyOrderCodeBtn").onclick = async () => {
    const ok = await copyToClipboard(order.order_code);
    showToast(ok ? "تم نسخ الكود" : "تعذر نسخ الكود");
  };
  $("orderSuccessWhatsappBtn").onclick = () => openWhatsApp(order.whatsapp_message, order.whatsapp_number);
  $("orderSuccessContinueBtn").onclick = () => updateRoute({ view: state.currentCategory ? "category" : "home", cat: state.currentCategory, sub: "", brand: "", q: "" }, { scroll: "top" });
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

function renderOrdersModal() {
  const orders = getOrders();
  $("ordersList").innerHTML = orders.length ? orders.map((o, idx) => `<article class='card order-card'>
    <h4>كود الطلب: ${o.order_code || "-"}</h4>
    <p>التاريخ: ${new Date(o.created_at).toLocaleString("ar-EG")}</p>
    <p>الإجمالي: ${formatMoney(o.total)} - المنتجات: ${o.items.length}</p>
    <button class='text-link' data-open-order='${o.order_code || ""}'>فتح صفحة النجاح</button>
    <details>
      <summary>عرض التفاصيل</summary>
      <ul>${o.items.map((i) => `<li>${i.name} × ${i.qty}</li>`).join("")}</ul>
    </details>
    <button class='btn btn-secondary' data-reorder='${idx}'>إعادة الطلب</button>
  </article>`).join("") : `<p class='empty-state'>لا توجد طلبات سابقة.</p>`;
  $("ordersList").querySelectorAll("button[data-open-order]").forEach((btn) => btn.onclick = () => {
    closeOrdersModal();
    updateRoute({ view: "order_success", oid: btn.dataset.openOrder }, { scroll: "top" });
  });

  $("ordersList").querySelectorAll("button[data-reorder]").forEach((btn) => btn.onclick = () => {
    const order = orders[Number(btn.dataset.reorder)];
    if (!order) return;
    state.cart = order.items.map((i) => ({ ...i }));
    saveCart();
    renderCart();
    showToast("تمت إعادة الطلب إلى السلة");
    closeOrdersModal();
  });
}

function openOrdersModal() {
  renderOrdersModal();
  $("ordersModal").classList.remove("hidden");
}

function closeOrdersModal() {
  $("ordersModal").classList.add("hidden");
}

function renderAuthUI() {
  const isLoggedIn = Boolean(state.currentUser);
  $("authBtn").classList.toggle("hidden", isLoggedIn);
  $("userMenuWrap").classList.toggle("hidden", !isLoggedIn);
  if (isLoggedIn) {
    $("userMenuBtn").textContent = state.currentUser.name;
  }
}

function setAuthTab(tab) {
  $("authTabs").querySelectorAll("button[data-tab]").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  $("loginForm").classList.toggle("hidden", tab !== "login");
  $("registerForm").classList.toggle("hidden", tab !== "register");
}

function openAuthModal(defaultTab = "login") {
  setAuthTab(defaultTab);
  $("authModal").classList.remove("hidden");
}

function closeAuthModal() {
  $("authModal").classList.add("hidden");
}

function render() {
  renderHeaderCategories();
  renderAuthUI();
  document.title = "المصدر";
  $("homeView").classList.toggle("hidden", state.currentView !== "home");
  $("categoryView").classList.toggle("hidden", state.currentView !== "category");
  $("productView").classList.toggle("hidden", state.currentView !== "product");
  $("favoritesView").classList.toggle("hidden", state.currentView !== "favorites");
  $("orderSuccessView").classList.toggle("hidden", state.currentView !== "order_success");
  if (state.currentView === "home") renderHome();
  else if (state.currentView === "category") renderCategory();
  else if (state.currentView === "product") renderProduct(state.currentProductId);
  else if (state.currentView === "favorites") renderFavorites();
  else if (state.currentView === "order_success") renderOrderSuccess(state.currentOrderCode);
  renderSearch();
  if (!(state.currentView === "category" || state.currentView === "search")) {
    $("mobileFiltersBar")?.classList.add("hidden");
    document.body.classList.remove("has-mobile-filters");
  }
  $("searchInput").value = state.searchQuery;
  renderCart();
}

function bindStaticEvents() {
  $("searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("searchInput").value.trim();
    updateRoute({ view: "search", cat: state.currentCategory, sub: state.selectedSubcategory, brand: state.selectedBrand, q });
  });
  $("clearSearchBtn").onclick = () => updateRoute({ view: state.currentView === "search" ? "home" : state.currentView, cat: state.currentCategory, sub: state.selectedSubcategory, brand: state.selectedBrand, q: "" });
  $("openFiltersBtn").onclick = () => openFiltersSheet();
  $("closeFiltersSheetBtn").onclick = () => closeFiltersSheet();
  $("filtersSheetOverlay").onclick = () => closeFiltersSheet();

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
  $("favoritesBtn").onclick = () => updateRoute({ view: "favorites", cat: state.currentCategory, sub: state.selectedSubcategory, brand: state.selectedBrand, q: state.searchQuery }, { scroll: "top" });
  $("cartBtn").onclick = open;
  $("closeCart").onclick = close;
  $("cartBackdrop").onclick = close;

  $("authBtn").onclick = () => openAuthModal("login");
  $("closeAuthModal").onclick = closeAuthModal;
  $("authModal").addEventListener("click", (e) => {
    if (e.target.id === "authModal") closeAuthModal();
  });
  $("authTabs").querySelectorAll("button[data-tab]").forEach((btn) => btn.onclick = () => setAuthTab(btn.dataset.tab));

  $("userMenuBtn").onclick = () => $("userMenuList").classList.toggle("hidden");
  $("logoutBtn").onclick = () => {
    setCurrentUser(null);
    $("userMenuList").classList.add("hidden");
  };
  $("myOrdersBtn").onclick = () => {
    $("userMenuList").classList.add("hidden");
    openOrdersModal();
  };
  $("closeOrdersModal").onclick = closeOrdersModal;
  $("ordersModal").addEventListener("click", (e) => {
    if (e.target.id === "ordersModal") closeOrdersModal();
  });

  $("registerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const phone = normalizePhone(fd.get("phone"));
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm_password") || "");
    if (!name || phone.length < 10) return ($("registerErrors").textContent = "يرجى إدخال اسم ورقم هاتف صحيح (10 أرقام على الأقل).");
    if (password.length < 6) return ($("registerErrors").textContent = "كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
    if (password !== confirm) return ($("registerErrors").textContent = "تأكيد كلمة المرور غير مطابق.");
    const users = getUsers();
    if (users.some((u) => normalizePhone(u.phone) === phone)) return ($("registerErrors").textContent = "رقم الهاتف مسجل بالفعل.");
    users.push({ name, phone, pass_hash_or_plain: password, created_at: new Date().toISOString() });
    saveUsers(users);
    $("registerErrors").textContent = "تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول الآن.";
    setAuthTab("login");
  });

  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phone = normalizePhone(fd.get("phone"));
    const password = String(fd.get("password") || "");
    const found = getUsers().find((u) => normalizePhone(u.phone) === phone && String(u.pass_hash_or_plain) === password);
    if (!found) return ($("loginErrors").textContent = "بيانات الدخول غير صحيحة.");
    mergeGuestCartIntoUser(found.phone);
    setCurrentUser({ name: found.name, phone: found.phone });
    closeAuthModal();
    showToast("تم تسجيل الدخول بنجاح");
  });

  $("checkoutForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.cart.length) return ($("formErrors").textContent = "السلة فارغة.");
    const customer = getCustomerFormData();
    if (!customer) return;

    let order = buildOrderFromCartAndForm(customer);
    if (isTruthy(state.data.settings.write_orders || FALLBACK_SETTINGS.write_orders)) {
      try {
        const result = await postOrder(customer);
        if (result?.order_id) order.order_code = String(result.order_id);
      } catch (_) {}
    }

    order.order_code = getOrGenerateOrderCode(order);
    order.whatsapp_message = buildWhatsAppOrderMessage(order);
    saveOrderToHistory(order);
    openWhatsApp(order.whatsapp_message, order.whatsapp_number);

    state.cart = [];
    saveCart();
    renderCart();
    showToast("تم إنشاء الطلب");
    updateRoute({ view: "order_success", oid: order.order_code }, { scroll: "top" });
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
      const order = buildOrderFromCartAndForm(customer);
      order.order_code = result?.order_id ? String(result.order_id) : getOrGenerateOrderCode(order);
      order.whatsapp_message = buildWhatsAppOrderMessage(order);
      saveOrderToHistory(order);
      state.cart = [];
      saveCart();
      renderCart();
      showToast("تم تسجيل الطلب");
    } catch (err) {
      $("orderStatus").textContent = "تعذر تسجيل الطلب حالياً.";
    }
  };

  $("closeLightboxBtn")?.addEventListener("click", () => {
    $("imageLightbox")?.classList.add("hidden");
    $("imageLightbox")?.setAttribute("aria-hidden", "true");
  });
  $("imageLightbox")?.addEventListener("click", (e) => {
    if (e.target.id === "imageLightbox") {
      $("imageLightbox")?.classList.add("hidden");
      $("imageLightbox")?.setAttribute("aria-hidden", "true");
    }
  });
  const topBtn = $("scrollTopBtn");
  const toggleTopBtn = () => topBtn?.classList.toggle("show", window.scrollY > 400);
  window.addEventListener("scroll", toggleTopBtn);
  toggleTopBtn();
  topBtn && (topBtn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" }));

  window.__goHome = () => updateRoute({ view: "home", cat: "", sub: "", brand: "", q: "" }, { scroll: "top" });
}

(async function init() {
  try {
    setLoading(true);
    clearCacheWhenRefreshRequested();
    loadCurrentUser();
    loadCart();
    bindStaticEvents();
    if (!location.search) {
      const last = localStorage.getItem("msdr_last_route");
      if (last) history.replaceState({}, "", `${location.pathname}${last}`);
    }
    syncStateFromRoute();
    ["category", "search", "favorites", "similar"].forEach(ensureLimit);
    await loadData();
    state.isLoading = false;
    setLoading(false);
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
    setLoading(false);
    $("appRoot").innerHTML = `<div class='panel empty-state'>تعذر تحميل بيانات المتجر حالياً. يرجى المحاولة لاحقاً.</div>`;
  }
})();
