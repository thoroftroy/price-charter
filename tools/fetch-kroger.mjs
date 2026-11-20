// Pulls real Smith's / Kroger prices via the official Kroger API
// and writes prices.json for the site to pick up.
//
// Run: KROGER_CLIENT_ID=.. KROGER_CLIENT_SECRET=.. PRICE_ZIP=84101 node tools/fetch-kroger.mjs
// Get a free key at https://developer.kroger.com (create app, enable "Product Location Data").
// Without keys it exits 0 without touching prices.json (so the site keeps samples).
import { writeFileSync } from "node:fs";

const ID = process.env.KROGER_CLIENT_ID;
const SEC = process.env.KROGER_CLIENT_SECRET;
const ZIP = process.env.PRICE_ZIP || "84101";

if (!ID || !SEC) {
  console.log("skip: set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET to fetch live prices");
  process.exit(0);
}

// product id in data.js -> search term for the Kroger catalog
const TERMS = [
  ["milk-1gal", "whole milk"], ["eggs-1doz", "large eggs"],
  ["eggs-12", "large eggs"], ["bread-white", "white sandwich bread"],
  ["butter-1lb", "salted butter"], ["cheddar-16oz", "sharp cheddar"],
  ["chicken-breast", "chicken breast"], ["ground-beef", "ground beef"],
  ["salmon", "atlantic salmon"], ["bananas", "bananas"],
  ["avocado", "hass avocado"], ["tomatoes", "roma tomatoes"],
  ["spinach", "baby spinach"], ["rice-white", "long grain white rice"],
  ["pasta", "spaghetti"], ["olive-oil", "olive oil"],
  ["peanut-butter", "peanut butter"], ["coffee", "ground coffee"],
  ["oj", "orange juice"], ["soda-12pk", "coca cola 12 pack"],
  ["chips", "tortilla chips"], ["cookies", "chocolate chip cookies"],
  ["ice-cream", "vanilla ice cream"], ["pizza-frozen", "pepperoni pizza"],
  ["paper-towels", "paper towels"], ["detergent", "laundry detergent"],
  ["yogurt", "greek yogurt"], ["apples", "gala apples"], ["honey", "honey"],
];

const basic = Buffer.from(`${ID}:${SEC}`).toString("base64");
const tokRes = await fetch("https://api.kroger.com/v1/connect/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + basic },
  body: "grant_type=client_credentials&scope=product.compact",
});
if (!tokRes.ok) {
  console.error("token failed: HTTP " + tokRes.status);
  process.exit(1);
}
const { access_token } = await tokRes.json();
const auth = { Authorization: "Bearer " + access_token };

// nearest store to the ZIP, prefer Smith's then Kroger
const locRes = await fetch(
  `https://api.kroger.com/v1/locations?filter.zipCode.near=${encodeURIComponent(ZIP)}&filter.limit=20`,
  { headers: auth }
);
if (!locRes.ok) {
  console.error("locations failed: HTTP " + locRes.status);
  process.exit(1);
}
const locs = (await locRes.json()).data || [];
const spot = locs.find(l => (l.chain || "").toLowerCase().includes("smith")) || locs[0];
if (!spot) {
  console.error("no stores near " + ZIP);
  process.exit(1);
}
const chain = (spot.chain || "").toLowerCase();
const storeId = chain.includes("smith") ? "smiths" : "kroger";
console.log(`using ${spot.name} (${spot.locationId}) for ${ZIP}`);

const prices = {};
for (const [pid, term] of TERMS) {
  const r = await fetch(
    `https://api.kroger.com/v1/products?filter.term=${encodeURIComponent(term)}&filter.locationId=${spot.locationId}&filter.limit=3`,
    { headers: auth }
  );
  if (!r.ok) continue;
  const items = (await r.json()).data || [];
  const hit = items.find(p => p.items && p.items[0] && p.items[0].price && p.items[0].price.regular);
  if (hit) prices[pid] = { [storeId]: hit.items[0].price.regular };
}

const out = {
  updated: new Date().toISOString().slice(0, 10),
  zip: ZIP,
  place: `${spot.name}, ${spot.address.city}`,
  prices,
};
writeFileSync("prices.json", JSON.stringify(out, null, 2) + "\n");
console.log(`wrote prices.json with ${Object.keys(prices).length} live prices`);
