// Pulls everyday in-store shelf prices from the grocery chains' own Instacart
// storefronts and writes shelf.json. The site can't call these APIs from the
// browser (no CORS), so this runs on a schedule and publishes a snapshot.
//
// Run: node tools/fetch-shelf.mjs 84101
//   or PRICE_ZIP=84101 node tools/fetch-shelf.mjs
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";

const ZIP = (process.env.PRICE_ZIP || process.argv[2] || "84101").trim();
const LAT = Number(process.env.PRICE_LAT || 40.7608);
const LON = Number(process.env.PRICE_LON || -111.891);
const BASE = "https://www.instacart.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const HASH = {
  shops: "f20693c3c551f0e0fbdcac9b2ca7aa6db50f9224a39967ba5ac767bb2b598f85",
  search: "0a9a02ef3813c5fbc1d69d49587ff0956fb1b0684c73e1193ea21302253bc341",
  items: "c508afc5ec327c479a58ec7c2b1137d421c99757a33a8f662ded27eee594fc52",
};

// White-label storefronts. Only the in-store shop is used, so prices are shelf
// prices rather than delivery markups.
const HOSTS = [
  { id: "maceys", name: "Macey's", base: "https://shop.maceys.com", slug: "maceys" },
  { id: "harmons", name: "Harmons", base: "https://shop.harmonsgrocery.com", slug: "harmons" },
  { id: "sprouts", name: "Sprouts", base: "https://shop.sprouts.com", slug: "sprouts" },
  { id: "dans", name: "Dan's Fresh Market", base: "https://shop.dansfoods.com", slug: "dans-fresh-market" },
  { id: "freshmarket", name: "Fresh Market", base: "https://shop.freshmarketstores.com", slug: "fresh-market" },
];

const ctx = vm.createContext({});
vm.runInContext(
  readFileSync(new URL("../data.js", import.meta.url), "utf8") +
  "\nglobalThis.__shared={SHELF_TERMS,storeInfo,classify,parseUnit,isGroceryName,bestMatchTerm};",
  ctx
);
const { SHELF_TERMS, storeInfo, classify, parseUnit, isGroceryName, bestMatchTerm } = ctx.__shared;
const TERMS = process.env.PRICE_TERMS ? process.env.PRICE_TERMS.split("|").map((s) => s.trim()).filter(Boolean) : SHELF_TERMS;
const ONLY = process.env.PRICE_STORES ? new Set(process.env.PRICE_STORES.split(",").map((s) => s.trim())) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CookieJar {
  constructor() { this.cookies = new Map(); }
  absorb(res) {
    const list = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") || "").split(/,(?=[^;]+=)/);
    for (const line of list) {
      const pair = line.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

class HttpError extends Error {
  constructor(status, url) { super(`HTTP ${status} ${url}`); this.status = status; }
}

async function request(url, host, options = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 45000);
  try {
    const r = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": UA,
        Accept: "application/json,text/html;q=0.9",
        ...(host.jar.header() ? { Cookie: host.jar.header() } : {}),
        ...(options.headers || {}),
      },
      signal: c.signal,
    });
    host.jar.absorb(r);
    if (!r.ok) throw new HttpError(r.status, url);
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function seed(host) {
  host.jar = new CookieJar();
  const r = await request(`${host.base}/store/${host.slug}/storefront`, host, {
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  await r.text();
  if (!host.jar.header()) throw new Error("storefront did not set a session cookie");
}

function gqlUrl(host, operationName, variables, sha256Hash) {
  const q = new URLSearchParams({
    operationName,
    variables: JSON.stringify(variables),
    extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash } }),
  });
  return `${host.base}/graphql?${q}`;
}

async function gql(host, operationName, variables, sha256Hash) {
  const r = await request(gqlUrl(host, operationName, variables, sha256Hash), host);
  const j = await r.json();
  if (j.errors && !j.data) throw new Error(j.errors[0]?.message || "GraphQL error");
  return j;
}

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(i); }
    catch (e) {
      last = e;
      if (i === tries - 1) break;
      await sleep(1200 * (i + 1));
    }
  }
  throw last;
}

