"use strict";
/* =========================================================================
   Free Fall — game interface, input, PWA
   Rendering (canvas, drawing objects) lives in render.js, shared with the
   editor. This file only handles the game itself: HUD, drawer of
   ========================================================================= */


const levelNameEl = document.getElementById("levelName");
const levelDiffEl = document.getElementById("levelDiff");
function stars(n){ return "★".repeat(n) + "☆".repeat(5-n); }
function updateHUD(){
  levelNameEl.textContent = level.name;
  levelDiffEl.textContent = stars(level.difficulty);
  renderDrawer();
}

const levelMapNodesEl = document.getElementById("levelMapNodes");
const levelMapPathEl = document.getElementById("levelMapPath");
const levelMapWrapEl = document.getElementById("levelMapWrap");
const statsBlockEl = document.getElementById("statsBlock");
const trapLogEl = document.getElementById("trapLog");

/* Built-in levels in their intended progression order, then imported /
   Firebase levels sorted by identifier (numerically when possible — level
   identifiers are randomly assigned at creation, which gives a fixed but
   unchosen order — unless an explicit "order" field overrides it). */
function orderedLevels(){
  const rest = IMPORTED_LEVELS.concat(FIREBASE_LEVELS).slice().sort((a,b)=>{
    /* The "order" field (editable from the editor's Organize tab) takes
       priority over the random numeric identifier, which is only a
     fallback for levels that have never been reordered. */
    if(a.order != null && b.order != null) return a.order - b.order;
    if(a.order != null) return -1;
    if(b.order != null) return 1;
    const na = parseInt(a.id,10), nb = parseInt(b.id,10);
    if(!isNaN(na) && !isNaN(nb)) return na-nb;
    return String(a.id).localeCompare(String(b.id));
  });
  return LEVELS_SOURCE.concat(rest);
}

/* "Snake" map: levels are laid out in a grid of MAP_COLS columns, in a
   zigzag (one row starts from the left, the next from the right), bottom
   to top — like a progression trail. A curved line connects the tiles in
   order, with a small rounded turn at each bend. */
const MAP_COLS = 3, MAP_NODE = 52, MAP_COLGAP = 96, MAP_ROWGAP = 96, MAP_PAD = 36;
function nodeCenter(i){
  const row = Math.floor(i / MAP_COLS);
  const posInRow = i % MAP_COLS;
  const col = (row % 2 === 0) ? posInRow : (MAP_COLS - 1 - posInRow);
  return { x: MAP_PAD + col*MAP_COLGAP + MAP_NODE/2, rowFromBottom: row };
}
function renderLevelMap(){
  const levels = orderedLevels();
  const n = levels.length;
  const totalRows = Math.max(1, Math.ceil(n / MAP_COLS));
  const contentHeight = MAP_PAD*2 + (totalRows-1)*MAP_ROWGAP + MAP_NODE;
  const contentWidth = MAP_PAD*2 + (MAP_COLS-1)*MAP_COLGAP + MAP_NODE;

  levelMapWrapEl.style.height = Math.min(contentHeight, window.innerHeight*0.52) + "px";
  levelMapNodesEl.style.height = contentHeight + "px";
  levelMapNodesEl.style.width = contentWidth + "px";
  levelMapPathEl.setAttribute("width", contentWidth);
  levelMapPathEl.setAttribute("height", contentHeight);

  const centers = [];
  levelMapNodesEl.innerHTML = "";
  let firstUnlockedTop = null;
  for(let i=0;i<n;i++){
    const lv = levels[i];
    const c = nodeCenter(i);
    const y = contentHeight - MAP_PAD - c.rowFromBottom*MAP_ROWGAP - MAP_NODE/2;
    centers.push({ x:c.x, y });

    const p = progress[lv.id] || {attempts:0, discovered:[], completed:false};
    const unlocked = i===0 || (progress[levels[i-1].id] && progress[levels[i-1].id].completed);
    let state = "locked";
    if(unlocked) state = p.completed ? "completed" : (p.attempts>0 ? "attempted" : "unlocked");

    const node = document.createElement("div");
    node.className = "levelNode " + state + (lv.id===level.id ? " current" : "");
    node.style.left = (c.x - MAP_NODE/2) + "px";
    node.style.top = (y - MAP_NODE/2) + "px";
    node.textContent = state==="locked" ? "🔒" : String(i+1);
    node.title = lv.name + (state==="locked" ? " (locked)" : "");
    if(unlocked){
      node.addEventListener("click", () => { fadeTransition(() => buildLevel(lv)); closeDrawer(); });
      if(firstUnlockedTop===null || !p.completed) firstUnlockedTop = y;
    }
    levelMapNodesEl.appendChild(node);
  }

  // Curved line connecting the tiles in order, with a rounded turn at each bend.
  let d = "";
  if(centers.length){
    d = "M "+centers[0].x+" "+centers[0].y;
    for(let i=1;i<centers.length-1;i++){
      const mx = (centers[i].x+centers[i+1].x)/2, my = (centers[i].y+centers[i+1].y)/2;
      d += " Q "+centers[i].x+" "+centers[i].y+" "+mx+" "+my;
    }
    if(centers.length>1){ const last=centers[centers.length-1]; d += " L "+last.x+" "+last.y; }
  }
  levelMapPathEl.innerHTML = '<path d="'+d+'" fill="none" stroke="#c7cce0" stroke-width="6" stroke-linecap="round"/>';

  // Scrolls to show the current level / the next one to play.
  const targetY = (function(){
    const idx = levels.findIndex(lv=>lv.id===level.id);
    return idx>=0 ? centers[idx].y : (firstUnlockedTop||contentHeight);
  })();
  levelMapWrapEl.scrollTop = Math.max(0, targetY - levelMapWrapEl.clientHeight/2);
}

