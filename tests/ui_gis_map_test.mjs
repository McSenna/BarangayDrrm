// GIS map browser test (admin, personnel, resident; desktop 1440 + phone 390).
// Read-only: the one coordinate save is intercepted in the browser (no DB write).
//
// Needs: the Vite dev server (npm run dev) and the PHP API under XAMPP, the
// defense test data (8 households), Chrome, and puppeteer-core:
//   npm i --no-save puppeteer-core@23.11.1
// Sessions: logged-in PHPSESSID values for an admin, a relief personnel and a
// resident (log in once in a browser and copy the cookie, or seed a session file).
//   GIS_ADMIN_SESSION=... GIS_PERSONNEL_SESSION=... GIS_RESIDENT_SESSION=... \
//     node tests/ui_gis_map_test.mjs [screenshot_dir]
import puppeteer from "puppeteer-core";
const B = process.env.GIS_FRONTEND_URL || "http://localhost:5173";
const SESS = { admin: process.env.GIS_ADMIN_SESSION || "claudegisadmintest", personnel: process.env.GIS_PERSONNEL_SESSION || "claudegisperstest", resident: process.env.GIS_RESIDENT_SESSION || "claudegisrestest" };
const OUT = process.argv[2] || ".";
const res = [];
const ok = (c, m, extra) => { res.push(!!c); console.log((c ? "PASS " : "FAIL ") + m + (c || extra === undefined ? "" : "  -> " + JSON.stringify(extra))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });

