const $ = (s) => document.querySelector(s);
const grid = $("#grid"), searchEl = $("#search"), clearBtn = $("#clearSearch");
const storesEl = $("#stores"), catsEl = $("#cats"), sortEl = $("#sort");
const metaEl = $("#meta"), emptyEl = $("#empty");

const CAT_ICON = {
  "All": "🛒", "Produce": "🥦", "Dairy & Eggs": "🥛", "Bakery": "🍞",
  "Meat & Seafood": "🥩", "Pantry": "🫙", "Frozen": "🧊",
  "Snacks": "🍪", "Beverages": "🥤", "Household": "🧻"
};

let offStores = new Set(JSON.parse(localStorage.getItem("pc-off") || "[]"));
let activeCat = "All";
let products = loadPrices();
let basket = JSON.parse(localStorage.getItem("pc-basket") || "{}"); // id -> qty
let loc = JSON.parse(localStorage.getItem("pc-loc") || "null");
let liveInfo = null;

function loadPrices() {
  try {
    const raw = localStorage.getItem("pc-prices");
    if (raw) return JSON.parse(raw);
  } catch {}
  return JSON.parse(JSON.stringify(PRODUCTS));
}
function persist() {
  localStorage.setItem("pc-prices", JSON.stringify(products));
  localStorage.setItem("pc-basket", JSON.stringify(basket));
  localStorage.setItem("pc-off", JSON.stringify([...offStores]));
}

const storeName = (id) => (STORES.find(s => s.id === id) || {}).name || id;
const unit = (p, price) => p.unitQty ? price / p.unitQty : null;

function bestOf(p) {
  let best = null;
  for (const [sid, price] of Object.entries(p.prices)) {
    if (offStores.has(sid)) continue;
    if (!best || price < best.price) best = { store: sid, price };
  }
  return best;
}
function worstOf(p) {
  const vals = Object.entries(p.prices).filter(([s]) => !offStores.has(s)).map(([, v]) => v);
  return vals.length ? Math.max(...vals) : 0;
}

// --- filters ---
function buildStores() {
  storesEl.innerHTML = "";
  STORES.forEach(s => {
    const b = document.createElement("button");
    b.className = "store" + (offStores.has(s.id) ? " off" : "");
    b.innerHTML = `<span class="dot" style="background:${s.color}"></span>${s.name}`;
    b.onclick = () => {
      offStores.has(s.id) ? offStores.delete(s.id) : offStores.add(s.id);
      persist(); buildStores(); render();
    };
    storesEl.appendChild(b);
  });
}

function buildCats() {
  catsEl.innerHTML = "";
  ["All", ...CATEGORIES].forEach(c => {
    const b = document.createElement("button");
    b.className = "cat" + (c === activeCat ? " on" : "");
    b.textContent = `${CAT_ICON[c] || ""} ${c}`;
    b.onclick = () => { activeCat = c; buildCats(); render(); };
    catsEl.appendChild(b);
  });
}

const fCat = $("#fCat"), fStore = $("#fStore");
CATEGORIES.forEach(c => { const o = document.createElement("option"); o.textContent = c; fCat.appendChild(o); });
STORES.forEach(s => { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; fStore.appendChild(o); });

searchEl.addEventListener("input", () => {
  clearBtn.hidden = !searchEl.value;
  render();
});
clearBtn.onclick = () => { searchEl.value = ""; clearBtn.hidden = true; render(); };
sortEl.addEventListener("change", render);
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== searchEl) { e.preventDefault(); searchEl.focus(); }
});

function visible() {
  const q = searchEl.value.trim().toLowerCase();
  let list = products.filter(p => {
    if (activeCat !== "All" && p.category !== activeCat) return false;
    if (q && !(p.name + " " + p.brand + " " + p.category).toLowerCase().includes(q)) return false;
    return !!bestOf(p);
  });
  const m = sortEl.value;
  list.sort((a, b) => {
    if (m === "az") return a.name.localeCompare(b.name);
    if (m === "save") return (worstOf(b) - bestOf(b).price) - (worstOf(a) - bestOf(a).price);
    return bestOf(a).price - bestOf(b).price;
  });
  return list;
}

