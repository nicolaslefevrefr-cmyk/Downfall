"use strict";
/* =========================================================================
   Chute Libre — rendu partagé (canvas)
   Ce module ne connaît que l'état exposé par engine.js (level, player,
   objects, mode, now) et un <canvas id="game">. Il est utilisé tel quel
   par le jeu (main.js) ET par l'éditeur en mode test, pour garantir un
   rendu strictement identique aux deux endroits.
   ========================================================================= */

const canvas = document.getElementById("game");
const ctx2d = canvas.getContext("2d");

/* Transition en fondu vers/depuis le noir — utilisée par le jeu pour
   adoucir la mort et les changements de niveau. Neutre par défaut (alpha
   toujours à 0, aucun effet) tant que fadeTransition() n'est pas appelée ;
   l'éditeur (qui partage ce fichier pour son mode test) ne l'utilise pas. */
let fadeAlpha = 0, fadeDir = 0, fadeSpeed = 0, fadeMidCallback = null;
function fadeTransition(midCallback, fadeMs){
  fadeSpeed = 1 / ((fadeMs || 220) / 1000);
  fadeDir = 1;
  fadeMidCallback = midCallback || null;
}
function updateFade(dt){
  if(fadeDir === 0) return;
  fadeAlpha += fadeDir * fadeSpeed * dt;
  if(fadeDir > 0 && fadeAlpha >= 1){
    fadeAlpha = 1;
    if(fadeMidCallback){ const cb = fadeMidCallback; fadeMidCallback = null; cb(); }
    fadeDir = -1;
  } else if(fadeDir < 0 && fadeAlpha <= 0){
    fadeAlpha = 0; fadeDir = 0;
  }
}
function drawFadeOverlay(){
  if(fadeAlpha <= 0) return;
  ctx2d.save();
  ctx2d.setTransform(1,0,0,1,0,0);
  ctx2d.globalAlpha = fadeAlpha;
  ctx2d.fillStyle = "#000";
  ctx2d.fillRect(0,0,canvas.width,canvas.height);
  ctx2d.restore();
}

function drawRounded(x,y,w,h,r){
  ctx2d.beginPath();
  ctx2d.moveTo(x+r,y);
  ctx2d.arcTo(x+w,y,x+w,y+h,r);
  ctx2d.arcTo(x+w,y+h,x,y+h,r);
  ctx2d.arcTo(x,y+h,x,y,r);
  ctx2d.arcTo(x,y,x+w,y,r);
  ctx2d.closePath();
}
function drawRoundedCentered(w,h,r){
  const x=-w/2, y=-h/2;
  ctx2d.beginPath();
  ctx2d.moveTo(x+r,y);
  ctx2d.arcTo(x+w,y,x+w,y+h,r);
  ctx2d.arcTo(x+w,y+h,x,y+h,r);
  ctx2d.arcTo(x,y+h,x,y,r);
  ctx2d.arcTo(x,y,x+w,y,r);
  ctx2d.closePath(); ctx2d.fill();
}

/* Brique rouge homogène : utilisée pour TOUTES les plateformes (sûres et
   pièges) afin qu'aucun indice visuel ne trahisse un piège avant qu'il ne
   se déclenche. Le motif est calculé à partir des coordonnées absolues,
   donc les briques s'alignent naturellement entre objets adjacents. */
/* Taille de grille du jeu (20px), utilisée pour caler le carrelage des
   blocs sur les mêmes unités que l'éditeur. */
const GRID_SIZE = 20;

/* Carrelage du bloc Mario (block.png, 16x16 d'origine) mis à l'échelle sur
   la grille du jeu : autant de tuiles que nécessaire pour couvrir la zone,
   calées sur des multiples de GRID_SIZE à partir de l'origine du monde
   (pas du coin de l'objet) pour que des objets adjacents non alignés sur
   la grille se raccordent quand même visuellement. Tant que l'image n'est
   pas chargée, on retombe sur l'ancien motif vectoriel (aucun flash blanc). */
/* Plante piranha : une image par unité de grille de largeur (20px, comme
   pour les blocs), toutes animées EN MÊME TEMPS via une horloge globale
   (pas de phase par objet) — change de frame chaque seconde. Ancrées par
   le bas (elles "poussent" depuis le sol de l'objet, comme les pics
   avant elles). Repli vectoriel (triangles) tant que l'image ne charge pas. */
