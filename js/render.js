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

function drawObject(o){
  if(o.visible === false) return;
  const shakeOff = (o.state === "shaking") ? Math.sin(now*0.06)*2 : 0;
  ctx2d.save();
  ctx2d.translate(shakeOff,0);
  switch(o.kind){
    case "static":
      drawBrick(o.x,o.y,o.w,o.h);
      break;
    case "falling":
      drawBrick(o.x,o.y,o.w,o.h);
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
        ctx2d.fillStyle = "#e0455c";
        for(let i=0;i<3;i++){
          const sx = o.x + i*(o.w/3);
          ctx2d.beginPath();
          ctx2d.moveTo(sx, o.y+o.h);
          ctx2d.lineTo(sx+o.w/6, o.y);
          ctx2d.lineTo(sx+o.w/3, o.y+o.h);
          ctx2d.closePath(); ctx2d.fill();
        }
      }
      break;
    case "door":
      ctx2d.fillStyle = "#3d5af1";
      drawRounded(o.x,o.y,o.w,o.h,8); ctx2d.fill();
      ctx2d.strokeStyle="#2a3fc0"; ctx2d.lineWidth=2; ctx2d.stroke();
      ctx2d.fillStyle="#eef0ff"; ctx2d.beginPath(); ctx2d.arc(o.x+o.w-9,o.y+o.h/2,3,0,7); ctx2d.fill();
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
      drawStoneBrick(o.x,o.y,o.w,o.h);
      break;
    case "blocker":
      drawBrick(o.x,o.y,o.w,o.h);
      ctx2d.strokeStyle = "rgba(224,69,92,.55)"; ctx2d.lineWidth = 2;
      ctx2d.strokeRect(o.x+1,o.y+1,o.w-2,o.h-2);
      break;
  }
  ctx2d.restore();
}

function drawExit(){
  const e = level.exit;
  ctx2d.fillStyle = mode==="won" ? "#2fb380" : "#59c98f";
  drawRounded(e.x,e.y,e.w,e.h,8); ctx2d.fill();
  ctx2d.fillStyle="#eafff3"; ctx2d.font="18px sans-serif"; ctx2d.textAlign="center";
  ctx2d.fillText("🚪", e.x+e.w/2, e.y+e.h/2+7);
}

function drawPlayer(){
  ctx2d.save();
  ctx2d.translate(player.x+player.w/2, player.y+player.h/2);
  ctx2d.scale(player.facing,1);
  ctx2d.fillStyle = mode==="dead" ? "#b8bccb" : "#3d5af1";
  drawRoundedCentered(player.w, player.h, 8);
  ctx2d.fillStyle = "#fff";
  ctx2d.beginPath(); ctx2d.arc(4,-6,2.4,0,7); ctx2d.fill();
  ctx2d.restore();
}

function render(){
  ctx2d.clearRect(0,0,W,H);
  const grad = ctx2d.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,"#eef1fb"); grad.addColorStop(1,"#e2e6f6");
  ctx2d.fillStyle = grad; ctx2d.fillRect(0,0,W,H);
  drawExit();
  for(const o of objects) drawObject(o);
  drawPlayer();
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