function render() {
  const list = visible();
  $("#statLine").textContent = `${products.length} items - ${STORES.length - offStores.size} stores`;
  metaEl.textContent = list.length
    ? `${list.length} result${list.length > 1 ? "s" : ""} - green is the cheapest`
    : "";
  emptyEl.hidden = list.length > 0;
  grid.innerHTML = "";

  list.forEach(p => {
    const best = bestOf(p), worst = worstOf(p);
    const up = unit(p, best.price);
    const others = Object.entries(p.prices)
      .filter(([s]) => !offStores.has(s) && s !== best.store)
      .sort((a, b) => a[1] - b[1]).slice(0, 3);
    const inList = basket[p.id] > 0;

    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="card-top">
        <div class="pic">${p.emoji || "🛒"}</div>
        <div><h3>${p.name}</h3><div class="sub">${p.size} - ${p.category}</div></div>
      </div>
      <div class="win-box">
        <div>
          <div class="win-store">${storeName(best.store)}</div>
          <div class="unit">${up ? `$${up.toFixed(2)}/${p.unitName}` : p.brand}</div>
        </div>
        <div class="win-price">$${best.price.toFixed(2)}</div>
      </div>
      <div class="other">
        ${others.map(([sid, pr]) => `<div class="orow"><span>${storeName(sid)}</span><span>$${pr.toFixed(2)}</span></div>`).join("") || `<div class="orow"><span>Only one store</span><span></span></div>`}
      </div>
      <div class="card-foot">
        <span class="save">${worst > best.price ? `Saves $${(worst - best.price).toFixed(2)}` : "Same everywhere"}</span>
        <button class="add ${inList ? "in" : ""}">${inList ? `✓ In list (${basket[p.id]})` : "+ Add"}</button>
      </div>`;
    el.querySelector(".add").onclick = (e) => {
      e.stopPropagation();
      basket[p.id] = (basket[p.id] || 0) + 1;
      persist(); render(); renderBasket();
    };
    el.onclick = () => openDetail(p.id);
    grid.appendChild(el);
  });
}

// --- location + nearby stores ---
const CHAINS = [
  { id: "smiths", match: ["smith"] },
  { id: "walmart", match: ["walmart"] },
  {id: "costco", match: ["costco"] },
  { id: "target", match: ["target"] },
  { id: "aldi", match: ["aldi"] },
  { id: "traderjoes", match: ["trader joe"] },
  { id: "wholefoods", match: ["whole foods"] },
  { id: "kroger", match: ["kroger", "fred meyer", "king sooper", "ralph", "dillons", "fry", "qfc", "marianos", "pick n save", "copps", "metro market"] },
];

function miles(a, b, c, d) {
  const R = 3958.8, t = Math.PI / 180;
  const h = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function renderLoc() {
  const label = $("#locLabel");
  if (loc) {
    label.textContent = `📍 ${loc.label}`;
    $("#locClear").hidden = false;
    renderNearby();
  } else {
    label.textContent = "📍 Location not set";
    $("#locClear").hidden = true;
    $("#nearby").hidden = true;
  }
}

$("#locBtn").onclick = () => {
  if (!navigator.geolocation) {
    $("#locLabel").textContent = "📍 No GPS here - type your ZIP";
    return;
  }
  $("#locLabel").textContent = "📍 Locating…";
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    let label = `${lat.toFixed(2)}, ${lon.toFixed(2)}`, zip = "";
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      const j = await r.json();
      label = `${j.city || j.locality || ""} ${j.postcode || ""}`.trim() || label;
      zip = j.postcode || "";
    } catch {}
    loc = { lat, lon, label, zip, src: "gps" };
    localStorage.setItem("pc-loc", JSON.stringify(loc));
    renderLoc();
  }, () => {
    $("#locLabel").textContent = "📍 Blocked - type your ZIP instead";
  });
};

$("#zipBtn").onclick = async () => {
  const zip = $("#zipInput").value.trim();
  if (!zip) return;
  $("#locLabel").textContent = "📍 Looking up ZIP…";
  try {
    const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!r.ok) throw 0;
    const j = await r.json();
    const p = j.places[0];
    loc = { lat: parseFloat(p.latitude), lon: parseFloat(p.longitude), label: `${p["place name"]} ${zip}`, zip, src: "zip" };
    localStorage.setItem("pc-loc", JSON.stringify(loc));
    renderLoc();
  } catch {
    $("#locLabel").textContent = "📍 ZIP not found - try another";
  }
};

$("#locClear").onclick = () => {
  loc = null;
  localStorage.removeItem("pc-loc");
  renderLoc();
};

async function renderNearby() {
  const box = $("#nearby");
  if (!loc) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<span class="muted">Finding stores near you…</span>`;
  try {
    const q = `[out:json][timeout:25];(node["shop"="supermarket"](around:12000,${loc.lat},${loc.lon});way["shop"="supermarket"](around:12000,${loc.lat},${loc.lon}););out center 30;`;
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST", body: "data=" + encodeURIComponent(q)
    });
    const j = await r.json();
    const found = [];
    for (const e of j.elements || []) {
      const name = (e.tags && e.tags.name) || "";
      const lat = e.lat ?? (e.center && e.center.lat);
      const lon = e.lon ?? (e.center && e.center.lon);
      if (!name || lat == null || lon == null) continue;
      const low = name.toLowerCase();
      const chain = CHAINS.find(c => c.match.some(m => low.includes(m)));
      if (!chain) continue;
      found.push({ chain: chain.id, d: miles(loc.lat, loc.lon, lat, lon) });
    }
    found.sort((a, b) => a.d - b.d);
    const seen = new Map();
    for (const f of found) if (!seen.has(f.chain)) seen.set(f.chain, f);
    const list = [...seen.values()].slice(0, 6);
    if (!list.length) {
      box.innerHTML = `<span class="muted">No tracked stores within about 8 miles.</span>`;
      return;
    }
    box.innerHTML = `<span class="muted">Close to you:</span> ` + list.map(f =>
      `<button class="near" data-s="${f.chain}">${storeName(f.chain)} · ${f.d.toFixed(1)} mi</button>`).join("");
    box.querySelectorAll(".near").forEach(b => b.onclick = () => {
      const sid = b.dataset.s;
      offStores.has(sid) ? offStores.delete(sid) : offStores.add(sid);
      persist(); buildStores(); render();
    });
  } catch {
    box.innerHTML = `<span class="muted">Could not load nearby stores. Check connection.</span>`;
  }
}

