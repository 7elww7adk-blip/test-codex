 codex/understand-arabic-language-okhsdu
const APPS_SCRIPT_URL = "";

const DEFAULT_DATA = {
  categories: [
    ["كهرباء", "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=700&q=80"],
    ["تكييفات", "https://images.unsplash.com/photo-1581275231592-4a2d6d65f1b8?auto=format&fit=crop&w=700&q=80"],
    ["سباكة", "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=700&q=80"],
    ["حمام ومطبخ", "https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&w=700&q=80"],
    ["إضاءة", "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=700&q=80"],
    ["الأجهزة الكهربائية", "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?auto=format&fit=crop&w=700&q=80"],
    ["الأرضيات وتجاليد الحوائط", "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=700&q=80"],
    ["العدد والمستلزمات", "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=700&q=80"]
  ],
  heroBanners: [
    "https://i.postimg.cc/85RrXLmS/Banner_Webcopy51489383142.webp",
    "https://i.postimg.cc/d12TNGjc/Banner_AR1038069354.webp",
    "https://i.postimg.cc/0QYJX70R/regrand_web_banner_ar1385672365.webp"
  ],
  products: [
    { name: "مفتاح تحويل 40A", price: 128.3, old: 140, brand: "شنايدر", code: "R9SC0240", image: "https://m.media-amazon.com/images/I/41Q6T3lY6aL._AC_SX679_.jpg" },
    { name: "مقبس Cat 6", price: 181.28, old: 199, brand: "بتشينو", code: "AM5979C6E", image: "https://m.media-amazon.com/images/I/51uM6DaU2pL._AC_SX679_.jpg" },
    { name: "سلك نحاس شعر - 100 متر", price: 1511.82, old: 1717.98, brand: "السويدي", code: "EC1.5FR", image: "https://m.media-amazon.com/images/I/71c-g6f2WDL._AC_SX679_.jpg" },
    { name: "بريزة شوكو 16 أمبير", price: 89.46, old: 99.4, brand: "بتشينو", code: "AM5440", image: "https://m.media-amazon.com/images/I/61DX6Ryf7LL._AC_SX679_.jpg" },
    { name: "مفتاح 4P 63A", price: 3719.1, old: 3900, brand: "شنايدر", code: "R9SC0463", image: "https://m.media-amazon.com/images/I/61SeAwvTjIL._AC_SX679_.jpg" }
  ],
  brands: [
    ["اي بي بي", "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/ABB_logo.svg/512px-ABB_logo.svg.png"],
    ["بتشينو", "https://upload.wikimedia.org/wikipedia/commons/5/5f/BTicino_logo.png"],
    ["شنايدر", "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Schneider_Electric_2007.svg/512px-Schneider_Electric_2007.svg.png"],
    ["السويدي", "https://upload.wikimedia.org/wikipedia/commons/4/42/Elsewedy_Electric_logo.png"],
    ["علاء الدين", "https://dummyimage.com/300x120/ffffff/d2aa31&text=Alaa+Eldin"],
    ["بيت الهندسة", "https://dummyimage.com/300x120/ffffff/0f9d58&text=Engineering+House"]
  ]
};

const normalizeData = (payload) => ({
  categories: Array.isArray(payload.categories) ? payload.categories : DEFAULT_DATA.categories,
  heroBanners: Array.isArray(payload.heroBanners) && payload.heroBanners.length ? payload.heroBanners : DEFAULT_DATA.heroBanners,
  products: Array.isArray(payload.products) ? payload.products : DEFAULT_DATA.products,
  brands: Array.isArray(payload.brands) ? payload.brands : DEFAULT_DATA.brands
});

const setSourceLabel = (text) => {
  const sourceLabel = document.getElementById("dataSource");
  if (sourceLabel) sourceLabel.textContent = text;
};

