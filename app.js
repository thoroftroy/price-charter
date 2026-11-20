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
  products = loadPrices(); persist(); render();
};

buildStores(); buildCats(); render(); renderBasket();