function plantFrameIndex(){
  return Math.floor(now/1000) % PLANT_SPRITES.length;
}
function drawPlantRow(x,y,w,h){
  const img = PLANT_SPRITES[plantFrameIndex()];
  const n = Math.max(1, Math.round(w/GRID_SIZE));
  if(!img || !img.complete || !img.naturalWidth){
    ctx2d.fillStyle = "#e0455c";
    const cw = w/n;
    for(let i=0;i<n;i++){
      const sx = x + i*cw;
      ctx2d.beginPath();
      ctx2d.moveTo(sx, y+h); ctx2d.lineTo(sx+cw/2, y); ctx2d.lineTo(sx+cw, y+h);
      ctx2d.closePath(); ctx2d.fill();
    }
    return;
  }
  ctx2d.imageSmoothingEnabled = false;
  const scale = GRID_SIZE/img.naturalWidth;
  const dw = GRID_SIZE, dh = img.naturalHeight*scale;
  for(let i=0;i<n;i++){
    const cx = x + i*GRID_SIZE + GRID_SIZE/2;
    ctx2d.drawImage(img, cx-dw/2, y+h-dh, dw, dh);
  }
}

function drawBlockTile(x,y,w,h){
  ctx2d.save();
  ctx2d.beginPath(); ctx2d.rect(x,y,w,h); ctx2d.clip();
  if(SPRITE_BLOCK.complete && SPRITE_BLOCK.naturalWidth>0){
    ctx2d.imageSmoothingEnabled = false;
    const startX = Math.floor(x/GRID_SIZE)*GRID_SIZE;
    const startY = Math.floor(y/GRID_SIZE)*GRID_SIZE;
    for(let ty=startY; ty<y+h; ty+=GRID_SIZE){
      for(let tx=startX; tx<x+w; tx+=GRID_SIZE){
        ctx2d.drawImage(SPRITE_BLOCK, tx, ty, GRID_SIZE, GRID_SIZE);
      }
    }
  } else {
    drawBrick(x,y,w,h);
  }
  ctx2d.restore();
}

function drawBrick(x,y,w,h){
  const brickW = 22, brickH = 11, gap = 2;
  ctx2d.save();
  ctx2d.beginPath(); ctx2d.rect(x,y,w,h); ctx2d.clip();
  ctx2d.fillStyle = "#d8c6ad";
  ctx2d.fillRect(x,y,w,h);
  ctx2d.fillStyle = "#a1382a";
  let row = Math.floor(y / brickH);
  for(let ry = Math.floor(y/brickH)*brickH; ry < y+h; ry += brickH){
    const rh = Math.min(brickH-gap, y+h-Math.max(ry,y));
    const rowTop = Math.max(ry,y);
    if(rh<=0){ row++; continue; }
    const offset = (row % 2 === 0) ? 0 : -brickW/2;
    for(let bx = Math.floor((x-offset)/brickW)*brickW+offset; bx < x+w; bx += brickW){
      const left = Math.max(bx,x);
      const right = Math.min(bx+brickW-gap, x+w);
      if(right>left) ctx2d.fillRect(left, rowTop, right-left, rh);
    }
    row++;
  }
  ctx2d.restore();
}
function drawStoneBrick(x,y,w,h){
  const brickW = 20, brickH = 12, gap = 2;
  ctx2d.save();
  ctx2d.beginPath(); ctx2d.rect(x,y,w,h); ctx2d.clip();
  ctx2d.fillStyle = "#c7cbd6";
  ctx2d.fillRect(x,y,w,h);
  ctx2d.fillStyle = "#575d6e";
  let row = Math.floor(y / brickH);
  for(let ry = Math.floor(y/brickH)*brickH; ry < y+h; ry += brickH){
    const rh = Math.min(brickH-gap, y+h-Math.max(ry,y));
    const rowTop = Math.max(ry,y);
    if(rh<=0){ row++; continue; }
    const offset = (row % 2 === 0) ? 0 : -brickW/2;
    for(let bx = Math.floor((x-offset)/brickW)*brickW+offset; bx < x+w; bx += brickW){
      const left = Math.max(bx,x);
      const right = Math.min(bx+brickW-gap, x+w);
      if(right>left) ctx2d.fillRect(left, rowTop, right-left, rh);
    }
    row++;
  }
  ctx2d.restore();
}

/* Porte : un cadre arrondi + un panneau intérieur + une barre + une
   poignée, plutôt qu'un simple rectangle bleu. Utilisée à la fois pour la
   sortie et pour un objet de type "door" (porte-leurre, etc.). */
