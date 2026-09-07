"use strict";
/* =========================================================================
   Chute Libre — moteur
   Interprète les données de niveau (js/levels.js) : physique de plateforme,
   déclencheurs génériques (trigger), actions (action) et chaînes causales
   (cascade "then"). Un niveau est reconstruit par clone JSON à chaque
   tentative : le comportement d'un piège découvert est donc toujours
   identique (déterminisme).
   ========================================================================= */

let level = null;
let player = null;
let objects = [];
let objectsById = {};
let timers = [];
let now = 0;
let mode = "playing"; // playing | dead | won
let lastCause = null;

const input = { left:false, right:false, jumpQueued:false };

function scheduleTimer(ms, fn){ timers.push({ fireAt: now + ms, fn }); }
function processTimers(){
  if(!timers.length) return;
  const due = timers.filter(t => t.fireAt <= now);
  if(!due.length) return;
  timers = timers.filter(t => t.fireAt > now);
  for(const t of due) t.fn();
}

function applyActionStart(obj, action){
  switch(action.type){
    case "FALL":
      obj.state = "shaking";
      obj.fallSpeed = action.fallSpeed || 260;
      scheduleTimer(action.shakeMs || 300, () => startFalling(obj));
      break;
    case "DISAPPEAR":
      obj.visible = false; obj.solid = false; obj.hazard = false;
      fireCascade(obj);
      break;
    case "REVEAL":
      /* Rend l'objet visible et restaure sa solidité d'origine — sans
         jamais forcer "hazard" à true : le danger dépend uniquement de ce
         qui est coché dans "Dangereux au contact" pour CET objet. Un pic
         caché est configuré hazard=true dès le départ (mais reste inoffensif
         tant qu'il est invisible, la vérification de dégât exige les deux) ;
         un mur normal reste hazard=false et redevient donc un mur normal. */
      scheduleTimer(action.delay || 0, () => {
        const src = objectsById[obj.id];
        obj.visible = true;
        obj.solid = src ? !!src.solid : obj.solid;
        obj.state = "revealed";
        fireCascade(obj);
      });
      break;
    case "OPEN":
      obj.solid = false; obj.visible = false;
      fireCascade(obj);
      break;
    case "ACTIVATE":
      obj.state = "activated";
      fireCascade(obj);
      break;
    case "APPEAR_TEMP":
      /* surgit instantanément (aucun délai avant de bloquer), puis se
         rétracte après action.ms — un piège qui n'existe pas tant qu'on
         ne l'a pas provoqué, et disparaît une fois "utilisé". */
      obj.visible = true; obj.solid = true;
      scheduleTimer(action.ms || 500, () => { obj.visible = false; obj.solid = false; });
      fireCascade(obj);
      break;
    case "DISABLE":
      /* neutralise silencieusement l'objet cible : il reste "triggered"
         pour toujours (donc son propre trigger ne se déclenchera plus),
         mais sans jamais exécuter son action ni sa cascade. */
      return;
    case "MOVE":
      /* translation à vitesse maximale donnée, avec accélération optionnelle
         (0/omise = vitesse atteinte instantanément), pendant action.duration
         ms (omise = indéfiniment). Porte le joueur s'il se tient dessus. */
      obj.state = "moving";
      {
        const speed = action.speed != null ? action.speed : 100;
        const dir = action.direction || "right";
        obj.moveTargetVx = dir === "left" ? -speed : dir === "right" ? speed : 0;
        obj.moveTargetVy = dir === "up" ? -speed : dir === "down" ? speed : 0;
        obj.moveAccel = action.acceleration || 0;
        if(!obj.moveAccel){ obj.moveVx = obj.moveTargetVx; obj.moveVy = obj.moveTargetVy; }
        else { obj.moveVx = obj.moveVx || 0; obj.moveVy = obj.moveVy || 0; }
      }
      if(action.duration){
        scheduleTimer(action.duration, () => { obj.state = "idle"; obj.moveVx = 0; obj.moveVy = 0; });
      }
      fireCascade(obj);
      break;
    case "ROTATE":
      /* rotation visuelle continue (l'hitbox reste axée sur les axes ;
         la rotation est un effet cosmétique, pas une vraie boîte pivotée).
         action.duration omis = tourne indéfiniment. */
      obj.state = "rotating";
      obj.angle = obj.angle || 0;
      obj.rotateSpeed = (action.direction === "ccw" ? -1 : 1) * (action.speed != null ? action.speed : 90);
      if(action.duration){
        scheduleTimer(action.duration, () => { obj.state = "idle"; obj.rotateSpeed = 0; });
      }
      fireCascade(obj);
      break;
    default:
      fireCascade(obj);
  }
}
function startFalling(obj){
  obj.state = "falling"; obj.solid = false; obj.vy = 0;
  fireCascade(obj);
}
function fireCascade(obj){
  /* Chaque lien de cascade s'applique indépendamment, même si la cible a
     déjà reçu une action d'un autre lien (ex : un premier lien qui la fait
     apparaître, un second qui la fait bouger). `triggered` sert seulement à
     empêcher le déclencheur PROPRE de la cible de se redéclencher tout
     seul — il ne doit jamais empêcher une cascade explicite de s'appliquer. */
  const def = objectsById[obj.id];
  if(!def || !def.trap || !def.trap.then) return;
  for(const link of def.trap.then){
    scheduleTimer(link.delay || 0, () => {
      const target = objects.find(o => o.id === link.target);
      if(target){
        target.triggered = true;
        applyActionStart(target, link.action);
      }
    });
  }
}
function checkTrigger(obj){
  const def = objectsById[obj.id];
  const t = def.trap && def.trap.trigger;
  if(!t) return false;
  switch(t.type){
    case "ON_LAND": return player.justLandedOn === obj.id;
    case "ON_ENTER": {
      if(!overlap(player, obj)) return false;
      if(!t.fromSide) return true;
      if(player.prevBox && overlap(player.prevBox, obj)) return false; // déjà dedans, pas une "entrée"
      const sides = player.prevBox ? enteredFromSides(player.prevBox, player, obj) : [];
      return sides.includes(t.fromSide);
    }
    case "ON_TIMER": return now >= (t.delay || 0);
    case "ON_ATTEMPT": return (progress[level.id].attempts) >= (t.count || 1);
    case "ON_JUMP": return player.justJumped && overlap(player, obj);
    default: return false;
  }
}

