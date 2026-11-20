const $ = (s) => document.querySelector(s);
const FLIPP = "https://backflipp.wishabi.com/flipp";

const CAT_ICON = {
  "All": "🛒", "Produce": "🥦", "Dairy & Eggs": "🥛", "Bakery": "🍞",
  "Meat & Seafood": "🥩", "Pantry": "🫙", "Frozen": "🧊", "Snacks": "🍪",
  "Beverages": "🥤", "Household": "🧻", "Other": "🧺",
};

const state = {
  catalog: null,
  groups: [],
  groupByKey: new Map(),
  storeItems: new Map(),
  activeCat: "All",
  sort: "cheap",
  limit: 60,
  loading: false,
  zip: "",
  place: "",
  geo: {},
  geoStatus: "idle",
  listMode: "balance",
  shelf: null,
};

const MILE_RATE = 0.67; // gas + wear per mile, used by "best balance"

let offStores = new Set(JSON.parse(localStorage.getItem("pc-off") || "[]"));
let basket = JSON.parse(localStorage.getItem("pc-basket") || "{}");
let loc = JSON.parse(localStorage.getItem("pc-loc") || "null");

const grid = $("#grid"), searchEl = $("#search"), clearBtn = $("#clearSearch");
const storesEl = $("#stores"), catsEl = $("#cats"), sortEl = $("#sort");
const metaEl = $("#meta"), emptyEl = $("#empty"), bannerEl = $("#banner");
const moreBtn = $("#moreBtn");

const money = (n) => "$" + n.toFixed(2);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const unitStr = (it) => {
  const name = it.unitPriceName || it.unitName;
  if (!name) return "";
  const u = it.unitPrice != null ? it.unitPrice : (it.unitQty ? it.price / it.unitQty : null);
  if (!(u > 0)) return "";
  return "$" + u.toFixed(u < 0.1 ? 3 : 2) + "/" + name;
};
function textHit(text, q) {
  const low = String(text || "").toLowerCase();
  const query = String(q || "").toLowerCase().trim();
  if (!query) return true;
  if (low.includes(query)) return true;
  const compact = (s) => s.replace(/[^a-z0-9]/g, "");
  if (compact(low).includes(compact(query))) return true;
  const tokens = new Set(low.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));
  return query.split(/\s+/).every((w) =>
    tokens.has(w) || tokens.has(w.replace(/s$/, "")) || tokens.has(`${w}s`) || tokens.has(w.replace(/es$/, ""))
  );
}
function sourceOf(o) {
  if (o?.kind === "shelf") return { short: "Shelf", long: "everyday shelf price", cls: "shelf" };
  return {
    short: "Ad",
    long: o?.validTo ? `weekly ad · ends ${shortDate(o.validTo)}` : "weekly ad price",
    cls: "ad",
  };
}
function cleanName(it) {
  if (!it) return "";
  let name = String(it.name || "").trim();
  const brand = String(it.brand || "").trim();
  if (brand) {
    const nb = normalizeName(brand);
    const nn = normalizeName(name);
    if (nb && nn.startsWith(nb)) {
      const rest = name.slice(brand.length).replace(/^[\s,:;-]+/, "").trim();
      if (rest.length >= 3) name = rest;
    }
  }
  return name;
}
function brandOf(it) {
  const brand = String(it?.brand || "").trim();
  if (!brand) return "";
  const nn = normalizeName(it.name || "");
  return nn.startsWith(normalizeName(brand)) ? "" : brand;
}
function sizeStr(it) {
  if (!it) return "";
  return it.size || (it.unitQty ? `${it.unitQty} ${it.unitName || ""}`.trim() : "");
}
function shortDate(s) {
  if (!s) return "";
  const d = new Date(s + "T12:00:00");
  return isNaN(d) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const storeObj = (id) =>
  (state.catalog?.stores || []).find((s) => s.id === id) || { id, name: id, color: "#888" };
const activeStoreList = () => (state.catalog?.stores || []).filter((s) => !offStores.has(s.id));
const groupOffers = (g) => g.offers.filter((o) => !offStores.has(o.store));
const groupBest = (g) => groupOffers(g)[0] || null;

// ---------- data load ----------
async function getJSON(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 25000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      try { out[idx] = await fn(list[idx], idx); }
      catch { out[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker));
  return out;
}

// ---------- shelf snapshot ----------
let shelfCatalog = null;
let shelfFlight = null;

function readShelfCache(maxAge) {
  try {
    const raw = localStorage.getItem("pc-shelf-v1");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.shelf?.items?.length) return null;
    if (maxAge > 0 && Date.now() - obj.ts > maxAge) return null;
    return obj.shelf;
  } catch { return null; }
}

function loadShelf(force = false) {
  if (shelfFlight) return shelfFlight;
  shelfFlight = (async () => {
    const cached = readShelfCache(force ? 0 : 6 * 60 * 60 * 1000);
    if (cached) { shelfCatalog = cached; state.shelf = cached; return cached; }
    try {
      const shelf = await getJSON("shelf.json?ts=" + Date.now());
      if (!shelf?.items?.length) return null;
      shelfCatalog = shelf;
      state.shelf = shelf;
      try {
        localStorage.setItem("pc-shelf-v1", JSON.stringify({ ts: Date.now(), shelf }));
      } catch {}
      return shelf;
    } catch { return null; }
  })();
  return shelfFlight;
}

function sameArea(a, b) {
  if (!a || !b) return true;
  return String(a).slice(0, 3) === String(b).slice(0, 3);
}

function mergeShelf(cat) {
  if (!cat) return cat;
  if (cat.shelfCount != null) return cat;
  const adItems = (cat.items || []).map((it) => ({
    ...it,
    kind: it.kind || "ad",
    term: it.term || bestMatchTerm(it.name),
  }));
  const merged = { ...cat, items: adItems, adCount: adItems.length, shelfCount: 0 };
  const shelf = shelfCatalog;
  if (!shelf?.items?.length) return merged;

  merged.shelfZip = shelf.zip;
  merged.shelfPlace = shelf.place || shelf.zip;
  merged.shelfUpdated = shelf.updated;
  if (!sameArea(cat.zip, shelf.zip)) return merged;

  const shelfItems = shelf.items.map((it) => ({
    ...it,
    kind: "shelf",
    term: it.term || bestMatchTerm(it.name),
    validTo: "",
  }));
  const stores = [...(cat.stores || [])];
  for (const s of shelf.stores || []) {
    if (!stores.some((x) => x.id === s.id)) stores.push({ ...s });
  }
  merged.stores = stores;
  merged.shelfCount = shelfItems.length;
  merged.items = [...adItems, ...shelfItems];
  return merged;
}