function renderDrawer(){
  renderLevelMap();
  const p = progress[level.id];
  statsBlockEl.innerHTML =
    '<div class="statLine"><span>Attempts (level)</span><span>'+p.attempts+'</span></div>'+
    '<div class="statLine"><span>Traps discovered</span><span>'+p.discovered.length+'</span></div>'+
    '<div class="statLine"><span>Level completed</span><span>'+(p.completed?"yes":"no")+'</span></div>';
  trapLogEl.innerHTML = "";
  if(!p.discovered.length){
    trapLogEl.innerHTML = '<div class="trapEmpty">No traps discovered yet. Die once to start figuring the level out.</div>';
  } else {
    for(const id of p.discovered){
      const def = level.objects.find(o=>o.id===id);
      if(!def) continue;
      const entry = document.createElement("div");
      entry.className = "trapEntry";
      entry.innerHTML = "<b>"+id+"</b>"+(def.description||"");
      trapLogEl.appendChild(entry);
    }
  }
}

const drawerEl = document.getElementById("drawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
function openDrawer(){ drawerEl.classList.add("open"); drawerBackdrop.classList.add("show"); renderDrawer(); }
function closeDrawer(){ drawerEl.classList.remove("open"); drawerBackdrop.classList.remove("show"); }
document.getElementById("menuBtn").addEventListener("click", openDrawer);
document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);

/* Hooks called from engine.js */
function onLevelBuilt(){ updateHUD(); }
function onGameOver(result){
  updateHUD();
  if(result === "dead"){
    fadeTransition(()=>{}, 160); // small black flash at the moment of impact
    setTimeout(() => { fadeTransition(() => buildLevel(level)); }, 700);
  } else {
    setTimeout(() => {
      const levels = orderedLevels();
      const idx = levels.findIndex(lv => lv.id === level.id);
      const next = levels[idx+1] || levels[0];
      fadeTransition(() => buildLevel(next));
    }, 1100);
  }
}

/* ---------------------------- Input ---------------------------- */
window.addEventListener("keydown", (e) => {
  if(["ArrowLeft","q","Q","a","A"].includes(e.key)){ input.left = true; e.preventDefault(); }
  if(["ArrowRight","d","D"].includes(e.key)){ input.right = true; e.preventDefault(); }
  if(["ArrowUp"," ","w","W","z","Z"].includes(e.key)){ input.jumpQueued = true; e.preventDefault(); }
  if(e.key === "r" || e.key === "R") fadeTransition(() => buildLevel(level));
});
window.addEventListener("keyup", (e) => {
  if(["ArrowLeft","q","Q","a","A"].includes(e.key)) input.left = false;
  if(["ArrowRight","d","D"].includes(e.key)) input.right = false;
});
/* Touch buttons: capture the pointer on press rather than relying on
   "pointerleave". Without capture, the tiniest finger tremor that drifts a
   single pixel outside the button fires "pointerleave" and releases the
   key while the finger is still down — the most common cause of movement
   that "sticks" while still pressed. With setPointerCapture, only a real
   release (pointerup/cancel) counts. */
function bindHold(el, onDown, onUp){
  el.style.touchAction = "none";
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if(el.setPointerCapture) el.setPointerCapture(e.pointerId);
    onDown();
  });
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
}
bindHold(document.getElementById("btnLeft"), () => input.left=true, () => input.left=false);
bindHold(document.getElementById("btnRight"), () => input.right=true, () => input.right=false);
bindHold(document.getElementById("btnJump"), () => input.jumpQueued=true, () => {});