async function open(sess, w, h, path = "/admin/map") {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/tile\.openstreetmap|favicon|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  await page.setCookie({ name: "PHPSESSID", value: sess, domain: "localhost", path: "/" });
  await page.goto(B + path, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2500);
  return { page, errs };
}
const q = (page, fn, ...a) => page.evaluate(fn, ...a);
const center = (page, sel) => q(page, (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);

// ---------------- admin desktop
{
  const { page, errs } = await open(SESS.admin, 1440, 900);
  ok(await q(page, () => document.querySelector("h1")?.textContent.includes("GIS Household & Flood-Prone Zone Map")), "title shown");
  const ledger = await q(page, () => [...document.querySelectorAll(".gis-ledger-cell")].map((c) => c.querySelector(".gis-ledger-label").textContent.trim() + "=" + c.querySelector(".gis-ledger-value").textContent.trim()));
  ok(ledger.join("|") === "Registered households=8|Mapped=8|Unmapped=0|In flood-prone zones=4|Not currently designated=4", "ledger shows database counts", ledger);
  ok(await q(page, () => document.querySelectorAll(".gis-map .gis-house").length) === 8, "8 household house markers (one per household)");
  const zones = await q(page, () => [...document.querySelectorAll(".leaflet-gis-zones-pane path")].map((p) => [p.getAttribute("stroke"), p.getAttribute("fill"), p.getAttribute("fill-opacity")]));
  ok(zones.filter((z) => z[0] === "#B91C1C" && z[1] === "#EF4444" && z[2] === "0.35").length === 4, "4 red flood-prone polygons (#EF4444 @ .35, #B91C1C border)", zones);
  ok(zones.filter((z) => z[0] === "#64748B").length === 4, "4 neutral polygons (5A, 5B, 6, 7)", zones);
  const labels = await q(page, () => [...document.querySelectorAll(".gis-purok-label")].map((l) => [l.querySelector(".gis-label-full").textContent, l.classList.contains("gis-purok-label--flood")]));
  ok(labels.length === 8 && labels.filter((l) => l[1]).map((l) => l[0]).join() === "Purok 1,Purok 2,Purok 3,Purok 4", "8 Purok labels; Puroks 1–4 labelled as flood-prone", labels);
  ok(await q(page, () => !!document.querySelector(".leaflet-gis-mask-pane path")), "outside-barangay mask drawn");
  ok(await q(page, () => getComputedStyle(document.querySelector(".leaflet-gis-mask-pane")).zIndex === "380" && getComputedStyle(document.querySelector(".leaflet-gis-zones-pane")).zIndex === "410"
    && getComputedStyle(document.querySelector(".leaflet-gis-labels-pane")).zIndex === "450" && getComputedStyle(document.querySelector(".leaflet-marker-pane")).zIndex === "600"),
    "layer order: mask 380 < zones 410 < labels 450 < markers 600");
  const onTop = (sel) => q(page, (s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && el.contains(hit); }, sel);
  await q(page, () => document.querySelector(".gis-frame").scrollIntoView({ block: "end" })); await sleep(300);
  ok(await onTop(".gis-toolbar .gis-tool") && await onTop(".gis-legend li"), "toolbar and legend are visible above the map");
  await page.screenshot({ path: `${OUT}/gis_desktop_overview.png` });

  // drag must not move the map
  const pane = () => q(page, () => document.querySelector(".gis-map .leaflet-map-pane").style.transform);
  const t0 = await pane();
  const [cx, cy] = await center(page, ".gis-frame");
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 220, cy + 140, { steps: 10 }); await page.mouse.up(); await sleep(500);
  ok((await pane()) === t0, "mouse drag does not pan the map", [t0, await pane()]);
  // keyboard arrows must not pan
  await page.focus(".gis-map"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown"); await sleep(400);
  ok((await pane()) === t0, "arrow keys do not pan the map");

  // zoom out is blocked at the overview; zoom-in works; wheel zoom keeps the centre
  ok(await q(page, () => document.querySelector(".leaflet-control-zoom-out").classList.contains("leaflet-disabled")), "zoom-out disabled at the whole-barangay view (minimum zoom)");
  const outlineCentre = () => q(page, () => { const m = document.querySelector(".gis-map").getBoundingClientRect(); const r = document.querySelector(".gis-boundary").getBoundingClientRect(); return [Math.round(r.left + r.width / 2 - (m.left + m.width / 2)), Math.round(r.top + r.height / 2 - (m.top + m.height / 2))]; });
  const oc0 = await outlineCentre();
  const z0 = await q(page, () => document.querySelector(".gis-map").dataset.zoom);
  await page.mouse.move(cx - 300, cy - 180); // far from the centre: a cursor-centred zoom would drift
  for (let i = 0; i < 3; i++) { await page.mouse.wheel({ deltaY: -240 }); await sleep(350); }
  await sleep(800);
  const oc1 = await outlineCentre();
  const z1 = await q(page, () => document.querySelector(".gis-map").dataset.zoom);
  ok(z1 !== "far" && z0 === "far", "mouse-wheel zoom in works", [z0, z1]);
  ok(Math.abs(oc1[0] - oc0[0]) <= 3 && Math.abs(oc1[1] - oc0[1]) <= 3, "wheel zoom at an off-centre cursor keeps the barangay centred", [oc0, oc1]);
  for (let i = 0; i < 6; i++) { await page.click(".leaflet-control-zoom-out").catch(() => {}); await sleep(300); }
  await sleep(600);
  ok((await q(page, () => document.querySelector(".gis-map").dataset.zoom)) === "far" && await q(page, () => document.querySelector(".leaflet-control-zoom-out").classList.contains("leaflet-disabled")), "zoom out stops at the whole-barangay view");

  // household popup
  await page.click("#gis-search"); await page.type("#gis-search", "Pascual"); await sleep(400);
  ok(await q(page, () => document.querySelectorAll(".gis-list > li").length) === 1, "search by name returns the one household");
  await page.click(".gis-list .gis-item"); await sleep(2400);
  const pop = await q(page, () => document.querySelector(".leaflet-popup-content")?.innerText || "");
  ok(/HOUSEHOLD INFORMATION/i.test(pop) && pop.includes("Jerome Pascual") && pop.includes("Household #4") && /Flood-prone zone/i.test(pop) && pop.includes("13.1564170") && pop.includes("123.7166138"), "household popup: correct record, flood status and stored coordinates", pop);
  ok(await q(page, () => document.querySelectorAll(".gis-house.is-selected").length) === 1, "selected marker highlighted");
  ok(await q(page, () => { const f = document.querySelector(".gis-frame").getBoundingClientRect(); const p = document.querySelector(".leaflet-popup").getBoundingClientRect(); return p.top >= f.top - 1 && p.bottom <= f.bottom + 1; }), "household popup fits inside the map frame");
  ok(await q(page, () => { const c = document.querySelector(".leaflet-popup-content"); return c.scrollHeight <= c.clientHeight + 1; }), "household popup shows all details and Move location without scrolling");
  ok((await pane()) !== t0 && (await q(page, () => document.querySelector(".gis-map").dataset.zoom)) === "near", "locating zooms toward the marker (map still not draggable)");
  await page.screenshot({ path: `${OUT}/gis_desktop_popup.png` });

  // search by ID
  await page.click("#gis-search", { clickCount: 3 }); await page.type("#gis-search", "#7"); await sleep(300);
  ok(await q(page, () => [...document.querySelectorAll(".gis-item-name")].map((n) => n.textContent).join()) === "Leonora Castillo", "search '#7' returns only household ID 7");
  await page.click("#gis-search", { clickCount: 3 }); await page.type("#gis-search", "7"); await sleep(300);
  ok(await q(page, () => document.querySelector(".gis-item-name")?.textContent) === "Leonora Castillo", "search '7' lists household ID 7 first");
  await page.click(".gis-reset"); await sleep(600);
  ok(await q(page, () => document.querySelectorAll(".gis-list > li").length) === 8, "Reset filters restores all 8");

  // filters
  await page.select("#gis-zone", "flood_prone"); await sleep(500);
  ok(await q(page, () => document.querySelectorAll(".gis-map .gis-house").length) === 4, "zone filter: flood-prone → 4 markers");
  await page.select("#gis-zone", "not_designated"); await sleep(500);
  ok(await q(page, () => document.querySelectorAll(".gis-map .gis-house").length) === 4, "zone filter: not designated → 4 markers");
  await page.select("#gis-zone", "unmapped"); await sleep(500);
  ok(await q(page, () => document.querySelectorAll(".gis-map .gis-house").length === 0 && document.querySelector(".gis-empty")?.textContent.includes("No households match")), "zone filter: unmapped → none (all 8 are mapped)");
  await page.select("#gis-zone", ""); await page.select("#gis-purok", "Purok 5A"); await sleep(1200);
  ok(await q(page, () => document.querySelectorAll(".gis-map .gis-house").length) === 1, "Purok 5A filter → 1 marker");
  await page.select("#gis-purok", ""); await sleep(1000);
  // ledger as filter
  await page.click(".gis-ledger-cell.is-flood"); await sleep(500);
  ok(await q(page, () => document.querySelector("#gis-zone").value === "flood_prone" && document.querySelectorAll(".gis-map .gis-house").length === 4), "ledger figure acts as a filter");
  await page.click(".gis-ledger-cell.is-flood"); await sleep(800);

  // purok popup: click on the Purok 6 label position (labels are click-through)
  await page.click(".gis-tool"); await sleep(1200); // whole barangay
  const p6 = await q(page, () => { const l = [...document.querySelectorAll(".gis-purok-label")].find((x) => x.querySelector(".gis-label-full").textContent === "Purok 6"); const r = l.getBoundingClientRect(); return [r.left + r.width / 2, r.bottom + 8]; });
  await page.mouse.click(p6[0], p6[1]); await sleep(800);
  const pp = await q(page, () => document.querySelector(".leaflet-popup-content")?.innerText || "");
  ok(/PUROK INFORMATION/i.test(pp) && pp.includes("Purok 6") && pp.includes("Not currently designated") && pp.includes("does not mean it is safe"), "Purok 6 popup: not currently designated, no 'safe' claim", pp);
  await page.keyboard.press("Escape");
  const p2 = await q(page, () => { const l = [...document.querySelectorAll(".gis-purok-label")].find((x) => x.querySelector(".gis-label-full").textContent === "Purok 2"); const r = l.getBoundingClientRect(); return [r.left + r.width / 2, r.bottom + 6]; });
  await page.mouse.click(p2[0], p2[1]); await sleep(800);
  const pp2 = await q(page, () => document.querySelector(".leaflet-popup-content")?.innerText || "");
  ok(/FLOOD-PRONE ZONE/i.test(pp2) && pp2.includes("Designated flood-prone zone") && pp2.includes("designated as flood-prone in the barangay mapping system"), "Purok 2 popup: FLOOD-PRONE ZONE", pp2);
  await page.screenshot({ path: `${OUT}/gis_desktop_purok_popup.png` });

  // assign / move location (save intercepted — no DB write)
  let saved = null;
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.url().includes("update_coordinates.php") && r.method() === "POST") {
      saved = JSON.parse(r.postData());
      r.respond({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": B, "Access-Control-Allow-Credentials": "true" },
        body: JSON.stringify({ success: true, message: `Map location saved for Leonora Castillo.`, household_id: saved.household_id, latitude: Number(saved.latitude), longitude: Number(saved.longitude) }) });
    } else r.continue();
  });
  await page.click("#gis-search", { clickCount: 3 }); await page.type("#gis-search", "Castillo"); await sleep(300);
  await page.click(".gis-list .gis-item"); await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll(".leaflet-popup-content button")].find((b) => b.textContent.includes("Move location")).click());
  await sleep(1200);
  ok(await q(page, () => !!document.querySelector(".gis-assign") && !!document.querySelector(".gis-assign-banner")), "Move location opens the assign panel and banner");
  const tA = await pane();
  const fr = await q(page, () => { const r = document.querySelector(".gis-frame").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  await page.mouse.click(fr[0] + fr[2] / 2 + 30, fr[1] + fr[3] / 2 + 20); await sleep(600);
  const prev = await q(page, () => document.querySelector(".gis-assign-preview")?.innerText || "");
  ok(prev.includes("Inside Barangay Binitayan") && /\d+\.\d{7}, \d+\.\d{7}/.test(prev), "clicking inside the barangay previews the point", prev);
  ok(await q(page, () => !!document.querySelector(".gis-house.is-preview") && !!document.querySelector(".gis-house.is-ghost")), "preview marker and old-location ghost shown");
  ok((await pane()) === tA, "picking a point does not pan the map");
  await page.screenshot({ path: `${OUT}/gis_desktop_assign.png` });
  await page.evaluate(() => [...document.querySelectorAll(".gis-assign button")].find((b) => b.textContent === "Review and save").click()); await sleep(300);
  ok(await q(page, () => document.querySelector(".gis-confirm")?.innerText.includes("Save this location for")), "confirmation step before saving");
  ok(saved === null, "nothing sent before confirming");
  await page.evaluate(() => [...document.querySelectorAll(".gis-confirm button")].find((b) => b.textContent.includes("Confirm")).click()); await sleep(1500);
  ok(saved && saved.household_id === 7 && /^\d+\.\d{7}$/.test(saved.latitude), "confirm sends household 7 with 7-decimal coordinates", saved);
  ok(await q(page, () => !document.querySelector(".gis-assign") && document.querySelector(".alert-success")?.textContent.includes("Map location saved")), "panel closes with a success message");
  await page.setRequestInterception(false);

  ok(errs.length === 0, "no JavaScript errors (admin desktop)", errs.slice(0, 4));
  await page.close();
}

// ---------------- personnel desktop
{
  const { page, errs } = await open(SESS.personnel, 1280, 800, "/personnel/map");
  ok(await q(page, () => document.querySelectorAll(".gis-map .gis-house").length) === 8, "personnel: map loads with 8 markers");
  ok(errs.length === 0, "personnel: no JavaScript errors", errs.slice(0, 3));
  await page.close();
}

// ---------------- admin mobile
{
  const { page, errs } = await open(SESS.admin, 390, 844);
  ok(await q(page, () => document.documentElement.scrollWidth <= window.innerWidth + 1), "390px: no horizontal page scroll", await q(page, () => document.documentElement.scrollWidth));
  ok(await q(page, () => document.querySelectorAll(".gis-map .gis-house").length) === 8, "390px: markers render");
  ok(await q(page, () => { const el = document.querySelector(".gis-toolbar .gis-tool"); const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }), "390px: toolbar visible above the map");
  const t0 = await q(page, () => document.querySelector(".gis-map .leaflet-map-pane").style.transform);
  const [cx, cy] = await center(page, ".gis-frame");
  await page.touchscreen.touchStart(cx, cy); await page.touchscreen.touchMove(cx + 120, cy + 80); await page.touchscreen.touchEnd(); await sleep(500);
  ok((await q(page, () => document.querySelector(".gis-map .leaflet-map-pane").style.transform)) === t0, "390px: one-finger swipe does not pan the map");
  await page.screenshot({ path: `${OUT}/gis_mobile_top.png` });
  await page.screenshot({ path: `${OUT}/gis_mobile_full.png`, fullPage: true });
  ok(errs.length === 0, "mobile: no JavaScript errors", errs.slice(0, 3));
  await page.close();
}

// ---------------- resident cannot open the staff map
{
  const { page } = await open(SESS.resident, 1280, 800);
  ok(!(await q(page, () => !!document.querySelector(".gis-map"))) && !page.url().endsWith("/admin/map"), "resident is not shown the staff map", page.url());
  await page.close();
}

await browser.close();
console.log(`\nGIS UI CHECK: ${res.filter(Boolean).length}/${res.length} passed`);
process.exit(res.every(Boolean) ? 0 : 1);