function money(s) {
  const raw = String(s || "");
  const multi = raw.match(/(\d+)\s*(?:for|\/)\s*\$([\d.]+)/i);
  if (multi) return Math.round((parseFloat(multi[2]) / parseInt(multi[1], 10)) * 100) / 100;
  const m = raw.match(/\$\s*([\d]+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

const UNIT_ALIASES = {
  "fl oz": "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  each: "ea", ct: "ea", count: "ea", sht: "sheet", sheet: "sheet", sheets: "sheet",
  roll: "roll", rolls: "roll",
  gal: "gal", gallon: "gal", gallons: "gal",
  qt: "qt", quart: "qt", quarts: "qt", pt: "pt", pint: "pt", pints: "pt",
  kg: "kg", g: "g", ml: "ml", l: "L",
};

function unitName(u) {
  const k = String(u || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  return UNIT_ALIASES[k] || "";
}

function pricePerUnitLabel(value) {
  const m = String(value || "").match(/\$\s*([\d.]+)\s*\/\s*([a-z][a-z. ]{0,14})/i);
  if (!m) return null;
  const unit = unitName(m[2]);
  if (!unit) return null;
  const price = parseFloat(m[1]);
  return price > 0 ? { price, unit } : null;
}

function matchesTerm(name, term) {
  const clean = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const n = clean(name);
  const t = clean(term);
  if (!n || !t) return false;
  if (n.includes(t)) return true;
  if (n.replace(/ /g, "").includes(t.replace(/ /g, ""))) return true;
  const tokens = new Set(n.split(" "));
  return t.split(" ").every((w) => tokens.has(w) || tokens.has(w.replace(/s$/, "")) || tokens.has(`${w}s`) || tokens.has(w.replace(/es$/, "")));
}

function extractItemIds(search) {
  const placements = search?.data?.searchResultsPlacements?.placements || [];
  const ids = [];
  for (const p of placements) {
    const c = p.content || {};
    if (c.__typename !== "SearchContentManagementSearchItemGrid") continue;
    for (const id of c.itemIds || []) if (!ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, 12);
}

async function shopFor(host) {
  await seed(host);
  const d = await withRetry(() => gql(host, "ShopCollectionScoped", {
    retailerSlug: host.slug,
    postalCode: ZIP,
    coordinates: { latitude: LAT, longitude: LON },
    addressId: null,
    allowCanonicalFallback: true,
  }, HASH.shops));
  const shops = d?.data?.shopCollection?.shops || [];
  const shop = shops.find((s) => s.serviceType === "instore");
  if (!shop) throw new Error(`no in-store shop (${shops.map((s) => s.serviceType).join(", ") || "none"})`);
  return shop;
}

async function search(host, shop, term) {
  return withRetry(async (attempt) => {
    try {
      return await gql(host, "SearchResultsPlacements", {
        action: null,
        query: term,
        pageViewId: randomUUID(),
        elevatedProductId: null,
        searchSource: "search",
        filters: [],
        disableReformulation: false,
        disableLlm: false,
        forceInspiration: false,
        orderBy: "bestMatch",
        clusterId: null,
        includeDebugInfo: false,
        clusteringStrategy: null,
        contentManagementSearchParams: { itemGridColumnCount: 3 },
        shopId: shop.id,
        postalCode: ZIP,
        zoneId: "307",
        first: 10,
      }, HASH.search);
    } catch (e) {
      if (e.status === 401 || e.status === 403) await seed(host);
      else if (e.status === 429) await sleep(5000 * (attempt + 1));
      throw e;
    }
  });
}

async function items(host, shop, ids) {
  return withRetry(async (attempt) => {
    try {
      const d = await gql(host, "Items", {
        ids,
        shopId: shop.id,
        zoneId: "307",
        postalCode: ZIP,
      }, HASH.items);
      return d?.data?.items || [];
    } catch (e) {
      if (e.status === 401 || e.status === 403) await seed(host);
      else if (e.status === 429) await sleep(5000 * (attempt + 1));
      throw e;
    }
  });
}

async function fetchStore(host) {
  console.log(`\n${host.name}: opening storefront`);
  const shop = await shopFor(host);
  console.log(`${host.name}: in-store shop ${shop.id} (location ${shop.retailerLocationId})`);

  const found = new Map();
  let searches = 0;
  for (const term of TERMS) {
    try {
      const d = await search(host, shop, term);
      for (const id of extractItemIds(d)) {
        if (!found.has(id)) found.set(id, { term, rank: searches });
      }
    } catch (e) {
      console.warn(`${host.name}: search "${term}" failed: ${e.message}`);
    }
    searches++;
    if (searches % 20 === 0) console.log(`${host.name}: searched ${searches}/${TERMS.length}, ${found.size} item ids`);
    await sleep(220);
  }

  const ids = [...found.keys()];
  console.log(`${host.name}: loading ${ids.length} items`);
  const raw = [];
  for (let i = 0; i < ids.length; i += 80) {
    const batch = ids.slice(i, i + 80);
    try {
      raw.push(...await items(host, shop, batch));
    } catch (e) {
      console.warn(`${host.name}: item batch ${i} failed (${e.message}), retrying smaller`);
      for (let j = 0; j < batch.length; j += 20) {
        try { raw.push(...await items(host, shop, batch.slice(j, j + 20))); }
        catch (e2) { console.warn(`${host.name}: item chunk ${i + j} failed: ${e2.message}`); }
        await sleep(250);
      }
    }
    await sleep(220);
  }

  const byId = new Map(raw.map((x) => [x.id, x]));
  const seen = new Set();
  const out = [];
  for (const [id, meta] of found) {
    const x = byId.get(id);
    if (!x || seen.has(id)) continue;
    const name = String(x.name || "").trim();
    if (name.length < 3 || name.length > 140 || !/[a-z]/i.test(name)) continue;
    if (!matchesTerm(name, meta.term)) continue;
    if (!isGroceryName(name)) continue;

    const ps = x.price?.viewSection || {};
    const card = ps.itemCard || {};
    const price = money(ps.priceString || ps.priceValueString || card.priceString);
    if (!(price > 0) || price > 200) continue;
    const was = money(ps.fullPriceString || card.fullPriceString);

    const size = String(x.size || card.pricingUnitString || ps.pricingUnitSecondaryString || "").trim().slice(0, 60);
    let parsed = parseUnit(size);
    if (!parsed.unitQty) parsed = parseUnit(name);
    const ppu = pricePerUnitLabel(card.pricingUnitString) || pricePerUnitLabel(ps.priceString);
    let unitPrice = null, unitPriceName = "";
    if (ppu) {
      unitPrice = ppu.price;
      unitPriceName = ppu.unit;
    } else if (parsed.unitQty && parsed.unitName) {
      unitPrice = Math.round((price / parsed.unitQty) * 10000) / 10000;
      unitPriceName = parsed.unitName;
    }
    if (unitPriceName === "ea") {
      if (meta.term === "paper towels") {
        if (/\bct\b/i.test(size)) unitPriceName = "roll";
        else if (/\beach\b/i.test(size)) unitPriceName = "sheet";
      } else if (meta.term === "toilet paper") {
        unitPriceName = "roll";
      }
    }

    seen.add(id);
    out.push({
      id: `shelf_${host.id}_${x.productId || id}`,
      itemId: id,
      store: host.id,
      name,
      brand: String(x.brandName || "").trim(),
      size,
      price: Math.round(price * 100) / 100,
      was: was && was > price ? Math.round(was * 100) / 100 : null,
      unitPrice: unitPrice ? Math.round(unitPrice * 10000) / 10000 : null,
      unitPriceName,
      unitQty: parsed.unitQty,
      unitName: parsed.unitName,
      category: classify(name),
      term: meta.term,
      matchTerm: bestMatchTerm(name) || meta.term,
      url: x.evergreenUrl ? `${host.base}/store/${host.slug}/products/${x.evergreenUrl}` : "",
    });
  }

  console.log(`${host.name}: kept ${out.length} shelf prices`);
  const deduped = new Map();
  for (const it of out) {
    const key = `${it.store}|${it.brand.toLowerCase()}|${it.name.toLowerCase()}|${it.size}`;
    const prev = deduped.get(key);
    if (!prev || it.price < prev.price) deduped.set(key, it);
  }
  const unique = [...deduped.values()];
  if (unique.length !== out.length) console.log(`${host.name}: dropped ${out.length - unique.length} duplicate listings`);
  return {
    store: {
      id: host.id,
      name: storeInfo(host.name).name,
      color: storeInfo(host.name).color,
      shopId: shop.id,
      serviceType: "instore",
      locationId: shop.retailerLocationId,
    },
    items: unique,
  };
}

async function placeName(zip) {
  try {
    const r = await fetch(`https://api.zippopotam.us/us/${zip}`, { headers: { "User-Agent": UA } });
    if (!r.ok) return "";
    const j = await r.json();
    const p = j.places?.[0];
    return p ? `${p["place name"]}, ${p["state abbreviation"]} ${zip}` : "";
  } catch { return ""; }
}

console.log(`pulling in-store shelf prices for ${ZIP}`);
const targets = ONLY ? HOSTS.filter((h) => ONLY.has(h.id)) : HOSTS;
const results = await Promise.allSettled(targets.map(async (host) => {
  try { return await fetchStore(host); }
  catch (e) {
    console.warn(`${host.name}: skipped (${e.message})`);
    return null;
  }
}));

const stores = [];
const all = [];
for (const r of results) {
  if (r.status !== "fulfilled" || !r.value) continue;
  stores.push(r.value.store);
  all.push(...r.value.items);
}

if (!all.length) {
  console.error("no shelf prices found - leaving shelf.json alone");
  process.exit(1);
}

const out = {
  zip: ZIP,
  place: await placeName(ZIP),
  updated: new Date().toISOString().slice(0, 10),
  source: "Everyday in-store shelf prices (store storefronts via Instacart)",
  note: "In-store shop pricing. Not delivery or pickup markup.",
  stores,
  items: all,
};

const json = `{\n"zip":${JSON.stringify(out.zip)},"place":${JSON.stringify(out.place)},"updated":${JSON.stringify(out.updated)},\n` +
  `"source":${JSON.stringify(out.source)},"note":${JSON.stringify(out.note)},\n` +
  `"stores":${JSON.stringify(out.stores)},\n"items":[\n${out.items.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`;
writeFileSync(new URL("../shelf.json", import.meta.url), json);

console.log(`\nwrote shelf.json: ${all.length} shelf prices from ${stores.length} stores`);
for (const s of stores) {
  console.log(`  ${s.name}: ${all.filter((i) => i.store === s.id).length}`);
}