async function fetchCatalog(zip) {
  const flyerList = await getJSON(`${FLIPP}/flyers?locale=en-us&postal_code=${encodeURIComponent(zip)}`);
  const chosen = selectFlyers(flyerList.flyers || []);
  if (!chosen.length) throw new Error("No grocery ads for this area yet.");
  const pairs = await mapLimit(chosen, 5, async (flyer) => ({
    flyer,
    detail: await getJSON(`${FLIPP}/flyers/${flyer.id}?locale=en-us`),
  }));
  const cat = makeCatalog({
    zip,
    place: loc && loc.zip === zip ? loc.label : "",
    updated: new Date().toISOString().slice(0, 10),
    source: "Live weekly ads (via Flipp)",
    pairs: pairs.filter(Boolean),
  });
  if (!cat.items.length) throw new Error("No prices in this area's ads yet.");
  return cat;
}

function readCache(key, maxAge) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.cat) return null;
    if (maxAge > 0 && Date.now() - obj.ts > maxAge) return null;
    return obj.cat;
  } catch { return null; }
}

async function placeForZip(zip) {
  try {
    const j = await getJSON(`https://api.zippopotam.us/us/${zip}`);
    const p = j.places && j.places[0];
    if (p) {
      return {
        label: `${p["place name"]}, ${p["state abbreviation"]} ${zip}`,
        lat: parseFloat(p.latitude),
        lon: parseFloat(p.longitude),
      };
    }
  } catch {}
  return { label: zip, lat: null, lon: null };
}

function setCatalog(raw) {
  const cat = mergeShelf(raw);
  state.catalog = cat;
  state.zip = cat.zip || state.zip;
  state.place = cat.place || state.place;
  state.limit = 60;
  offStores = new Set([...offStores].filter((id) => cat.stores.some((s) => s.id === id)));
  const keys = new Set(cat.items.map(itemGroupKey));
  for (const key of Object.keys(basket)) if (!keys.has(key)) delete basket[key];
  persist();
  rebuildGroups();
  buildStores();
  buildCats();
  render();
  renderBasket();
}

function itemGroupKey(it) {
  const size = it.size || (it.unitQty ? `${it.unitQty} ${it.unitName || ""}` : "");
  return normalizeName(it.name) + (size ? "|" + normalizeName(size) : "");
}

function rebuildGroups() {
  const map = new Map();
  for (const it of state.catalog?.items || []) {
    const key = itemGroupKey(it);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  for (const list of map.values()) list.sort((a, b) => a.price - b.price);
  const groups = [...map.entries()].map(([key, offers]) => ({
    key,
    offers,
    name: cleanName(offers[0]),
    brand: brandOf(offers[0]),
    category: offers[0].category,
    size: sizeStr(offers[0]),
    term: offers[0].term || bestMatchTerm(offers[0].name),
  }));
  state.groups = groups;
  state.groupByKey = new Map(groups.map((g) => [g.key, g]));
  state.storeItems = new Map();
  for (const it of state.catalog?.items || []) {
    if (!state.storeItems.has(it.store)) state.storeItems.set(it.store, []);
    state.storeItems.get(it.store).push(it);
  }
}

async function useZip(zip, label, force = false, coords = null) {
  zip = String(zip).trim();
  if (!/^\d{5}$/.test(zip)) { setBanner("Enter a 5-digit ZIP code.", "warn"); return; }
  const prevLoc = loc;
  const prev = loc && loc.zip === zip ? loc : null;
  state.zip = zip;
  loc = {
    zip,
    label: label || prev?.label || zip,
    lat: coords?.lat ?? prev?.lat ?? null,
    lon: coords?.lon ?? prev?.lon ?? null,
  };
  state.geo = {};
  state.geoStatus = "idle";
  localStorage.setItem("pc-loc", JSON.stringify(loc));
  renderLocation();
  const key = `pc-ads-${zip}`;
  const cached = readCache(key, force ? 0 : 6 * 60 * 60 * 1000);
  if (cached) {
    cached.place = cached.place || loc.label || zip;
    if (!loc.label || loc.label === zip) loc.label = cached.place;
    renderLocation();
    await loadShelf();
    setCatalog(cached);
    const shelfNote = state.catalog.shelfCount ? ` + ${state.catalog.shelfCount.toLocaleString()} shelf prices` : "";
    setBanner(`Ads${shelfNote} for ${cached.place || zip} - updated ${shortDate(cached.updated)}. Tap Refresh for the newest.`, "info");
    if (loc.lat == null) ensureCoords().then(() => { if (!$("#listBack").hidden) openList(); });
    return;
  }
  state.loading = true;
  setBanner(`Pulling this week's ads for ${label || zip}\u2026`, "info");
  render();
  try {
    const cat = await fetchCatalog(zip);
    await loadShelf();
    let place = label || "";
    if (!place || loc.lat == null) {
      const p = await placeForZip(zip);
      place = place || p.label;
      if (loc.lat == null && p.lat != null) { loc.lat = p.lat; loc.lon = p.lon; }
    }
    cat.place = place || zip;
    loc.label = cat.place;
    localStorage.setItem("pc-loc", JSON.stringify(loc));
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), cat }));
    state.loading = false;
    setCatalog(cat);
    renderLocation();
    const shelfNote = state.catalog.shelfCount ? ` + ${state.catalog.shelfCount.toLocaleString()} shelf prices` : "";
    setBanner(`Live ads${shelfNote} for ${cat.place}.`, "ok");
    if (!$("#listBack").hidden) openList();
  } catch (e) {
    state.loading = false;
    const stale = readCache(key, Infinity);
    if (stale) {
      setCatalog(stale);
      setBanner(`Couldn't refresh ${label || zip}. Showing saved ads from ${shortDate(stale.updated)}.`, "warn");
    } else {
      loc = prevLoc;
      state.zip = prevLoc?.zip || "";
      if (loc) localStorage.setItem("pc-loc", JSON.stringify(loc));
      else localStorage.removeItem("pc-loc");
      renderLocation();
      const showing = state.catalog?.place || state.catalog?.zip;
      setBanner(
        showing
          ? `Couldn't load ads for ${label || zip}. Still showing ${showing}.`
          : (e.message || "Couldn't load ads. Tap Refresh to try again."),
        "warn"
      );
      render();
      if (!$("#listBack").hidden) openList();
    }
  }
}