/* Boîte de collision effective d'un objet : pour un objet qui tourne, on
   utilise le rectangle aligné sur les axes qui englobe exactement sa forme
   pivotée (il grandit/rétrécit avec l'angle). Approximation simple (pas une
   vraie collision de rectangle orienté), mais cohérente avec le rendu :
   le joueur peut monter sur une plateforme en rotation. */
function effectiveBox(o){
  if(o.angle){
    const rad = o.angle * Math.PI/180;
    const hw = o.w/2, hh = o.h/2;
    const bhw = Math.abs(hw*Math.cos(rad)) + Math.abs(hh*Math.sin(rad));
    const bhh = Math.abs(hw*Math.sin(rad)) + Math.abs(hh*Math.cos(rad));
    const cx = o.x+hw, cy = o.y+hh;
    return { x:cx-bhw, y:cy-bhh, w:bhw*2, h:bhh*2 };
  }
  return o;
}

function buildLevel(lv){
  level = lv;
  objects = clone(lv.objects).map(o => Object.assign({ visible:true, hazard:!!o.hazard, triggered:false, state:"idle" }, o));
  objectsById = {};
  for(const o of lv.objects) objectsById[o.id] = o;
  player = {
    x: lv.playerStart.x, y: lv.playerStart.y, w:26, h:38,
    vx:0, vy:0, grounded:false, groundedOn:null, prevGroundedOn:null, justLandedOn:null,
    justJumped:false, lastBump:null, lastGroundY:null, prevBox:null, facing:1,
  };
  timers = []; now = 0; mode = "playing"; lastCause = null;
  onLevelBuilt();
}

