/* Shared helpers used by both the site and the snapshot fetcher (tools/fetch-flipp.mjs).
   No prices live in this file - everything comes from live weekly ads. */

const STORE_INFO = [
  { id: "smiths", re: /smith/i, name: "Smith's", color: "#0b5ed7" },
  { id: "walmart", re: /walmart/i, name: "Walmart", color: "#0071ce" },
  { id: "costco", re: /costco/i, name: "Costco", color: "#d50032" },
  { id: "target", re: /target/i, name: "Target", color: "#cc0000" },
  { id: "aldi", re: /aldi/i, name: "Aldi", color: "#f59e0b" },
  { id: "kroger", re: /kroger/i, name: "Kroger", color: "#1d4ed8" },
  { id: "traderjoes", re: /trader joe/i, name: "Trader Joe's", color: "#15803d" },
  { id: "wholefoods", re: /whole foods/i, name: "Whole Foods", color: "#166534" },
  { id: "sprouts", re: /sprouts/i, name: "Sprouts", color: "#3f8f4f" },
  { id: "reams", re: /reams/i, name: "Reams", color: "#7c3aed" },
  { id: "lucky", re: /lucky/i, name: "Lucky", color: "#dc2626" },
  { id: "albertsons", re: /albertsons/i, name: "Albertsons", color: "#2563eb" },
  { id: "dans", re: /dan'?s/i, name: "Dan's Fresh Market", color: "#0d9488" },
  { id: "freshmarket", re: /fresh market/i, name: "Fresh Market", color: "#059669" },
  { id: "sams", re: /sam'?s club/i, name: "Sam's Club", color: "#0067a0" },
  { id: "safeway", re: /safeway/i, name: "Safeway", color: "#e11d48" },
  { id: "harmons", re: /harmons/i, name: "Harmons", color: "#b45309" },
  { id: "winco", re: /winco/i, name: "WinCo", color: "#1e40af" },
  { id: "maceys", re: /macey'?s/i, name: "Macey's", color: "#b91c1c" },
  { id: "dollargeneral", re: /dollar general/i, name: "Dollar General", color: "#ca8a04" },
  { id: "familydollar", re: /family dollar/i, name: "Family Dollar", color: "#dc2626" },
  { id: "walgreens", re: /walgreens/i, name: "Walgreens", color: "#be123c" },
  { id: "cvs", re: /cvs/i, name: "CVS", color: "#dc2626" },
];

const PALETTE = ["#0b5ed7", "#d50032", "#15803d", "#f59e0b", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5"];

const CATEGORY_WORDS = {
  "Frozen": ["frozen", "ice cream", "popsicle", "novelty", "frozen pizza", "frozen dinner", "frozen fruit", "frozen vegetable"],
  "Dairy & Eggs": ["milk", "almond milk", "soy milk", "oat milk", "cheese", "yogurt", "butter", "egg", "cream", "cottage cheese", "sour cream", "half and half", "creamer", "dairy"],
  "Meat & Seafood": ["chicken breast", "chicken", "ground beef", "beef", "pork", "turkey", "bacon", "sausage", "ham", "fish", "salmon", "shrimp", "tuna", "steak", "rib", "brisket", "wing", "thigh", "breast", "deli meat", "hot dog", "seafood", "meat"],
  "Bakery": ["bread", "bagel", "tortilla", "bun", "roll", "muffin", "croissant", "cake", "pie", "donut", "bakery", "baguette"],
  "Produce": ["apple", "banana", "orange", "grape", "berry", "strawberry", "blueberry", "raspberry", "blackberry", "avocado", "tomato", "potato", "sweet potato", "onion", "lettuce", "spinach", "kale", "carrot", "broccoli", "cucumber", "bell pepper", "mushroom", "corn", "celery", "cabbage", "zucchini", "squash", "melon", "watermelon", "pineapple", "mango", "peach", "pear", "lemon", "lime", "produce"],
  "Household": ["paper towel", "toilet paper", "trash bag", "detergent", "laundry detergent", "dish soap", "soap", "shampoo", "toothpaste", "cleaner", "disinfect", "tissue", "diaper", "wipes", "foil", "wrap", "sponge", "dishwasher", "laundry", "bleach", "deodorant", "body wash", "razor", "floss", "paper plate", "napkin", "kitchen towel"],
  "Beverages": ["coffee", "tea", "orange juice", "apple juice", "juice", "soda", "cola", "pepsi", "sprite", "sparkling water", "water", "sparkling", "energy drink", "sports drink", "beer", "wine", "seltzer", "drink", "kombucha", "lemonade", "cider"],
  "Snacks": ["chips", "cookie", "cracker", "candy", "chocolate", "pretzel", "popcorn", "nuts", "peanut", "almond", "cashew", "granola bar", "protein bar", "snack", "trail mix", "raisin", "fruit snack"],
  "Pantry": ["rice", "pasta", "spaghetti", "noodle", "cereal", "oat", "flour", "sugar", "salt", "oil", "vinegar", "sauce", "ketchup", "mustard", "mayo", "peanut butter", "jelly", "jam", "honey", "soup", "broth", "stock", "bean", "canned", "lentil", "spice", "seasoning", "dressing", "baking", "canned tomato", "pumpkin", "stuffing", "gravy", "cranberry", "yams", "pasta sauce", "mac and cheese", "ramen", "cake mix"],
};

const CATEGORY_NAMES = Object.keys(CATEGORY_WORDS);

const EXTRA_GROCERY_TERMS = [
  "grocery", "organic", "gluten free", "produce", "deli", "bakery",
  "instant", "canned", "sauce", "dressing", "spice", "seasoning", "flour",
  "sugar", "oil", "vinegar", "soup", "broth", "stock", "juice", "soda",
  "water", "coffee", "tea", "chips", "cookies", "crackers", "candy",
  "chocolate", "nuts", "peanut", "almond", "raisin", "granola", "yogurt",
  "cheese", "milk", "bread", "eggs", "butter", "chicken", "beef", "pork",
  "turkey", "fish", "shrimp", "salmon", "tuna", "bacon", "sausage",
  "ham", "apple", "banana", "orange", "grape", "berry", "avocado", "tomato",
  "potato", "onion", "lettuce", "spinach", "carrot", "broccoli", "cucumber",
  "pepper", "mushroom", "corn", "bean", "peas", "rice", "paper towel",
  "toilet paper", "detergent", "soap", "shampoo", "toothpaste", "trash",
  "cleaner", "tissue", "diaper", "wipes", "foil", "wrap",
];

const GROCERY_TERMS = [...new Set([...Object.values(CATEGORY_WORDS).flat(), ...EXTRA_GROCERY_TERMS])];

// hard blocklist so TVs, shoes, toys and salon products can't sneak in on a word like "apple" or "water"
const NON_GROCERY_RE = /\b(watch|smartwatch|airpods?|headphones?|earbuds?|headset|speaker|laptop|tablet|phone|camera|television|gaming|console|controller|lego|toy|toys|plush|doll|dog|cat|pet|boots?|shoes?|sneakers?|sandals?|slippers?|shirt|pants|jacket|coat|dress|socks?|underwear|pajamas?|bedding|mattress|pillow|blanket|furniture|chair|sofa|lamp|rug|carpet|curtain|maker|machine|blender|mixer|fryer|oven|microwave|cookware|vacuum|tool|tire|battery|charger|makeup|mascara|lipstick|perfume|cologne|spray|bouquet|flowers?|floral|wreath|decor|ornament|candle|balloon|gift card|party|costume|jewelry|necklace|bracelet|ring|earring|sunglasses|backpack|purse|wallet|suitcase|luggage|game|games)\b/i;

const GENERIC_NAME_RE = /^(assorted|select|various|choice of)\b.*(products?|varieties|items?)$/i;

function storeInfo(merchant) {
  const raw = String(merchant || "").trim();
  const known = STORE_INFO.find(s => s.re.test(raw));
  if (known) return { id: known.id, name: known.name, color: known.color };
  const id = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "store";
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { id, name: raw, color: PALETTE[h % PALETTE.length] };
}

function termHit(low, term) {
  if (term.length <= 4) return new RegExp(`\\b${term}(s|es)?\\b`, "i").test(low);
  return low.includes(term);
}

function classify(name) {
  const low = String(name).toLowerCase();
  let best = "Other", bestScore = 0;
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
    let score = 0;
    for (const w of words) if (termHit(low, w)) score += w.length > 6 ? 2 : 1;
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return best;
}

function isGroceryName(name) {
  const low = String(name).toLowerCase();
  if (NON_GROCERY_RE.test(name)) return false;
  if (GENERIC_NAME_RE.test(name.trim())) return false;
  return GROCERY_TERMS.some(t => termHit(low, t));
}

function parseUnit(name) {
  const m = String(name).match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounces?|oz|ounces?|lbs?|pounds?|ct|count|sheets?|rolls?|gal|gallons?|qt|quarts?|pt|pints?|kg|ml|g|l)\b/i);
  if (!m) return { unitQty: null, unitName: null };
  const qty = parseFloat(m[1]);
  let u = m[2].toLowerCase().replace(/\./g, "").trim();
  const map = {
    "fl oz": "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz",
    oz: "oz", ounce: "oz", ounces: "oz",
    lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
    ct: "ea", count: "ea", sheet: "sheet", sheets: "sheet",
    roll: "roll", rolls: "roll",
    gal: "gal", gallon: "gal", gallons: "gal",
    qt: "qt", quart: "qt", quarts: "qt", pt: "pt", pint: "pt", pints: "pt",
    kg: "kg", g: "g", ml: "ml", l: "L",
  };
  if (!map[u] || !(qty > 0)) return { unitQty: null, unitName: null };
  return { unitQty: qty, unitName: map[u] };
}

function normalizeName(name) {
  return String(name || "").toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(select varieties|assorted|family size|new|bonus|value pack)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

function itemId(store, name, price) {
  let h = 5381;
  const s = `${store}|${name}|${price}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const FLYER_BAD_NAMES = /home\s*&\s*apparel|toy book|black friday|pharmacy|beauty|jewelry|electronics|furniture|appliance|auto|sports|clothing|seasonal|halloween|christmas|gift guide/i;
const GROCERY_MERCHANT_RE = /smith|walmart|costco|target|aldi|kroger|whole foods|trader joe|sprouts|sam'?s club|reams|lucky|harmons|winco|maceys?|fresh market|dan'?s|safeway|albertsons|food|grocery|market/i;
const MIXED_MERCHANT_RE = /target|walmart|dollar general|family dollar|walgreens|cvs/i;

function selectFlyers(flyers) {
  const byMerchant = new Map();
  for (const f of flyers || []) {
    const merchant = String(f.merchant || "").trim();
    const cats = String(f.categories_csv || "");
    const name = String(f.name || "");
    if (!merchant || !f.id) continue;
    if (FLYER_BAD_NAMES.test(name)) continue;
    if (!cats.includes("Groceries") && !GROCERY_MERCHANT_RE.test(merchant)) continue;
    let score = 0;
    if (cats.includes("Groceries")) score += 4;
    if (/weekly|circular|bi-weekly|current ad|indexed/i.test(name)) score += 2;
    if (/grocery/i.test(name)) score += 2;
    const started = Date.parse(f.valid_from || "") || 0;
    const key = merchant.toLowerCase();
    const prev = byMerchant.get(key);
    if (!prev || score > prev.score || (score === prev.score && started > prev.started)) {
      byMerchant.set(key, { flyer: f, score, started });
    }
  }
  return [...byMerchant.values()].map(v => v.flyer);
}

function makeCatalog({ zip, place, updated, source, pairs }) {
  const storesById = new Map();
  const seen = new Set();
  const items = [];
  const perStore = new Map();

  for (const pair of pairs || []) {
    const flyer = pair.flyer;
    const detail = pair.detail;
    if (!flyer || !detail) continue;
    const info = storeInfo(flyer.merchant);
    const mixed = MIXED_MERCHANT_RE.test(flyer.merchant || "");
    const validTo = String(flyer.valid_to || flyer.available_to || "").slice(0, 10);
    let added = perStore.get(info.id) || 0;

    for (const it of detail.items || []) {
      if (added >= 160) break;
      const name = String(it.name || "").trim();
      const price = parseFloat(it.price);
      if (!(price > 0) || price > 300) continue;
      if (name.length < 3 || name.length > 140) continue;
      if (!/[a-z]/i.test(name)) continue;
      if (/cover|banner|placeholder/i.test(name)) continue;
      if (/^[a-z0-9_\-]{12,}$/i.test(name)) continue;
      if (!isGroceryName(name)) continue;
      if (mixed && classify(name) === "Other") continue;

      const id = itemId(info.id, name, price);
      if (seen.has(id)) continue;
      seen.add(id);

      const { unitQty, unitName } = parseUnit(name);
      items.push({
        id,
        name,
        brand: String(it.brand || "").trim(),
        price: Math.round(price * 100) / 100,
        store: info.id,
        validTo,
        category: classify(name),
        unitQty,
        unitName,
      });
      added++;
    }

    if (added > 0) {
      storesById.set(info.id, info);
      perStore.set(info.id, added);
    }
  }

  items.sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name));
  return {
    source: source || "Weekly store ads",
    updated: updated || new Date().toISOString().slice(0, 10),
    zip: zip || "",
    place: place || "",
    stores: [...storesById.values()],
    items,
  };
}