async function ensureCoords() {
  if (!loc) return false;
  if (loc.lat != null && loc.lon != null) return true;
  if (!loc.zip) return false;
  const p = await placeForZip(loc.zip);
  if (p.lat == null) return false;
  loc.lat = p.lat;
  loc.lon = p.lon;
  if (!loc.label || loc.label === loc.zip) loc.label = p.label;
  localStorage.setItem("pc-loc", JSON.stringify(loc));
  renderLocation();
  return true;
}

async function loadSnapshot(force = false) {
  const cached = readCache("pc-ads-snapshot", force ? 0 : 30 * 60 * 1000);
  if (cached) {
    await loadShelf();
    setCatalog(cached);
    const shelfNote = state.catalog.shelfCount ? ` and ${state.catalog.shelfCount.toLocaleString()} everyday shelf prices` : "";
    setBanner(`Showing ads${shelfNote} for ${cached.place || cached.zip || "Salt Lake City"} - set your ZIP to switch areas.`, "info");
    return;
  }
  state.loading = true;
  setBanner("Loading this week's ads and shelf prices\u2026", "info");
  render();
  try {
    const [cat] = await Promise.all([getJSON("prices.json?ts=" + Date.now()), loadShelf()]);
    if (!cat.items || !cat.items.length) throw new Error("empty");
    localStorage.setItem("pc-ads-snapshot", JSON.stringify({ ts: Date.now(), cat }));
    state.loading = false;
    setCatalog(cat);
    const shelfNote = state.catalog.shelfCount ? ` and ${state.catalog.shelfCount.toLocaleString()} everyday shelf prices` : "";
    setBanner(`Showing ads${shelfNote} for ${cat.place || cat.zip || "Salt Lake City"} - set your ZIP to switch areas.`, "info");
  } catch {
    state.loading = false;
    setBanner("Set your ZIP to load this week's grocery prices.", "warn");
    render();
  }
}

// ---------- chrome ----------
function setBanner(text, tone) {
  if (!text) { bannerEl.hidden = true; return; }
  bannerEl.hidden = false;
  bannerEl.className = "banner " + (tone || "info");
  bannerEl.textContent = text;
}

function renderLocation() {
  const label = loc?.label || (state.zip ? state.zip : "");
  $("#locLabel").textContent = label ? `📍 ${label}` : "📍 Location not set";
  $("#locClear").hidden = !(loc || state.zip);
}

function buildStores() {
  storesEl.innerHTML = "";
  for (const s of state.catalog?.stores || []) {
    const b = document.createElement("button");
    b.className = "store" + (offStores.has(s.id) ? " off" : "");
    b.dataset.store = s.id;
    b.innerHTML = `<span class="dot" style="background:${s.color}"></span>${s.name}`;
    b.onclick = () => {
      offStores.has(s.id) ? offStores.delete(s.id) : offStores.add(s.id);
      persist();
      b.classList.toggle("off");
      buildCats();
      render();
      renderBasket();
    };
    storesEl.appendChild(b);
  }
}

function catCounts() {
  const counts = { All: 0 };
  for (const g of state.groups) {
    if (!groupBest(g)) continue;
    counts.All++;
    counts[g.category] = (counts[g.category] || 0) + 1;
  }
  return counts;
}

function buildCats() {
  const counts = catCounts();
  catsEl.innerHTML = "";
  for (const c of ["All", ...CATEGORY_NAMES, "Other"]) {
    if (c !== "All" && !counts[c]) continue;
    const b = document.createElement("button");
    b.className = "cat" + (c === state.activeCat ? " on" : "");
    b.dataset.cat = c;
    b.innerHTML = `${CAT_ICON[c] || "•"} ${c} <span class="cnum">${counts[c] || 0}</span>`;
    b.onclick = () => { state.activeCat = c; state.limit = 60; buildCats(); render(); };
    catsEl.appendChild(b);
  }
}

// ---------- list ----------
function persist() {
  localStorage.setItem("pc-off", JSON.stringify([...offStores]));
  localStorage.setItem("pc-basket", JSON.stringify(basket));
}

const UNIT_FACTORS = {
  "fl oz": { kind: "volume", factor: 1 },
  cup: { kind: "volume", factor: 8 },
  pt: { kind: "volume", factor: 16 },
  qt: { kind: "volume", factor: 32 },
  gal: { kind: "volume", factor: 128 },
  L: { kind: "volume", factor: 33.814 },
  ml: { kind: "volume", factor: 0.033814 },
  oz: { kind: "weight", factor: 1 },
  lb: { kind: "weight", factor: 16 },
  g: { kind: "weight", factor: 0.035274 },
  kg: { kind: "weight", factor: 35.274 },
  ea: { kind: "ea", factor: 1 },
  roll: { kind: "roll", factor: 1 },
  sheet: { kind: "sheet", factor: 1 },
};

function itemMeasure(it) {
  const name = it?.unitPriceName || it?.unitName;
  const info = UNIT_FACTORS[name];
  if (!info) return null;
  let perUnit = it.unitPrice;
  if (!(perUnit > 0) && it.unitQty) perUnit = it.price / it.unitQty;
  if (!(perUnit > 0)) return null;
  const qty = it.price / perUnit;
  if (!(qty > 0)) return null;
  return {
    kind: info.kind,
    perBase: perUnit / info.factor,
    qty: qty * info.factor,
    unitName: name,
    perUnit,
  };
}