// --- live prices (prices.json, written daily by GitHub Action) ---
async function refreshLive() {
  try {
    const r = await fetch("prices.json?ts=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    if (!j || !j.prices) return;
    let n = 0;
    for (const [pid, m] of Object.entries(j.prices)) {
      const p = products.find(x => x.id === pid);
      if (!p) continue;
      for (const [sid, v] of Object.entries(m)) {
        if (typeof v === "number" && v > 0) { p.prices[sid] = v; n++; }
      }
    }
    if (n) {
      liveInfo = { updated: j.updated, place: j.place };
      render();
      $("#dataNote").textContent =
        `Smith's prices live as of ${j.updated}${j.place ? " near " + j.place : ""}. The rest are samples - add your own from receipts.`;
    }
  } catch {}
}

// --- detail sheet ---
function openDetail(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const best = bestOf(p);
  const rows = Object.entries(p.prices)
    .filter(([s]) => !offStores.has(s))
    .sort((a, b) => a[1] - b[1]);
  const max = Math.max(...rows.map(([, v]) => v));
  $("#detailSheet").innerHTML = `
    <div class="sheet-head"><h2>${p.emoji || ""} ${p.name}</h2>
      <button class="x" onclick="document.querySelector('#detailBack').hidden=true">✕</button></div>
    <div class="muted">${p.brand} - ${p.size} - ${p.category}</div>
    <div style="margin:12px 0"><span class="muted">Cheapest at</span>
      <div class="big-price">$${best.price.toFixed(2)} <span style="font-size:14px;color:var(--green)">${storeName(best.store)}</span></div>
    </div>
    <div class="price-table">
      ${rows.map(([sid, pr]) => {
        const up = unit(p, pr);
        const w = Math.round(pr / max * 100);
        return `<div class="prow ${sid === best.store ? "winner" : ""}">
          <span>${sid === best.store ? "★ " : ""}${storeName(sid)}${up ? ` <span class="muted">$${up.toFixed(2)}/${p.unitName}</span>` : ""}</span>
          <strong>$${pr.toFixed(2)}</strong>
          <div class="bar"><i style="width:${w}%"></i></div>
        </div>`;
      }).join("")}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn green" id="dAdd">+ Add to list</button>
      <button class="btn" onclick="document.querySelector('#detailBack').hidden=true">Close</button>
    </div>`;
  $("#detailBack").hidden = false;
  $("#dAdd").onclick = () => {
    basket[p.id] = (basket[p.id] || 0) + 1;
    persist(); render(); renderBasket();
    $("#detailBack").hidden = true;
  };
}
$("#detailBack").addEventListener("click", e => { if (e.target.id === "detailBack") e.target.hidden = true; });

// --- basket / list ---
function basketTotals() {
  const totals = {};
  STORES.forEach(s => { if (!offStores.has(s.id)) totals[s.id] = 0; });
  let missing = 0;
  for (const [pid, qty] of Object.entries(basket)) {
    const p = products.find(x => x.id === pid);
    if (!p) continue;
    for (const sid of Object.keys(totals)) {
      if (p.prices[sid] == null) { missing++; continue; }
      totals[sid] += p.prices[sid] * qty;
    }
  }
  return totals;
}

function renderBasket() {
  const count = Object.values(basket).reduce((a, b) => a + b, 0);
  $("#listCount").textContent = count;
  const bar = $("#basketBar");
  bar.hidden = count === 0;
  if (!count) return;
  const totals = basketTotals();
  const sorted = Object.entries(totals).sort((a, b) => a[1] - b[1]);
  const [winId, winVal] = sorted[0];
  $("#basketTitle").textContent = `${count} item${count > 1 ? "s" : ""} in your list`;
  $("#basketSub").textContent = `Cheapest at ${storeName(winId)} - $${winVal.toFixed(2)} total`;
}

function openList() {
  const body = $("#listBody");
  const ids = Object.keys(basket);
  if (!ids.length) { body.innerHTML = `<p class="muted">Your list is empty. Tap + Add on anything to compare the full trip.</p>`; }
  else {
    const totals = basketTotals();
    const sorted = Object.entries(totals).sort((a, b) => a[1] - b[1]);
    body.innerHTML =
      ids.map(pid => {
        const p = products.find(x => x.id === pid);
        if (!p) return "";
        const best = bestOf(p);
        return `<div class="list-row">
          <div><strong>${p.emoji || ""} ${p.name}</strong><div class="muted">${p.size} - best $${best.price.toFixed(2)} at ${storeName(best.store)}</div></div>
          <div class="qty">
            <button data-a="dec" data-id="${pid}">−</button><span>${basket[pid]}</span><button data-a="inc" data-id="${pid}">+</button>
          </div>
        </div>`;
      }).join("") +
      `<div class="totals"><strong>Trip total by store</strong>` +
      sorted.map(([sid, v], i) => `<div class="trow ${i === 0 ? "win" : ""}"><span>${i === 0 ? "★ " : ""}${storeName(sid)}</span><span>$${v.toFixed(2)}</span></div>`).join("") +
      `</div>
       <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" id="clearList">Clear list</button></div>`;
    body.querySelectorAll("button[data-a]").forEach(b => b.onclick = () => {
      const pid = b.dataset.id;
      if (b.dataset.a === "inc") basket[pid]++;
      else { basket[pid]--; if (basket[pid] <= 0) delete basket[pid]; }
      persist(); render(); renderBasket(); openList();
    });
    const cl = $("#clearList");
    if (cl) cl.onclick = () => { basket = {}; persist(); render(); renderBasket(); openList(); };
  }
  $("#listBack").hidden = false;
}

$("#listBtn").onclick = openList;
$("#viewListBtn").onclick = openList;
$("#closeList").onclick = () => $("#listBack").hidden = true;
$("#listBack").addEventListener("click", e => { if (e.target.id === "listBack") e.target.hidden = true; });

// --- add price ---
$("#addBtn").onclick = () => $("#addBack").hidden = false;
$("#closeAdd").onclick = () => $("#addBack").hidden = true;
$("#addBack").addEventListener("click", e => { if (e.target.id === "addBack") e.target.hidden = true; });
$("#addForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("#fName").value.trim(), price = parseFloat($("#fPrice").value);
  if (!name || !(price > 0)) return;
  let p = products.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!p) {
    p = { id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, brand: "Added by you", size: $("#fSize").value.trim() || "1 ct", unitQty: 1, unitName: "ea", category: fCat.value, emoji: "🛒", prices: {} };
    products.push(p);
  }
  p.prices[$("#fStore").value] = price;
  persist(); $("#addBack").hidden = true; e.target.reset();
  buildCats(); render();
});
$("#resetData").onclick = () => {
  localStorage.removeItem("pc-prices");
  products = loadPrices(); persist(); render(); refreshLive();
};

buildStores(); buildCats(); renderLoc(); render(); renderBasket(); refreshLive();
