"use strict";
/* =========================================================================
   Chute Libre — interface du jeu, entrées, PWA
   Le rendu (canvas, dessin des objets) vit dans render.js, partagé avec
   l'éditeur. Ce fichier ne s'occupe que du jeu lui-même : HUD, tiroir de
   niveaux, contrôles, overlay de victoire/défaite.
   ========================================================================= */

const overlayEl = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const overlayBtn = document.getElementById("overlayBtn");
function showOverlay(title,text,btn){
  overlayTitle.textContent = title; overlayText.textContent = text; overlayBtn.textContent = btn;
  overlayEl.classList.add("show");
}
function hideOverlay(){ overlayEl.classList.remove("show"); }
overlayBtn.addEventListener("click", () => { buildLevel(level); });

const levelNameEl = document.getElementById("levelName");
const levelDiffEl = document.getElementById("levelDiff");
function stars(n){ return "★".repeat(n) + "☆".repeat(5-n); }
function updateHUD(){
  levelNameEl.textContent = level.name;
  levelDiffEl.textContent = stars(level.difficulty);
  renderDrawer();
}

const levelListEl = document.getElementById("levelList");
const statsBlockEl = document.getElementById("statsBlock");
const trapLogEl = document.getElementById("trapLog");
function renderDrawer(){
  levelListEl.innerHTML = "";
  for(const lv of allLevels()){
    const p = progress[lv.id];
    const row = document.createElement("div");
    row.className = "levelRow" + (lv.id === level.id ? " active" : "");
    row.innerHTML = '<div><div class="lname">'+(p.completed?"✅ ":"")+lv.name+(IMPORTED_LEVELS.includes(lv)?" <small>(importé)</small>":"")+'</div>'+
      '<div class="lmeta">'+p.attempts+' tentative(s) · '+p.discovered.length+'/'+lv.objects.filter(o=>o.trap&&o.trap.trigger).length+' pièges vus</div></div>'+
      '<div class="lstars">'+stars(lv.difficulty)+'</div>';
    row.addEventListener("click", () => { buildLevel(lv); closeDrawer(); });
    levelListEl.appendChild(row);
  }
  const p = progress[level.id];
  statsBlockEl.innerHTML =
    '<div class="statLine"><span>Tentatives (niveau)</span><span>'+p.attempts+'</span></div>'+
    '<div class="statLine"><span>Pièges découverts</span><span>'+p.discovered.length+'</span></div>'+
    '<div class="statLine"><span>Niveau terminé</span><span>'+(p.completed?"oui":"non")+'</span></div>';
  trapLogEl.innerHTML = "";
  if(!p.discovered.length){
    trapLogEl.innerHTML = '<div class="trapEmpty">Aucun piège découvert pour l\'instant. Meurs une fois pour commencer à comprendre le niveau.</div>';
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

/* Hooks appelés par engine.js */
function onLevelBuilt(){ hideOverlay(); updateHUD(); }
function onGameOver(result){
  if(result === "dead"){
    showOverlay("💀 Perdu", lastCause, "Réessayer");
  } else {
    showOverlay("⭐ Niveau terminé", "Réussi en " + progress[level.id].attempts + " tentative(s).", "Rejouer");
  }
  updateHUD();
}

/* ---------------------------- Entrées ---------------------------- */
window.addEventListener("keydown", (e) => {
  if(["ArrowLeft","q","Q"].includes(e.key)){ input.left = true; e.preventDefault(); }
  if(["ArrowRight","d","D"].includes(e.key)){ input.right = true; e.preventDefault(); }
  if(["ArrowUp"," ","w","W","z","Z"].includes(e.key)){ input.jumpQueued = true; e.preventDefault(); }
  if(e.key === "r" || e.key === "R") buildLevel(level);
});
window.addEventListener("keyup", (e) => {
  if(["ArrowLeft","q","Q"].includes(e.key)) input.left = false;
  if(["ArrowRight","d","D"].includes(e.key)) input.right = false;
});
/* Boutons tactiles : on capture le pointeur au doigt levé/posé plutôt que de
   se fier à "pointerleave". Sans capture, un minuscule tremblement du doigt
   qui sort ne serait-ce qu'un pixel du bouton déclenche "pointerleave" et
   relâche la touche alors que le doigt est toujours posé — c'est la cause la
   plus fréquente d'un déplacement qui "se bloque" alors qu'on reste appuyé.
   Avec setPointerCapture, seul un vrai relâchement (pointerup/cancel) compte. */
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

/* ---------------------------- Import manuel de niveau (JSON) ---------------------------- */
/* Sert à vérifier qu'un niveau conçu dans l'éditeur se comporte à
   l'identique une fois chargé ici, dans le vrai jeu — même moteur, mêmes
   fichiers levels.js/engine.js/render.js. L'intégration Firebase (chargement
   automatique de tous les niveaux distants) viendra remplacer/compléter
   ceci plus tard ; pour l'instant l'import est manuel, en local. */
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
      /* Accepte un niveau seul (format exporté par l'éditeur), ou par
         confort un ancien export multi-niveaux ({levels:[...]} ou tableau)
         dont on ne reprend que le premier niveau. */
      let imported;
      if(Array.isArray(parsed)) imported = parsed[0];
      else if(parsed.levels) imported = parsed.levels[0];
      else imported = parsed;
      if(!imported || !Array.isArray(imported.objects)) throw new Error("format de niveau inattendu");
      if(!imported.playerStart) imported.playerStart = {x:40,y:372};
      if(!imported.exit) imported.exit = {x:720,y:360,w:40,h:60};
      if(!imported.difficulty) imported.difficulty = 1;
      if(!imported.name) imported.name = imported.id || "Niveau importé";
      if(!imported.id) imported.id = "imported"+Date.now();
      // Évite d'écraser la progression d'un niveau déjà présent (intégré ou déjà importé).
      const taken = allLevels().some(lv => lv.id === imported.id);
      if(taken) imported.id = imported.id + "-" + Date.now();
      IMPORTED_LEVELS.push(imported);
      ensureLevelProgress(imported.id);
      buildLevel(imported);
      closeDrawer();
    }catch(err){ alert("Fichier JSON invalide : " + err.message); }
  };
  reader.readAsText(file);
  e.target.value = "";
});

/* ---------------------------- PWA ---------------------------- */
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
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

/* ---------------------------- Démarrage ---------------------------- */
buildLevel(LEVELS_SOURCE[0]);
requestAnimationFrame(frame);