function nameTokens(name) {
  const stop = new Set(["the", "and", "with", "for", "pack", "count", "size", "fresh", "frozen", "organic", "large", "white", "red", "whole", "reduced", "fat"]);
  return normalizeName(name).split(" ").map((w) => {
    if (w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
    if (w.endsWith("s") && w.length > 3) return w.slice(0, -1);
    return w;
  }).filter((w) => w.length > 2 && !stop.has(w));
}

function bestSubstitute(g, lineMeasure, storeId) {
  const term = g.term || bestMatchTerm(g.name);
  if (!term) return null;
  const lineOrganic = /organic/i.test(g.name);
  const lineTokens = new Set(nameTokens(g.name));
  let best = null, bestScore = Infinity;
  for (const it of state.storeItems.get(storeId) || []) {
    if ((it.term || bestMatchTerm(it.name)) !== term) continue;
    if (/organic/i.test(it.name) !== lineOrganic) continue;
    const m = itemMeasure(it);
    if (lineMeasure && (!m || m.kind !== lineMeasure.kind)) continue;
    let ratio = 1;
    if (lineMeasure && m) {
      ratio = m.qty / lineMeasure.qty;
      if (!(ratio >= 0.78 && ratio <= 1.35)) continue;
    }
    const shared = nameTokens(it.name).filter((t) => lineTokens.has(t)).length;
    if (!shared) continue;
    const score = Math.abs(Math.log(ratio)) * 4 - Math.min(shared, 3) * 0.15 + it.price * 0.001;
    if (score < bestScore) { bestScore = score; best = it; }
  }
  return best;
}

function basketTotals() {
  const rows = activeStoreList().map((s) => ({
    store: s, sum: 0, have: 0, missing: 0, similar: 0, lines: [],
  }));
  for (const [key, qty] of Object.entries(basket)) {
    const g = state.groupByKey.get(key);
    if (!g?.offers?.length) continue;
    const lineMeasure = itemMeasure(g.offers[0]);
    for (const r of rows) {
      const exact = g.offers.filter((o) => o.store === r.store.id);
      let pick = null, similar = false;
      if (exact.length) {
        pick = exact.reduce((a, b) => (a.price <= b.price ? a : b));
      } else {
        pick = bestSubstitute(g, lineMeasure, r.store.id);
        similar = !!pick;
      }
      if (!pick) { r.missing += qty; continue; }
      r.sum += pick.price * qty;
      r.have += qty;
      if (similar) r.similar += qty;
      r.lines.push({ key, qty, item: pick, similar });
    }
  }
  return rows;
}

function renderBasket() {
  const count = Object.values(basket).reduce((a, b) => a + b, 0);
  $("#listCount").textContent = count;
  const bar = $("#basketBar");
  bar.hidden = count === 0;
  if (!count) return;
  const rows = basketTotals();
  const complete = rows.filter((r) => r.missing === 0 && r.have > 0).sort((a, b) => a.sum - b.sum);
  const any = rows.filter((r) => r.have > 0).sort((a, b) => a.missing - b.missing || a.sum - b.sum);
  const top = complete[0] || any[0];
  $("#basketTitle").textContent = `${count} item${count > 1 ? "s" : ""} in your list`;
  if (top) {
    const similar = top.similar ? ` · ${top.similar} similar item${top.similar > 1 ? "s" : ""}` : "";
    $("#basketSub").textContent = complete[0]
      ? `Lowest full trip: ${money(top.sum)} at ${top.store.name}${similar}`
      : `Best so far: ${money(top.sum)} at ${top.store.name} · ${top.have} of ${top.have + top.missing} items${similar}`;
  } else {
    $("#basketSub").textContent = "Add a few prices to compare the trip";
  }
}

function addToBasket(key) {
  const g = state.groupByKey.get(key);
  if (!g || !groupBest(g)) return;
  basket[key] = (basket[key] || 0) + 1;
  persist();
  render();
  renderBasket();
}

// ---------- distance + trip recommendation ----------
let geoFlight = null;

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8, t = Math.PI / 180;
  const h = Math.sin((lat2 - lat1) * t / 2) ** 2 +
    Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin((lon2 - lon1) * t / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const CHAIN_QUERIES = {
  smiths: "Smith's", walmart: "Walmart", costco: "Costco", target: "Target",
  aldi: "Aldi", kroger: "Kroger", traderjoes: "Trader Joe's", wholefoods: "Whole Foods",
  sprouts: "Sprouts Farmers Market", reams: "Reams", lucky: "Lucky",
  albertsons: "Albertsons", dans: "Dan's", freshmarket: "Fresh Market",
  sams: "Sam's Club", safeway: "Safeway", harmons: "Harmons", winco: "WinCo",
  maceys: "Macey's", dollargeneral: "Dollar General", familydollar: "Family Dollar",
  walgreens: "Walgreens", cvs: "CVS",
};

const CHAIN_PREFIX = {
  smiths: /^(the\s+)?smith'?s\b/i, walmart: /^(the\s+)?walmart\b/i,
  costco: /^(the\s+)?costco\b/i, target: /^(the\s+)?target\b/i,
  aldi: /^(the\s+)?aldi\b/i, kroger: /^(the\s+)?kroger\b/i,
  traderjoes: /^(the\s+)?trader joe'?s\b/i, wholefoods: /^(the\s+)?whole foods\b/i,
  sprouts: /^(the\s+)?sprouts\b/i, reams: /^(the\s+)?ream'?s\b/i,
  lucky: /^(the\s+)?lucky\b/i, albertsons: /^(the\s+)?albertson'?s\b/i,
  dans: /^(the\s+)?dan'?s\b/i, freshmarket: /^(the\s+)?fresh market\b/i,
  sams: /^(the\s+)?sam'?s club\b/i, safeway: /^(the\s+)?safeway\b/i,
  harmons: /^(the\s+)?harmons\b/i, winco: /^(the\s+)?winco\b/i,
  maceys: /^(the\s+)?macey'?s\b/i, dollargeneral: /^(the\s+)?dollar general\b/i,
  familydollar: /^(the\s+)?family dollar\b/i, walgreens: /^(the\s+)?walgreens\b/i,
  cvs: /^(the\s+)?cvs\b/i,
};

const STORE_SHOP_TYPES = new Set([
  "supermarket", "grocery", "wholesale", "department_store",
  "variety_store", "convenience", "discount", "general", "chemist",
]);

async function photonSearch(query, lat, lon) {
  const latD = 0.4, lonD = 0.5;
  const bbox = [lon - lonD, lat - latD, lon + lonD, lat + latD]
    .map((n) => n.toFixed(4)).join(",");
  const params = new URLSearchParams({
    q: query, lat: String(lat), lon: String(lon), limit: "25", lang: "en", bbox,
  });
  const j = await getJSON(`https://photon.komoot.io/api/?${params}`);
  return j.features || [];
}

async function findNearbyStores(lat, lon, ids) {
  const found = {};
  let ok = 0;
  async function lookup(id) {
    const s = storeObj(id);
    let features;
    try {
      features = await photonSearch(CHAIN_QUERIES[id] || s.name, lat, lon);
      ok++;
    } catch { return; }
    let best = null;
    for (const f of features) {
      const p = f.properties || {};
      if (p.osm_key !== "shop" || !STORE_SHOP_TYPES.has(p.osm_value) || !p.name) continue;
      const [lo, la] = f.geometry?.coordinates || [];
      if (la == null || lo == null) continue;
      if (storeInfo(p.name).id !== id) continue;
      if (CHAIN_PREFIX[id] && !CHAIN_PREFIX[id].test(p.name)) continue;
      const d = haversineMiles(lat, lon, la, lo);
      if (d > 25) continue;
      if (!best || d < best.haversine) {
        best = {
          lat: la, lon: lo, haversine: d,
          miles: Math.round(d * 10) / 10,
          minutes: Math.round(d * 2.2),
          approx: true,
          branch: p.name,
        };
      }
    }
    found[id] = best ? {
      lat: best.lat, lon: best.lon, miles: best.miles, minutes: best.minutes,
      approx: true, branch: best.branch,
    } : null;
  }
  await mapLimit(ids, 3, lookup);
  const failed = ids.filter((id) => !(id in found));
  if (failed.length) {
    await new Promise((r) => setTimeout(r, 700));
    await mapLimit(failed, 2, lookup);
  }
  if (!ok) throw new Error("store lookup unavailable");
  return found;
}

async function routeDistances(lat, lon, stores) {
  const entries = Object.entries(stores).filter(([, s]) => s && s.lat != null && s.lon != null);
  if (!entries.length) return stores;
  const coords = `${lon},${lat};` + entries.map(([, s]) => `${s.lon},${s.lat}`).join(";");
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance,duration`;
  try {
    const j = await getJSON(url);
    entries.forEach(([, s], i) => {
      const dist = j.distances?.[0]?.[i + 1];
      const dur = j.durations?.[0]?.[i + 1];
      if (dist != null && dur != null) {
        s.miles = Math.round((dist / 1609.34) * 10) / 10;
        s.minutes = Math.max(1, Math.round(dur / 60));
        s.approx = false;
      }
    });
  } catch {}
  return stores;
}

function loadGeo() {
  if (!Object.keys(basket).length) return Promise.resolve();
  if (geoFlight) return geoFlight;
  state.geoStatus = "loading";
  renderReco();
  geoFlight = (async () => {
    try {
      const ok = await ensureCoords();
      if (!ok) { state.geoStatus = "noloc"; return; }
      const wanted = [...new Set(
        basketTotals().filter((r) => r.have > 0).map((r) => r.store.id)
      )];
      const ck = `pc-geo-${loc.lat.toFixed(3)}-${loc.lon.toFixed(3)}`;
      const cached = JSON.parse(localStorage.getItem(ck) || "null");
      const freshCache = cached && Date.now() - cached.ts < 24 * 3600 * 1000;
      let stores = freshCache ? { ...(cached.stores || {}) } : {};
      const missing = wanted.filter((id) => !(id in stores));
      if (missing.length) {
        const found = await findNearbyStores(loc.lat, loc.lon, missing);
        stores = { ...stores, ...found };
        const routes = {};
        for (const id of missing) if (stores[id]) routes[id] = stores[id];
        await routeDistances(loc.lat, loc.lon, routes);
        for (const id of Object.keys(routes)) stores[id] = routes[id];
        localStorage.setItem(ck, JSON.stringify({ ts: Date.now(), stores }));
      }
      state.geo = stores;
      state.geoStatus = "ready";
    } catch (e) {
      state.geoStatus = "error";
    } finally {
      geoFlight = null;
      if (!$("#listBack").hidden) renderReco();
    }
  })();
  return geoFlight;
}

const MODE_LABEL = { balance: "Best mix", price: "Cheapest", distance: "Closest" };

function distText(g) {
  if (!g || g.miles == null) return "";
  return `${g.miles.toFixed(1)} mi` + (g.minutes ? ` · ${g.minutes} min` : "") + (g.approx ? " est." : "");
}

function recoRows() {
  return basketTotals()
    .filter((r) => r.have > 0)
    .map((r) => ({ ...r, geo: state.geo[r.store.id] || null }));
}

function retryGeo() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith("pc-geo-"))
    .forEach((k) => localStorage.removeItem(k));
  state.geo = {};
  state.geoStatus = "idle";
  loadGeo();
}

function renderReco() {
  const box = $("#recoBox");
  if (!box) return;
  const rows = recoRows();
  if (!rows.length) {
    box.innerHTML = `<div class="geo-note">Turn at least one store back on to compare trips.</div>`;
    return;
  }
  const mode = state.listMode;
  const geoOn = state.geoStatus === "ready";
  const hasGeo = rows.some((r) => r.geo);
  const complete = rows.filter((r) => r.missing === 0);
  const incomplete = !complete.length;
  const base = complete.length ? complete : rows;
  let pool = base;
  if (!incomplete && mode !== "price" && geoOn) {
    const geoBase = base.filter((r) => r.geo);
    if (geoBase.length) pool = geoBase;
  }
  const drive = (r) => (r.geo && r.geo.miles != null ? r.geo.miles * MILE_RATE : 0);
  const eff = (r) => r.sum + drive(r);
  const sorters = {
    price: (a, b) => a.sum - b.sum || (a.geo?.miles ?? 1e9) - (b.geo?.miles ?? 1e9),
    distance: (a, b) => (a.geo?.miles ?? 1e9) - (b.geo?.miles ?? 1e9) || a.sum - b.sum,
    balance: (a, b) => eff(a) - eff(b) || a.sum - b.sum,
  };
  const modeSort = sorters[mode] || sorters.balance;
  const cmp = (a, b) => {
    if (incomplete && a.missing !== b.missing) return a.missing - b.missing;
    if (mode !== "price" && geoOn && Boolean(a.geo) !== Boolean(b.geo)) return a.geo ? -1 : 1;
    return modeSort(a, b);
  };
  const sorted = [...pool].sort(cmp);
  const rest = rows.filter((r) => !pool.includes(r))
    .sort((a, b) => a.missing - b.missing || a.sum - b.sum);
  const all = [...sorted, ...rest];
  const best = all[0];
  const covered = best.have + best.missing;
  const driveUnknown = (mode !== "price") && geoOn && !best.geo;

  const modeHTML = `<div class="modes">` + ["balance", "price", "distance"].map((m) =>
    `<button class="mode ${m === mode ? "on" : ""}" data-mode="${m}">${MODE_LABEL[m]}</button>`).join("") + `</div>`;

  let headline;
  const balanceCost = mode === "balance" && !!best.geo;
  if (balanceCost) {
    headline = `${money(best.sum)} <span>+ ${money(drive(best))} drive = ${money(eff(best))}</span>`;
  } else {
    headline = `${money(best.sum)} <span>${best.missing ? `${best.have} of ${covered} items` : "groceries"}</span>`;
  }

  const sub = [
    best.geo ? distText(best.geo) : "",
    best.missing
      ? (balanceCost ? `${best.have} of ${covered} items · ${best.missing} missing` : `${best.missing} missing`)
      : `all ${best.have} items covered`,
    best.similar ? `${best.similar} similar` : "",
    driveUnknown ? "distance unavailable" : "",
  ].filter(Boolean).join(" · ");

  let geoNote = "";
  if (state.geoStatus === "loading" || state.geoStatus === "idle") {
    geoNote = `<div class="geo-loading">Checking nearest branches and drive times\u2026</div>`;
  } else if (state.geoStatus === "noloc") {
    geoNote = `<div class="geo-note">Add your location to factor in driving distance and time.<br><button class="btn small" id="geoBtn">Use my location</button></div>`;
  } else if (state.geoStatus === "error") {
    geoNote = `<div class="geo-note">Couldn't look up drive times. Ranking by price for now.<br><button class="btn small" id="geoBtn">Try again</button></div>`;
  } else if (!hasGeo) {
    geoNote = `<div class="geo-note">No nearby branches found for these stores. Ranking by price for now.<br><button class="btn small" id="geoBtn">Try again</button></div>`;
  } else {
    geoNote = `<div class="muted" style="margin-top:8px">Drive estimates use the nearest branch (OpenStreetMap). Best mix values the drive at ${money(MILE_RATE)} per mile. Totals use the exact item when a store has it, otherwise the closest size, marked similar.</div>`;
  }

  box.innerHTML = modeHTML + `
    <div class="reco-card">
      <div class="reco-head">
        <span class="reco-badge">${MODE_LABEL[mode]}</span>
        <span class="muted">${complete.length ? "full list" : "partial list"}</span>
      </div>
      <div class="reco-store"><span class="dot" style="background:${best.store.color}"></span>${best.store.name}</div>
      <div class="reco-price">${headline}</div>
      <div class="reco-sub">${sub}</div>
    </div>` + geoNote + `
    <div class="ranked">
      ${all.map((r, i) => `
        <div class="rank ${i === 0 ? "win" : ""}">
          <div class="rank-name"><span class="dot" style="background:${r.store.color}"></span>${r.store.name}${r.missing ? ` <span class="muted">missing ${r.missing}</span>` : ""}</div>
          <div class="rank-sum">${money(r.sum)}${mode === "balance" && r.geo ? `<small>${money(eff(r))} with drive</small>` : ""}</div>
          <div class="rank-sub">${r.geo ? distText(r.geo) : (geoOn ? "distance unknown" : "")}${r.similar ? ` · ${r.similar} similar` : ""}</div>
        </div>`).join("")}
    </div>
    ${complete.length ? "" : `<div class="muted" style="margin-top:8px">No single store covers the whole list. Stores are ranked by how many items they cover, then price.</div>`}`;

  box.querySelectorAll(".mode").forEach((b) => {
    b.onclick = () => { state.listMode = b.dataset.mode; renderReco(); };
  });
  const gb = $("#geoBtn");
  if (gb) gb.onclick = state.geoStatus === "error" || (geoOn && !hasGeo) ? retryGeo : requestLocation;
}

// ---------- render ----------
function visibleGroups() {
  const q = searchEl.value.trim().toLowerCase();
  const list = state.groups.filter((g) => {
    if (state.activeCat !== "All" && g.category !== state.activeCat) return false;
    const active = groupOffers(g);
    if (!active.length) return false;
    if (!q) return true;
    const hay = [
      g.name, g.brand, g.category, g.size, g.term,
      active.map((o) => storeObj(o.store).name).join(" "),
    ].join(" ");
    return textHit(hay, q) || textHit(g.term, q);
  });
  if (state.sort === "az") list.sort((a, b) => a.name.localeCompare(b.name));
  else if (state.sort === "unit") {
    const u = (g) => {
      return groupOffers(g).reduce((m, o) => {
        const v = o.unitPrice != null ? o.unitPrice : (o.unitQty ? o.price / o.unitQty : null);
        return v != null && v < m ? v : m;
      }, Infinity);
    };
    list.sort((a, b) => u(a) - u(b));
  } else list.sort((a, b) => groupBest(a).price - groupBest(b).price);
  return list;
}

function compareData(q) {
  const matches = (state.catalog?.items || []).filter((it) =>
    !offStores.has(it.store) &&
    (state.activeCat === "All" || it.category === state.activeCat) &&
    (textHit(it.name, q) || textHit(it.brand || "", q) || textHit(it.term || "", q))
  );
  const measured = matches.map((it) => ({ it, m: itemMeasure(it) })).filter((x) => x.m);
  if (!measured.length) return null;

  const kinds = new Map();
  for (const x of measured) {
    if (!kinds.has(x.m.kind)) kinds.set(x.m.kind, { stores: new Set(), count: 0 });
    const k = kinds.get(x.m.kind);
    k.stores.add(x.it.store);
    k.count++;
  }
  const kind = [...kinds.entries()]
    .sort((a, b) => b[1].stores.size - a[1].stores.size || b[1].count - a[1].count)[0][0];

  const byStore = new Map();
  for (const x of measured) {
    if (x.m.kind !== kind) continue;
    const prev = byStore.get(x.it.store);
    if (!prev || x.m.perBase < prev.m.perBase || (x.m.perBase === prev.m.perBase && x.it.price < prev.it.price)) {
      byStore.set(x.it.store, x);
    }
  }
  const rows = [...byStore.values()].sort((a, b) =>
    a.m.perBase - b.m.perBase || a.it.price - b.it.price
  );
  return { rows, kind };
}

function renderCompare() {
  const el = $("#compare");
  if (!el) return;
  const q = searchEl.value.trim();
  if (q.length < 2 || !state.catalog) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const data = compareData(q);
  if (!data?.rows.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const rows = data.rows;
  const best = rows[0];
  const src = sourceOf(best.it);
  const shelfNote = state.catalog.shelfCount
    ? `Shelf prices updated ${shortDate(state.catalog.shelfUpdated)}.`
    : state.catalog.shelfZip
      ? `Shelf prices are only snapshotted for ${state.catalog.shelfZip} right now.`
      : "Weekly ad prices only for this area right now.";
  const unitText = (x) => `$${x.m.perUnit.toFixed(x.m.perUnit < 0.1 ? 3 : 2)}/${x.m.unitName}`;

  el.innerHTML = `
    <div class="compare-head">
      <div>
        <div class="compare-title">Cheapest ${esc(q)}</div>
        <div class="compare-sub">Lowest unit price at each store · sizes normalized</div>
      </div>
      <div class="compare-count">${rows.length} store${rows.length > 1 ? "s" : ""}</div>
    </div>
    <div class="compare-best">
      <div class="cb-left">
        <div class="cb-store"><span class="dot" style="background:${storeObj(best.it.store).color}"></span>${esc(storeObj(best.it.store).name)} <span class="src-tag ${src.cls}">${src.short}</span></div>
        <div class="cb-name">${esc(best.it.name)}</div>
        <div class="cb-meta">${[best.it.size, unitText(best)].filter(Boolean).map(esc).join(" · ")}</div>
      </div>
      <div class="cb-price">${money(best.it.price)}</div>
    </div>
    ${rows.length > 1 ? `<div class="compare-rows">
      ${rows.slice(1).map((x) => {
        const osrc = sourceOf(x.it);
        return `<div class="crow">
          <div class="crow-main">
            <span class="crow-store"><span class="dot" style="background:${storeObj(x.it.store).color}"></span>${esc(storeObj(x.it.store).name)} <span class="src-tag ${osrc.cls}">${osrc.short}</span></span>
            <span class="crow-name">${esc(x.it.name)}</span>
          </div>
          <div class="crow-price">${money(x.it.price)}<small>${esc(unitText(x))}</small></div>
        </div>`;
      }).join("")}
    </div>` : ""}
    <div class="compare-note">${shelfNote} Ad prices are this week's sales; shelf prices are everyday in-store prices. ${rows.length > 1 ? "Sizes vary, so each store is compared on unit price." : "Only one store has a comparable price."}</div>`;
  el.hidden = false;
}
function offerRows(g, max) {
  const offers = groupOffers(g);
  const seenStores = new Set();
  const rows = [];
  for (const o of offers) {
    if (seenStores.has(o.store)) continue;
    seenStores.add(o.store);
    rows.push(o);
    if (rows.length >= max) break;
  }
  return rows;
}

function cardHTML(g) {
  const offers = offerRows(g, 4);
  const best = offers[0];
  if (!best) return "";
  const s = storeObj(best.store);
  const others = offers.slice(1);
  const next = others[0];
  const up = unitStr(best);
  const src = sourceOf(best);
  const inList = basket[g.key] > 0;
  const sub = [best.brand, g.size, best.was ? `was ${money(best.was)}` : "", src.long].filter(Boolean).join(" · ");
  return `
  <div class="card" data-key="${g.key}">
    <div class="card-top">
      <div class="pic">${CAT_ICON[best.category] || "🛒"}</div>
      <div class="t">
        <h3>${esc(best.name)}</h3>
        <div class="sub">${esc(sub)}</div>
      </div>
    </div>
    <div class="win-box">
      <div>
        <div class="win-store"><span class="dot" style="background:${s.color}"></span>${esc(s.name)} <span class="src-tag ${src.cls}">${src.short}</span></div>
        <div class="unit">${up || src.long}</div>
      </div>
      <div class="win-price">${money(best.price)}</div>
    </div>
    <div class="other">
      ${others.map((o) => {
        const osrc = sourceOf(o);
        return `<div class="orow"><span><span class="dot" style="background:${storeObj(o.store).color}"></span>${esc(storeObj(o.store).name)} <span class="src-tag ${osrc.cls}">${osrc.short}</span></span><span>${money(o.price)}</span></div>`;
      }).join("") ||
        `<div class="orow muted">Only one store has this size</div>`}
    </div>
    <div class="card-foot">
      <span class="save">${next ? `Save ${money(next.price - best.price)} vs next` : (src.cls === "shelf" ? "Everyday shelf price" : "In this week's ad")}</span>
      <button class="add ${inList ? "in" : ""}">${inList ? `✓ In list (${basket[g.key]})` : "+ Add"}</button>
    </div>
  </div>`;
}

function render() {
  const groups = visibleGroups();
  const active = activeStoreList();
  const counts = catCounts();
  const adCount = state.catalog?.adCount ?? (state.catalog?.items || []).filter((i) => i.kind !== "shelf").length;
  const shelfCount = state.catalog?.shelfCount || 0;

  $("#statLine").textContent = state.catalog
    ? `${adCount.toLocaleString()} ad prices${shelfCount ? ` + ${shelfCount.toLocaleString()} shelf prices` : ""} · ${state.catalog.stores.length} stores`
    : "Weekly ads + everyday shelf prices";

  catsEl.querySelectorAll(".cat").forEach((b) => {
    b.classList.toggle("on", b.dataset.cat === state.activeCat);
    const n = b.querySelector(".cnum");
    if (n) n.textContent = counts[b.dataset.cat] || 0;
  });

  const shown = groups.slice(0, state.limit);
  emptyEl.hidden = shown.length > 0 || state.loading;
  if (state.loading && !state.catalog) {
    ledgerSkeleton();
  } else {
    grid.innerHTML = shown.map(cardHTML).join("");
  }
  renderCompare();

  if (state.loading && state.catalog) {
    metaEl.textContent = "Refreshing prices\u2026";
  } else if (state.catalog) {
    const maxValid = state.catalog.items.reduce((m, i) => (i.validTo > m ? i.validTo : m), "");
    const sortLabel = state.sort === "unit" ? "best unit price" : state.sort === "az" ? "A to Z" : "cheapest first";
    metaEl.textContent =
      `${groups.length.toLocaleString()} products · ${active.length} of ${state.catalog.stores.length} stores` +
      (maxValid ? ` · ads through ${shortDate(maxValid)}` : "") +
      (shelfCount ? ` · shelf ${shortDate(state.catalog.shelfUpdated)}` : "") +
      ` · ${sortLabel}`;
  } else {
    metaEl.textContent = "";
  }

  moreBtn.hidden = groups.length <= shown.length;
  if (!moreBtn.hidden) moreBtn.textContent = `Show more (${groups.length - shown.length} left)`;

  if (state.catalog && !groups.length) {
    emptyEl.hidden = false;
    emptyEl.querySelector(".empty-big").textContent = "No prices match";
    emptyEl.querySelector("p").textContent = state.catalog.items.length
      ? "Try a broader word, another category, or turn more stores on."
      : "Set your ZIP to load grocery prices.";
  }
}

function ledgerSkeleton() {
  grid.innerHTML = Array.from({ length: 6 }, () => `<div class="skel"></div>`).join("");
}

// ---------- detail ----------
function openDetail(key) {
  const g = state.groupByKey.get(key);
  if (!g) return;
  const offers = groupOffers(g);
  if (!offers.length) return;
  const best = offers[0];
  const max = Math.max(...offers.map((o) => o.price));
  const unique = [];
  const seen = new Set();
  for (const o of offers) {
    if (seen.has(o.store)) continue;
    seen.add(o.store);
    unique.push(o);
  }
  $("#detailSheet").innerHTML = `
    <div class="sheet-head">
      <h2>${CAT_ICON[best.category] || "🛒"} ${best.name}</h2>
      <button class="x" id="dClose">✕</button>
    </div>
    <div class="muted">${best.brand ? best.brand + " · " : ""}${best.category}${best.validTo ? " · ad ends " + shortDate(best.validTo) : ""}</div>
    <div class="detail-price">
      <span class="muted">Cheapest this week</span>
      <div class="big-price">${money(best.price)} <span class="at">at ${storeObj(best.store).name}</span></div>
      ${unitStr(best) ? `<div class="muted">${unitStr(best)}</div>` : ""}
    </div>
    <div class="price-table">
      ${unique.map((o) => {
        const w = Math.round((o.price / max) * 100);
        return `<div class="prow ${o.store === best.store ? "winner" : ""}">
          <span><span class="dot" style="background:${storeObj(o.store).color}"></span>${storeObj(o.store).name}${unitStr(o) ? ` <span class="muted">${unitStr(o)}</span>` : ""}</span>
          <strong>${money(o.price)}</strong>
          <div class="bar"><i style="width:${w}%"></i></div>
        </div>`;
      }).join("")}
    </div>
    <div class="sheet-actions">
      <button class="btn green" id="dAdd">+ Add to list</button>
      <button class="btn" id="dClose2">Close</button>
    </div>
    <p class="note">Advertised sale price. Shelf price can differ, and some ads are regional.</p>`;
  $("#detailBack").hidden = false;
  $("#dClose").onclick = $("#dClose2").onclick = () => ($("#detailBack").hidden = true);
  $("#dAdd").onclick = () => {
    addToBasket(key);
    $("#detailBack").hidden = true;
  };
}
$("#detailBack").addEventListener("click", (e) => {
  if (e.target.id === "detailBack") e.target.hidden = true;
});

// ---------- list sheet ----------
function openList() {
  $("#listBack").hidden = false;
  drawList();
  if (Object.keys(basket).length) loadGeo();
}

function drawList() {
  const body = $("#listBody");
  const keys = Object.keys(basket);
  if (!keys.length) {
    body.innerHTML = `<p class="muted">Your list is empty. Add items and the app totals the trip at each store.</p>`;
    return;
  }
  body.innerHTML =
    `<div id="recoBox"></div>` +
    `<div class="sheet-label">Items</div>` +
    keys.map((key) => {
      const g = state.groupByKey.get(key);
      if (!g) return "";
      const best = groupBest(g);
      return `<div class="list-row">
        <div><strong>${g.name}</strong><div class="muted">${best ? `${money(best.price)} at ${storeObj(best.store).name}` : "No store on"}</div></div>
        <div class="qty">
          <button data-a="dec" data-k="${key}">−</button><span>${basket[key]}</span><button data-a="inc" data-k="${key}">+</button>
        </div>
      </div>`;
    }).join("") +
    `<div class="sheet-actions"><button class="btn" id="clearList">Clear list</button></div>`;

  body.querySelectorAll("button[data-a]").forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.k;
      if (b.dataset.a === "inc") basket[k]++;
      else { basket[k]--; if (basket[k] <= 0) delete basket[k]; }
      persist(); render(); renderBasket(); drawList();
    };
  });
  const cl = $("#clearList");
  if (cl) cl.onclick = () => { basket = {}; persist(); render(); renderBasket(); drawList(); };
  renderReco();
}