/* Résolution de collision combinée (une seule passe par image). Une
   résolution en deux passes séparées (X puis Y) casse la vitesse
   horizontale dès que le joueur reste imbriqué verticalement dans un
   objet d'une image sur l'autre (typiquement juste après avoir cogné un
   plafond) : la passe X suivante le traite alors à tort comme un mur
   latéral et annule sa vitesse. Ici, on ne résout que l'axe réellement
   concerné : arrivée par le haut / par le bas d'abord (cas fréquents,
   sol et plafond), sinon la pénétration la plus faible (mur). */
function resolveCollisions(dt){
  const prevBottom = player.y + player.h;
  const prevTop = player.y;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.grounded = false; player.groundedOn = null;

  for(const o of objects){
    /* Un objet invisible ne bloque pas physiquement par défaut (sinon un
       piège qu'on a réussi à éviter continuerait à gêner le joueur) — sauf
       si "Bloquant même invisible" est explicitement coché. */
    if(!o.solid) continue;
    if(o.visible===false && !o.solidWhenHidden) continue;
    const box = effectiveBox(o);
    if(!overlap(player,box)) continue;

    if(player.vy >= 0 && prevBottom <= box.y + 2){
      player.y = box.y - player.h; player.vy = 0;
      player.grounded = true; player.groundedOn = o.id; player.lastGroundY = box.y;
      continue;
    }
    if(player.vy < 0 && prevTop >= box.y + box.h - 2){
      player.y = box.y + box.h; player.vy = 0;
      player.lastBump = { id:o.id, t: now };
      continue;
    }

    const overlapX = Math.min(player.x+player.w, box.x+box.w) - Math.max(player.x, box.x);
    const overlapY = Math.min(player.y+player.h, box.y+box.h) - Math.max(player.y, box.y);
    if(overlapX < overlapY){
      /* Aide au pas : mesurée par rapport à la position AVANT le déplacement
         de cette image (pas après) — à haute vitesse de chute, quelques px
         de marge peuvent être franchis en une seule image, et la mesure
         "après" manquerait presque toujours la fenêtre de rattrapage.
         ... mais seulement pour grimper sur une plateforme nettement plus
         HAUTE que celle qu'on vient de quitter. Si la cible est à la même
         hauteur (ou plus basse), pas de rattrapage — sinon ça bouche aussi
         les petits trous qu'on traverse simplement en marchant. */
      const shortfall = prevBottom - box.y;
      const targetIsRaised = player.lastGroundY == null || box.y < player.lastGroundY - 2;
      if(targetIsRaised && shortfall > 0 && shortfall <= STEP_UP && player.vy >= 0){
        player.y = box.y - player.h; player.vy = 0;
        player.grounded = true; player.groundedOn = o.id; player.lastGroundY = box.y;
      } else {
        if(player.x < box.x) player.x -= overlapX; else player.x += overlapX;
        player.vx = 0;
      }
    } else {
      if(player.y < box.y){
        player.y -= overlapY; player.vy = 0; player.grounded = true; player.groundedOn = o.id; player.lastGroundY = box.y;
      } else {
        player.y += overlapY; player.vy = 0;
        player.lastBump = { id:o.id, t: now };
      }
    }
  }

  if(player.x < 0) player.x = 0;
  if(player.x + player.w > W) player.x = W - player.w;
}