/* ---------------------------- Manual level import (JSON) ---------------------------- */
/* Lets you verify that a level designed in the editor behaves identically
   once loaded here, in the real game — same engine, same
   levels.js/engine.js/render.js files. Firebase integration (automatic
   loading of all remote levels) supplements this; import also stays
   available manually, locally. */
document.getElementById("btnImportLevel").addEventListener("click", () => {
  document.getElementById("fileImportLevel").click();
});
document.getElementById("fileImportLevel").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      /* Accepts a single level (the format exported by the editor), or for
         convenience an older multi-level export ({levels:[...]} or an
         array), from which only the first level is used. */
      let imported;
      if(Array.isArray(parsed)) imported = parsed[0];
      else if(parsed.levels) imported = parsed.levels[0];
      else imported = parsed;
      if(!imported || !Array.isArray(imported.objects)) throw new Error("unexpected level format");
      if(!imported.playerStart) imported.playerStart = {x:40,y:372};
      if(!imported.exit) imported.exit = {x:720,y:360,w:40,h:60};
      if(!imported.difficulty) imported.difficulty = 1;
      if(!imported.name) imported.name = imported.id || "Imported level";
      if(!imported.id) imported.id = "imported"+Date.now();
      // Avoids overwriting the progress of a level that's already present (built-in or already imported).
      const taken = allLevels().some(lv => lv.id === imported.id);
      if(taken) imported.id = imported.id + "-" + Date.now();
      IMPORTED_LEVELS.push(imported);
      ensureLevelProgress(imported.id);
      fadeTransition(() => buildLevel(imported));
      closeDrawer();
    }catch(err){ alert("Invalid JSON file: " + err.message); }
  };
  reader.readAsText(file);
  e.target.value = "";
});

/* ---------------------------- Firebase (loading FINAL levels) ----------------------------
   Driven only by js/firebase-config.js — no setting can be changed from
   the interface: the only way to point at a different database is to
   edit that file directly before deploying. */
/* Loads every level marked "FINAL" on Firebase and adds it to the playable
   list. Silent if no database is configured, or on a network failure (the
   game stays playable with the built-in levels). */
async function loadFirebaseFinalLevels(){
  const settings = getFirebaseSettings();
  if(!settings.databaseURL) return 0;
  try{
    const levels = await firebaseListLevels(settings);
    FIREBASE_LEVELS = [];
    for(const id of Object.keys(levels)){
      const lv = levels[id];
      if(lv && lv.status === "FINAL" && Array.isArray(lv.objects)){
        FIREBASE_LEVELS.push(lv);
        ensureLevelProgress(lv.id || id);
      }
    }
    renderDrawer();
    return FIREBASE_LEVELS.length;
  }catch(err){
    return -1;
  }
}
/* On the very first page load, if a database is already configured
   (firebase-config.js file), FINAL levels are fetched without asking the
   user anything. */
loadFirebaseFinalLevels();

/* ---------------------------- PWA ---------------------------- */
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
  /* As soon as a new service worker version takes over (after a
     deployment), the page reloads once automatically — otherwise the page
     already open keeps using the old files still in memory until
     until the page is refreshed manually. */
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if(swRefreshing) return;
    swRefreshing = true;
    window.location.reload();
  });
}

/* Fullscreen on first contact (only when the app is already running as an
   installed PWA — pointless and a bit intrusive in a plain browser tab, so
   it isn't attempted there). The Fullscreen API requires a user gesture,
   hence the "once" listener on the first press. */
function isStandalonePwa(){
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches || window.navigator.standalone === true;
}
if(isStandalonePwa() && document.documentElement.requestFullscreen){
  const tryFullscreen = () => {
    document.documentElement.requestFullscreen().catch(() => {});
    window.removeEventListener("pointerdown", tryFullscreen);
  };
  window.addEventListener("pointerdown", tryFullscreen, { once:true });
}
let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferredPrompt = e; installBtn.classList.add("show");
});
installBtn.addEventListener("click", async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null;
  installBtn.classList.remove("show");
});

/* ---------------------------- Startup ---------------------------- */
/* Landscape orientation lock (works mainly in an installed PWA / fullscreen).
   In a plain browser tab, the CSS fallback (#rotateOverlay) takes over
   regardless. */
if(matchMedia("(max-width: 900px)").matches && screen.orientation && screen.orientation.lock){
  screen.orientation.lock("landscape").catch(()=>{});
}

buildLevel(LEVELS_SOURCE[0]);
requestAnimationFrame(frame);