// ---------- wiring ----------
searchEl.addEventListener("input", () => {
  clearBtn.hidden = !searchEl.value;
  state.limit = 60;
  render();
});
clearBtn.onclick = () => { searchEl.value = ""; clearBtn.hidden = true; state.limit = 60; render(); };
sortEl.addEventListener("change", () => { state.sort = sortEl.value; render(); });
moreBtn.onclick = () => { state.limit += 60; render(); };
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== searchEl) { e.preventDefault(); searchEl.focus(); }
  if (e.key === "Escape") {
    $("#detailBack").hidden = true;
    $("#listBack").hidden = true;
  }
});

grid.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const key = card.dataset.key;
  if (e.target.closest(".add")) { addToBasket(key); return; }
  openDetail(key);
});

async function requestLocation() {
  if (!navigator.geolocation) { setBanner("No GPS in this browser. Type your ZIP instead.", "warn"); return; }
  $("#locLabel").textContent = "📍 Locating\u2026";
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    let zip = "", label = "";
    try {
      const j = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
      zip = j.postcode || "";
      label = `${j.city || j.locality || ""} ${zip}`.trim();
    } catch {}
    if (!zip) {
      renderLocation();
      setBanner("Got your spot but not a ZIP. Type it in and tap Set.", "warn");
      return;
    }
    await useZip(zip, label, true, { lat: latitude, lon: longitude });
  }, () => {
    renderLocation();
    setBanner("Location is blocked. Type your ZIP instead.", "warn");
  }, { timeout: 12000, maximumAge: 300000 });
}

$("#locBtn").onclick = requestLocation;

$("#zipBtn").onclick = () => {
  const zip = $("#zipInput").value.trim();
  useZip(zip, "", true);
  $("#zipInput").value = "";
};
$("#zipInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("#zipBtn").click(); }
});
$("#locClear").onclick = () => {
  loc = null;
  localStorage.removeItem("pc-loc");
  state.zip = "";
  state.place = "";
  renderLocation();
  loadSnapshot(true);
};
$("#refreshBtn").onclick = () => {
  if (loc?.zip) useZip(loc.zip, loc.label, true);
  else loadSnapshot(true);
};
$("#listBtn").onclick = openList;
$("#viewListBtn").onclick = openList;
$("#closeList").onclick = () => ($("#listBack").hidden = true);
$("#listBack").addEventListener("click", (e) => {
  if (e.target.id === "listBack") e.target.hidden = true;
});

// ---------- boot ----------
renderLocation();
if (loc?.zip) useZip(loc.zip, loc.label);
else loadSnapshot();