const loadStoreData = async () => {
  if (!APPS_SCRIPT_URL) {
    setSourceLabel("البيانات الحالية: محلية (Fallback)");
    return DEFAULT_DATA;
  }

  try {
    const response = await fetch(APPS_SCRIPT_URL, { method: "GET" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    setSourceLabel("البيانات الحالية: Google Sheets");
    return normalizeData(payload);
  } catch (error) {
    console.error("Failed to load Apps Script data", error);
    setSourceLabel("تعذر الاتصال بـ Google Sheets - تم استخدام البيانات المحلية");
    return DEFAULT_DATA;
  }
};

const setupHeroSlider = (heroBanners) => {
const categories = [
  ["كهرباء", "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=700&q=80"],
  ["تكييفات", "https://images.unsplash.com/photo-1581275231592-4a2d6d65f1b8?auto=format&fit=crop&w=700&q=80"],
  ["سباكة", "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=700&q=80"],
  ["حمام ومطبخ", "https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&w=700&q=80"],
  ["إضاءة", "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=700&q=80"],
  ["الأجهزة الكهربائية", "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?auto=format&fit=crop&w=700&q=80"],
  ["الأرضيات وتجاليد الحوائط", "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=700&q=80"],
  ["العدد والمستلزمات", "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=700&q=80"]
];

const heroBanners = [
  "https://i.postimg.cc/85RrXLmS/Banner_Webcopy51489383142.webp",
  "https://i.postimg.cc/d12TNGjc/Banner_AR1038069354.webp",
  "https://i.postimg.cc/0QYJX70R/regrand_web_banner_ar1385672365.webp"
];

const products = [
  { name: "مفتاح تحويل 40A", price: 128.3, old: 140, brand: "شنايدر", code: "R9SC0240", image: "https://m.media-amazon.com/images/I/41Q6T3lY6aL._AC_SX679_.jpg" },
  { name: "مقبس Cat 6", price: 181.28, old: 199, brand: "بتشينو", code: "AM5979C6E", image: "https://m.media-amazon.com/images/I/51uM6DaU2pL._AC_SX679_.jpg" },
  { name: "سلك نحاس شعر - 100 متر", price: 1511.82, old: 1717.98, brand: "السويدي", code: "EC1.5FR", image: "https://m.media-amazon.com/images/I/71c-g6f2WDL._AC_SX679_.jpg" },
  { name: "بريزة شوكو 16 أمبير", price: 89.46, old: 99.4, brand: "بتشينو", code: "AM5440", image: "https://m.media-amazon.com/images/I/61DX6Ryf7LL._AC_SX679_.jpg" },
  { name: "مفتاح 4P 63A", price: 3719.1, old: 3900, brand: "شنايدر", code: "R9SC0463", image: "https://m.media-amazon.com/images/I/61SeAwvTjIL._AC_SX679_.jpg" }
];

const brands = [
  ["اي بي بي", "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/ABB_logo.svg/512px-ABB_logo.svg.png"],
  ["بتشينو", "https://upload.wikimedia.org/wikipedia/commons/5/5f/BTicino_logo.png"],
  ["شنايدر", "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Schneider_Electric_2007.svg/512px-Schneider_Electric_2007.svg.png"],
  ["السويدي", "https://upload.wikimedia.org/wikipedia/commons/4/42/Elsewedy_Electric_logo.png"],
  ["علاء الدين", "https://dummyimage.com/300x120/ffffff/d2aa31&text=Alaa+Eldin"],
  ["بيت الهندسة", "https://dummyimage.com/300x120/ffffff/0f9d58&text=Engineering+House"]
];

const setupHeroSlider = () => {
 main
  const heroImage = document.getElementById("heroImage");
  const dotsWrap = document.getElementById("heroDots");

  if (!heroImage || !dotsWrap || heroBanners.length === 0) return;

  let current = 0;

  const renderDots = () => {
    dotsWrap.innerHTML = "";
    heroBanners.forEach((_, idx) => {
      const dot = document.createElement("button");
      dot.className = `dot ${idx === current ? "active" : ""}`;
      dot.setAttribute("aria-label", `بنر ${idx + 1}`);
      dot.addEventListener("click", () => {
        current = idx;
        updateHero();
      });
      dotsWrap.appendChild(dot);
    });
  };

  const updateHero = () => {
    heroImage.src = heroBanners[current];
    heroImage.alt = `بنر رئيسي ${current + 1}`;
    renderDots();
  };

  updateHero();

  setInterval(() => {
    current = (current + 1) % heroBanners.length;
    updateHero();
  }, 4500);
};

 codex/understand-arabic-language-okhsdu
const render = async () => {
  const data = await loadStoreData();
  const { categories, products, brands, heroBanners } = data;

=======
const render = () => {
 main
  const nav = document.getElementById("navCats");
  const latestChips = document.getElementById("latestChips");
  const bestChips = document.getElementById("bestChips");
  const brandChips = document.getElementById("brandChips");

  categories.forEach(([name]) => {
    [nav, latestChips, bestChips, brandChips].forEach((container) => {
      const span = document.createElement("span");
      span.className = "pill";
      span.textContent = name;
      container.appendChild(span);
    });
  });

  const categoriesGrid = document.getElementById("categoriesGrid");
  categories.forEach(([name, image]) => {
    const card = document.createElement("article");
    card.className = "cat-item";
    card.innerHTML = `<img src="${image}" alt="${name}"/><b>${name}</b>`;
    categoriesGrid.appendChild(card);
  });

 codex/understand-arabic-language-okhsdu
  const productTemplate = (p) => {
    const price = Number(p.price || 0);
    const old = Number(p.old || 0);
    return `
      <article class="product">
        <img src="${p.image}" alt="${p.name}" />
        <h4>${p.name}</h4>
        <div>
          <span class="price">${price.toLocaleString("ar-EG")} جنيه</span>
          <span class="old">${old.toLocaleString("ar-EG")} جنيه</span>
        </div>
        <p>الماركة: ${p.brand || "-"}</p>
        <small>الكود: ${p.code || "-"}</small>
      </article>`;
  };
=======
  const productTemplate = (p) => `
    <article class="product">
      <img src="${p.image}" alt="${p.name}" />
      <h4>${p.name}</h4>
      <div><span class="price">${p.price.toLocaleString("ar-EG")} جنيه</span>
      <span class="old">${p.old.toLocaleString("ar-EG")} جنيه</span></div>
      <p>الماركة: ${p.brand}</p>
      <small>الكود: ${p.code}</small>
    </article>`;
 main

  document.getElementById("latestProducts").innerHTML = products.map(productTemplate).join("");
  document.getElementById("bestProducts").innerHTML = [...products].reverse().map(productTemplate).join("");

  const brandGrid = document.getElementById("brandsGrid");
  brands.forEach(([name, logo]) => {
    const el = document.createElement("article");
    el.className = "brand-card";
    el.innerHTML = `<img src="${logo}" alt="${name}"/><h4>${name}</h4>`;
    brandGrid.appendChild(el);
  });

 codex/understand-arabic-language-okhsdu
  setupHeroSlider(heroBanners);
=======
  setupHeroSlider();
 main
};

render();