function drawDoorShape(x,y,w,h, mainColor, panelColor, knobColor){
  ctx2d.save();
  const r = Math.min(w,h)*0.18;
  ctx2d.fillStyle = mainColor;
  ctx2d.beginPath();
  ctx2d.moveTo(x, y+h);
  ctx2d.lineTo(x, y+r);
  ctx2d.quadraticCurveTo(x, y, x+r, y);
  ctx2d.lineTo(x+w-r, y);
  ctx2d.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx2d.lineTo(x+w, y+h);
  ctx2d.closePath();
  ctx2d.fill();

  const pad = w*0.14;
  const px=x+pad, py=y+pad*1.3, pw=w-pad*2, ph=h-pad*2.1;
  const pr = pw*0.22;
  ctx2d.fillStyle = panelColor;
  ctx2d.beginPath();
  ctx2d.moveTo(px, py+ph);
  ctx2d.lineTo(px, py+pr);
  ctx2d.quadraticCurveTo(px, py, px+pr, py);
  ctx2d.lineTo(px+pw-pr, py);
  ctx2d.quadraticCurveTo(px+pw, py, px+pw, py+pr);
  ctx2d.lineTo(px+pw, py+ph);
  ctx2d.closePath();
  ctx2d.fill();

  ctx2d.strokeStyle = mainColor; ctx2d.lineWidth = Math.max(1.5, w*0.05);
  ctx2d.beginPath(); ctx2d.moveTo(px, py+ph*0.55); ctx2d.lineTo(px+pw, py+ph*0.55); ctx2d.stroke();

  ctx2d.fillStyle = knobColor;
  ctx2d.beginPath(); ctx2d.arc(x+w-pad*1.3, y+h*0.55, Math.max(2, w*0.07), 0, Math.PI*2); ctx2d.fill();
  ctx2d.restore();
}

function drawObject(o){
  if(o.visible === false) return;
  const shakeOff = (o.state === "shaking") ? Math.sin(now*0.06)*2 : 0;
  ctx2d.save();
  ctx2d.translate(shakeOff,0);
  if(o.angle){
    const cx = o.x+o.w/2, cy = o.y+o.h/2;
    ctx2d.translate(cx,cy); ctx2d.rotate(o.angle*Math.PI/180); ctx2d.translate(-cx,-cy);
  }
  switch(o.kind){
    case "static":
      drawBlockTile(o.x,o.y,o.w,o.h);
      break;
    case "falling":
      drawBlockTile(o.x,o.y,o.w,o.h);
      if(o.state==="shaking" || o.state==="falling"){
        ctx2d.strokeStyle = "rgba(40,20,10,.55)"; ctx2d.lineWidth=1.5;
        ctx2d.beginPath();
        ctx2d.moveTo(o.x+o.w*0.32,o.y+2); ctx2d.lineTo(o.x+o.w*0.45,o.y+o.h*0.6);
        ctx2d.lineTo(o.x+o.w*0.38,o.y+o.h-2);
        ctx2d.stroke();
      }
      break;
    case "hidden_spike":
      if(o.hazard){
        drawPlantRow(o.x,o.y,o.w,o.h);
      }
      break;
    case "door":
      drawDoorShape(o.x,o.y,o.w,o.h, "#3d5af1", "#eef0ff", "#1f2d8a");
      break;
    case "button":
      drawStoneBrick(o.x,o.y,o.w,o.h);
      {
        const cx = o.x+o.w/2, cy = o.y+o.h/2;
        const r = Math.min(o.w,o.h) * 0.22;
        ctx2d.fillStyle = o.state==="activated" ? "#4f8f6a" : "#8a6a3a";
        ctx2d.beginPath(); ctx2d.arc(cx,cy,r,0,Math.PI*2); ctx2d.fill();
        ctx2d.strokeStyle = "rgba(30,20,10,.35)"; ctx2d.lineWidth = 1.5; ctx2d.stroke();
      }
      break;
    case "gate":
      drawBlockTile(o.x,o.y,o.w,o.h);
      break;
    case "blocker":
      drawBlockTile(o.x,o.y,o.w,o.h);
      ctx2d.strokeStyle = "rgba(224,69,92,.55)"; ctx2d.lineWidth = 2;
      ctx2d.strokeRect(o.x+1,o.y+1,o.w-2,o.h-2);
      break;
  }
  ctx2d.restore();
}

