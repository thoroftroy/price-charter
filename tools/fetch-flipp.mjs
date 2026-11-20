// Pulls this week's grocery ads through Flipp's public flyer API and writes
// prices.json, which the site uses as a snapshot when it can't fetch live.
// No API key needed.
//
// Run: node tools/fetch-flipp.mjs 84101
//   or PRICE_ZIP=84101 node tools/fetch-flipp.mjs
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const ZIP = (process.env.PRICE_ZIP || process.argv[2] || "84101").trim();
const BASE = "https://backflipp.wishabi.com/flipp";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// load the same helpers the browser uses
const ctx = vm.createContext({});
vm.runInContext(
  readFileSync(new URL("../data.js", import.meta.url), "utf8") +
  "\nglobalThis.__shared={selectFlyers,makeCatalog,storeInfo};",
  ctx
);
const { selectFlyers, makeCatalog, storeInfo } = ctx.__shared;

async function getJSON(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 25000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
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
      catch (e) { console.warn(`skip ${list[idx].merchant}: ${e.message}`); out[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker));
  return out;
}

async function placeName(zip) {
  try {
    const r = await fetch(`https://api.zippopotam.us/us/${zip}`, { headers: { "User-Agent": UA } });
    if (!r.ok) return "";
    const j = await r.json();
    const p = j.places && j.places[0];
    return p ? `${p["place name"]}, ${p["state abbreviation"]} ${zip}` : "";
  } catch { return ""; }
}

console.log(`pulling weekly ads for ${ZIP}`);
const flyerList = await getJSON(`${BASE}/flyers?locale=en-us&postal_code=${encodeURIComponent(ZIP)}`);
const flyers = selectFlyers(flyerList.flyers || []);
console.log(`grocery flyers: ${flyers.map(f => f.merchant.trim()).join(", ") || "none"}`);

const pairs = await mapLimit(flyers, 5, async flyer => ({
  flyer,
  detail: await getJSON(`${BASE}/flyers/${flyer.id}?locale=en-us`),
}));

const catalog = makeCatalog({
  zip: ZIP,
  place: await placeName(ZIP),
  updated: new Date().toISOString().slice(0, 10),
  source: "This week's store ads (via Flipp)",
  pairs: pairs.filter(Boolean),
});

if (!catalog.items.length) {
  console.error("no items found - leaving prices.json alone");
  process.exit(1);
}

writeFileSync(new URL("../prices.json", import.meta.url), JSON.stringify(catalog, null, 1) + "\n");
console.log(`wrote prices.json: ${catalog.items.length} deals from ${catalog.stores.length} stores`);
for (const s of catalog.stores) {
  console.log(`  ${s.name}: ${catalog.items.filter(i => i.store === s.id).length}`);
}
