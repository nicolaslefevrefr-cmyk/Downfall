"use strict";
/* =========================================================================
   Free Fall — shared rendering (canvas)
   This module only knows the state exposed by engine.js (level, player,
   objects, mode, now) and a <canvas id="game">. It's used as-is
   by the game (main.js) AND by the editor's test mode, to guarantee a
   rendu strictement identique aux deux endroits.
   ========================================================================= */

const canvas = document.getElementById("game");
const ctx2d = canvas.getContext("2d");

/* Fade transition to/from black — used by the game to soften death and
   level changes. Neutral by default (alpha always 0, no effect) until
   fadeTransition() is called; the editor (which shares this file for its
   test mode) doesn't use it. */
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

/* Uniform red brick: used for ALL platforms (safe and
   trapped) so that no visual cue gives away a trap before it
   triggers. The pattern is computed from absolute coordinates,
   so bricks naturally align between adjacent objects. */
/* Game grid size (20px), used to align block tiling on the
   same units as the editor. */
const GRID_SIZE = 20;

/* Mario block tiling (block.png, 16x16 native) scaled to the
   game's grid: as many tiles as needed to cover the area,
   aligned on multiples of GRID_SIZE from the world origin
   (not the object's corner) so adjacent objects not aligned on
   the grid still connect visually. While the image isn't
   loaded yet, falls back to the old vector pattern (no white flash). */
/* Piranha plant: one image per grid unit of width (20px, like
   the blocks), all animated AT THE SAME TIME via a shared clock
   (no per-object phase) — changes frame every second. Anchored at
   the bottom (they "grow" from the object's ground, like the spikes
   before them). Vector fallback (triangles) while the image hasn't loaded. */
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

/* Button (bump.png, 3 frames): sinks progressively according to o.pressPhase
   (0=released, 1=fully pressed, updated in engine.js). Each
   frame is drawn at its NATURAL height (scaled to the
   object's width, not stretched) and anchored at the BOTTOM — it's
   precisely this height decreasing from one frame to the next that gives
   the impression of the button sinking, rather than a simple stretch. Falls back to
   the old rendering (stone + pip) if the image hasn't finished loading. */
function drawButtonSprite(o){
  const phase = o.pressPhase || 0;
  const frames = BUMP_SPRITES;
  const img = phase < 0.34 ? frames[0] : (phase < 0.67 ? frames[1] : frames[2]);
  if(!img || !img.complete || !img.naturalWidth){
    drawStoneBrick(o.x,o.y,o.w,o.h);
    const cx = o.x+o.w/2, cy = o.y+o.h/2;
    const r = Math.min(o.w,o.h) * 0.22;
    ctx2d.fillStyle = phase>0.5 ? "#4f8f6a" : "#8a6a3a";
    ctx2d.beginPath(); ctx2d.arc(cx,cy,r,0,Math.PI*2); ctx2d.fill();
    ctx2d.strokeStyle = "rgba(30,20,10,.35)"; ctx2d.lineWidth = 1.5; ctx2d.stroke();
    return;
  }
  ctx2d.imageSmoothingEnabled = false;
  const scale = o.w / img.naturalWidth;
  const dw = o.w, dh = img.naturalHeight*scale;
  ctx2d.drawImage(img, o.x, o.y+o.h-dh, dw, dh);
}

/* Visual offset (the player's feet "sink" with the button they're
   pressing) — purely cosmetic, never affects real
   collision. */
function playerButtonSinkOffset(){
  let maxPhase = 0;
  for(const o of objects){
    if(o.kind==="button" && o.pressPhase>maxPhase && overlap(player,o)) maxPhase = o.pressPhase;
  }
  return maxPhase*8;
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

/* Door: a rounded frame + an inner panel + a bar + a
   handle, rather than a plain blue rectangle. Used both for the
   exit and for a "door"-kind object (decoy door, etc.). */
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
      drawButtonSprite(o);
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

/* Player character: a stick figure (round head, torso, arms, legs)
   that animates while walking and takes a different pose in the air — same
   as the editor's test mode. (walkPhase lives in engine.js, updated
   every frame with the player's speed.) */
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
/* Player death explosion: small square blocks flying off in
   every direction and falling with their own gravity (purely
   visual, independent of currentGravity). The player's sprite stops
   being drawn once the explosion triggers — the particles
   replace their presence on screen. */
let particles = [];
function spawnDeathExplosion(x,y){
  particles = [];
  const colors = ["#e0455c","#8a5a2a","#f0a868","#fff3c4"];
  for(let i=0;i<14;i++){
    const angle = Math.random()*Math.PI*2;
    const speed = 90 + Math.random()*170;
    particles.push({
      x, y,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed - 120,
      size: 3 + Math.random()*4,
      color: colors[Math.floor(Math.random()*colors.length)],
      life: 1,
    });
  }
}
function updateParticles(dt){
  if(!particles.length) return;
  for(const p of particles){
    p.vy += 1300*dt;
    p.x += p.vx*dt; p.y += p.vy*dt;
    p.life -= dt*0.55;
  }
  particles = particles.filter(p => p.life>0 && p.y<H+60);
}
function drawParticles(){
  for(const p of particles){
    ctx2d.save();
    ctx2d.globalAlpha = Math.max(0, Math.min(1,p.life));
    ctx2d.fillStyle = p.color;
    ctx2d.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
    ctx2d.restore();
  }
}

function drawPlayer(){
  if(mode==="dead") return; // the sprite gives way to the explosion
  /* Mario sprite if the image is loaded, otherwise falls back to the
     stick-figure silhouette (no broken/white flash while loading). */
  const facingRight = player.facing >= 0;
  const sinkY = playerButtonSinkOffset();
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
    ctx2d.translate(player.x+player.w/2, player.y+player.h/2+sinkY);
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
  ctx2d.translate(player.x+player.w/2, player.y+player.h/2+sinkY);
  /* Inverted gravity flips the character around the CENTER of its
     box (not its feet): its feet, drawn at the bottom in the
     unflipped frame, therefore end up at the top — stuck to the "ceiling". */
  if(currentGravity<0) ctx2d.scale(1,-1);
  ctx2d.drawImage(img, -dw/2, player.h/2-dh, dw, dh);
  ctx2d.restore();
}

/* Only shows the playable area (between the boundary walls): everything
   else (the walls themselves, and beyond) stays black — as if the
   boundaries were the very frame of the screen. If the level has no
   boundary walls, falls back to the full 800x450 world. */
/* Sky + clouds: fixed background color (sky.png), and 2-3 clouds (among 3
   sizes) placed randomly on each level, drifting slowly and
   ALL in the same direction (chosen once per level) — not each on its
   own. They loop from one edge of the screen to the other. */
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
const CLOUD_SPEED = 6; // px/s — very slow, uniform for all clouds
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
  /* No boundary wall at the bottom (by design: falling into the void is
     how you die, so nothing solid is ever placed there) — the bottom
     black bar is therefore purely a display crop. It reuses the top
     wall's thickness to stay visually consistent with the other three
     sides, whatever thickness the level chose (the floor continues
     behind it, just like the walls already do). */
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
  drawParticles();
  ctx2d.restore();
  drawFadeOverlay();
}

/* Generic, shared game loop. `loopRunning` lets the editor
   stop it cleanly when leaving test mode (the game itself never stops
   it). */
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
  updateParticles(dt);
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