function drawExit(){
  const e = level.exit;
  if(SPRITE_TUBE.complete && SPRITE_TUBE.naturalWidth>0){
    ctx2d.save();
    ctx2d.imageSmoothingEnabled = false;
    ctx2d.drawImage(SPRITE_TUBE, e.x, e.y, e.w, e.h);
    ctx2d.restore();
  } else {
    const c = mode==="won" ? "#2fb380" : "#3a9c6c";
    drawDoorShape(e.x,e.y,e.w,e.h, c, "#eafff3", "#164a33");
  }
}

/* Personnage joueur : un bonhomme-bâton (tête ronde, tronc, bras, jambes)
   qui s'anime à la marche et prend une pose différente en l'air — identique
   au mode test de l'éditeur. (walkPhase vit dans engine.js, mis à jour à
   chaque frame avec la vitesse du joueur.) */
function drawStickFigure(w, h, grounded, phase, dead, speedFrac){
  const x = -w/2, y = -h/2;
  const headR = 5;
  const midX = x + w/2;
  const headCY = y + headR + 1;
  const shoulderY = y + headR*2 + 4;
  const hipY = y + h*0.58;
  const footY = y + h;
  const amp = grounded ? (speedFrac!=null?speedFrac:1) : 1;
  const swing = grounded ? Math.sin(phase)*amp : 0;
  const legOffset = grounded ? swing*8 : 0;
  const armOffset = grounded ? -swing*7 : 0;

  ctx2d.strokeStyle = dead ? "#b8bccb" : "#2a2d3d";
  ctx2d.lineWidth = 2.4; ctx2d.lineCap = "round"; ctx2d.lineJoin = "round";

  ctx2d.beginPath(); ctx2d.arc(midX, headCY, headR, 0, Math.PI*2);
  ctx2d.fillStyle = dead ? "#d7d9e4" : "#3d5af1"; ctx2d.fill(); ctx2d.stroke();

  ctx2d.beginPath(); ctx2d.moveTo(midX, shoulderY); ctx2d.lineTo(midX, hipY); ctx2d.stroke();

  ctx2d.beginPath(); ctx2d.moveTo(midX, shoulderY+2); ctx2d.lineTo(midX-8, shoulderY+13+armOffset); ctx2d.stroke();
  ctx2d.beginPath(); ctx2d.moveTo(midX, shoulderY+2); ctx2d.lineTo(midX+8, shoulderY+13-armOffset); ctx2d.stroke();

  if(grounded){
    ctx2d.beginPath(); ctx2d.moveTo(midX, hipY); ctx2d.lineTo(midX-6-legOffset, footY); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.moveTo(midX, hipY); ctx2d.lineTo(midX+6+legOffset, footY); ctx2d.stroke();
  } else {
    ctx2d.beginPath(); ctx2d.moveTo(midX, hipY); ctx2d.lineTo(midX-9, hipY+8); ctx2d.lineTo(midX-5, footY); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.moveTo(midX, hipY); ctx2d.lineTo(midX+9, hipY+8); ctx2d.lineTo(midX+5, footY); ctx2d.stroke();
  }
}
function drawPlayer(){
  /* Sprite Mario si l'image est chargée, sinon repli sur la silhouette
     bonhomme-bâton (aucun flash blanc/cassé pendant le chargement). */
  const facingRight = player.facing >= 0;
  let img;
  if(!player.grounded){
    img = facingRight ? MARIO_SPRITES.jumpR : MARIO_SPRITES.jumpL;
  } else if(Math.abs(player.vx) > 5){
    const set = facingRight ? MARIO_SPRITES.walkR : MARIO_SPRITES.walkL;
    img = set[Math.floor(walkPhase*0.6) % set.length];
  } else {
    img = facingRight ? MARIO_SPRITES.idleR : MARIO_SPRITES.idleL;
  }

  if(!img || !img.complete || !img.naturalWidth){
    ctx2d.save();
    ctx2d.translate(player.x+player.w/2, player.y+player.h/2);
    ctx2d.scale(player.facing, currentGravity<0 ? -1 : 1);
    drawStickFigure(player.w, player.h, player.grounded, walkPhase, mode==="dead", Math.min(1, Math.abs(player.vx)/80));
    ctx2d.restore();
    return;
  }

  const scale = player.h / img.naturalHeight;
  const dw = img.naturalWidth*scale, dh = img.naturalHeight*scale;
  ctx2d.save();
  ctx2d.imageSmoothingEnabled = false;
  if(mode==="dead") ctx2d.globalAlpha = 0.55;
  ctx2d.translate(player.x+player.w/2, player.y+player.h/2);
  /* La gravité inversée retourne le personnage autour du CENTRE de sa
     boîte (pas de ses pieds) : ses pieds, dessinés en bas dans le repère
     non retourné, se retrouvent donc bien en haut — collés au "plafond". */
  if(currentGravity<0) ctx2d.scale(1,-1);
  ctx2d.drawImage(img, -dw/2, player.h/2-dh, dw, dh);
  ctx2d.restore();
}