function update(dt){
  now += dt * 1000;
  processTimers();
  player.prevBox = { x:player.x, y:player.y, w:player.w, h:player.h };

  /* Objets animés (avant la résolution des collisions, pour que le joueur
     se tienne sur la position à jour d'une plateforme mobile ce tour-ci). */
  for(const o of objects){
    o._lastDX = 0; o._lastDY = 0;
    if(o.state === "falling"){
      o.y += o.fallSpeed * dt;
      if(o.y > H + 100){ o.visible = false; o.dead = true; }
    } else if(o.state === "moving"){
      if(o.moveAccel){
        const maxStep = o.moveAccel * dt;
        o.moveVx = approach(o.moveVx||0, o.moveTargetVx||0, maxStep);
        o.moveVy = approach(o.moveVy||0, o.moveTargetVy||0, maxStep);
      }
      const dx = (o.moveVx||0) * dt, dy = (o.moveVy||0) * dt;
      o.x += dx; o.y += dy; o._lastDX = dx; o._lastDY = dy;
    } else if(o.state === "rotating"){
      o.angle = (o.angle||0) + (o.rotateSpeed||0) * dt;
    }
  }

  player.vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  player.vx *= MOVE_SPEED;
  if(player.vx > 0) player.facing = 1; else if(player.vx < 0) player.facing = -1;

  player.justJumped = false;
  if(input.jumpQueued && player.grounded){
    player.vy = JUMP_VELOCITY; player.grounded = false; player.groundedOn = null;
    player.justJumped = true;
  }
  input.jumpQueued = false;

  /* Sous-pas physiques : à 240px/s et 60 img/s, une image déplace le joueur
     de 4px, et son corps fait 26px de large — l'écart réel à traverser sans
     aucun contact (largeur du trou moins largeur du joueur) est souvent
     plus petit qu'un seul pas, donc franchi d'un coup avant que la gravité
     n'ait eu le temps de s'accumuler. Recalculer la gravité et la collision
     plusieurs fois par image donne une chute d'apparence continue et
     détecte correctement les petits trous. */
  const SUBSTEPS = 4;
  const subDt = dt / SUBSTEPS;
  for(let s = 0; s < SUBSTEPS; s++){
    player.vy += GRAVITY * subDt;
    if(player.vy > MAX_FALL) player.vy = MAX_FALL;
    resolveCollisions(subDt);
  }

  /* Portage : si le joueur est posé sur une plateforme en mouvement, il se
     déplace avec elle. */
  if(player.grounded && player.groundedOn){
    const platform = objects.find(o => o.id === player.groundedOn);
    if(platform && (platform._lastDX || platform._lastDY)){
      player.x += platform._lastDX; player.y += platform._lastDY;
    }
  }

  player.justLandedOn = (player.grounded && player.groundedOn !== player.prevGroundedOn) ? player.groundedOn : null;
  player.prevGroundedOn = player.grounded ? player.groundedOn : null;

  for(const o of objects){
    if(o.triggered) continue;
    if(checkTrigger(o)){
      o.triggered = true;
      applyActionStart(o, objectsById[o.id].trap.action);
    }
  }

  if(overlap(player, level.exit)){ onWin(); return; }
  if(player.y > H + 60){ onDeath(null); return; }
  for(const o of objects){
    if(o.hazard && o.visible !== false && overlap(player,o)){ onDeath(o); return; }
  }
}

function onDeath(obj){
  mode = "dead";
  const p = progress[level.id];
  p.attempts++;
  let cause = obj;
  if(!cause && player.lastBump && (now - player.lastBump.t) < 1500){
    cause = objectsById[player.lastBump.id];
  }
  if(cause){
    if(p.discovered.indexOf(cause.id) === -1) p.discovered.push(cause.id);
    lastCause = cause.description || "Un piège t'a eu.";
  } else {
    lastCause = "Tu es tombé dans le vide.";
  }
  saveProgress();
  onGameOver("dead");
}
function onWin(){
  mode = "won";
  const p = progress[level.id];
  p.completed = true;
  saveProgress();
  onGameOver("won");
}

/* Hooks implémentés dans main.js (UI/rendu) */
function onLevelBuilt(){}
function onGameOver(_result){}