/* Ne montre que la zone jouable (entre les murs de bordure) : tout le
   reste (les murs eux-mêmes, et au-delà) reste en noir — comme si les
   bornes étaient le cadre même de l'écran. Si le niveau n'a pas de murs
   de bordure, on retombe sur le monde 800x450 entier. */
/* Ciel + nuages : couleur de fond fixe (sky.png), et 2-3 nuages (parmi 3
   tailles) placés aléatoirement à chaque niveau, dérivant lentement et
   TOUS dans le même sens (choisi une fois par niveau) — pas chacun pour
   soi. Ils bouclent d'un bord à l'autre de l'écran. */
let clouds = [];
let cloudDriftDir = 1;
function initClouds(){
  const count = 2 + Math.floor(Math.random()*2); // 2 ou 3
  cloudDriftDir = Math.random()<0.5 ? -1 : 1;
  clouds = [];
  for(let i=0;i<count;i++){
    clouds.push({
      spriteIdx: Math.floor(Math.random()*CLOUD_SPRITES.length),
      x: Math.random()*W,
      y: 14 + Math.random()*70,
    });
  }
}
const CLOUD_SPEED = 6; // px/s — très lent, homogène pour tous les nuages
function updateClouds(dt){
  for(const c of clouds){
    c.x += cloudDriftDir*CLOUD_SPEED*dt;
    if(c.x > W+90) c.x = -90;
    if(c.x < -90) c.x = W+90;
  }
}
function drawClouds(){
  for(const c of clouds){
    const img = CLOUD_SPRITES[c.spriteIdx];
    if(!img || !img.complete || !img.naturalWidth) continue;
    ctx2d.drawImage(img, c.x, c.y, img.naturalWidth, img.naturalHeight);
  }
}

function computePlayArea(){
  const top = objects.find(o=>o.id==="_boundTop");
  const left = objects.find(o=>o.id==="_boundLeft");
  const right = objects.find(o=>o.id==="_boundRight");
  const x0 = left ? left.x+left.w : 0;
  const y0 = top ? top.y+top.h : 0;
  const x1 = right ? right.x : W;
  /* Pas de mur de bordure en bas (par design : la chute dans le vide est
     la façon de mourir, donc rien de solide n'y est jamais posé) — la
     bande noire du bas est donc purement un recadrage d'affichage. On
     reprend l'épaisseur du mur du haut pour rester visuellement cohérent
     avec les trois autres côtés, quelle que soit l'épaisseur choisie par
     le niveau (le sol continue derrière, comme les murs le font déjà). */
  const bottomMargin = top ? top.h : (left ? left.w : 20);
  const y1 = H - bottomMargin;
  return { x:x0, y:y0, w:Math.max(1,x1-x0), h:Math.max(1,y1-y0) };
}

function render(){
  ctx2d.clearRect(0,0,W,H);
  ctx2d.fillStyle = "#000";
  ctx2d.fillRect(0,0,W,H);
  ctx2d.save();
  const area = computePlayArea();
  ctx2d.beginPath(); ctx2d.rect(area.x,area.y,area.w,area.h); ctx2d.clip();
  ctx2d.fillStyle = SKY_COLOR;
  ctx2d.fillRect(0,0,W,H);
  drawClouds();
  drawExit();
  for(const o of objects) drawObject(o);
  drawPlayer();
  ctx2d.restore();
  drawFadeOverlay();
}

/* Boucle de jeu générique, partagée. `loopRunning` permet à l'éditeur de
   l'arrêter proprement en quittant le mode test (le jeu, lui, ne l'arrête
   jamais). */
let loopRunning = true;
let lastTs = null;
function frame(ts){
  if(!loopRunning) return;
  if(lastTs === null) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if(dt > 1/30) dt = 1/30;
  updateFade(dt);
  updateClouds(dt);
  if(mode === "playing") update(dt);
  render();
  requestAnimationFrame(frame);
}
function startLoop(){
  if(loopRunning) return;
  loopRunning = true; lastTs = null;
  requestAnimationFrame(frame);
}
function stopLoop(){ loopRunning = false; }
