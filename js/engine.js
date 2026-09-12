"use strict";
/* =========================================================================
   Chute Libre — moteur
   Interprets level data (js/levels.js): platform physics,
   generic triggers, actions, and causal chains
   (cascade "then"). A level is rebuilt via a JSON clone on every
   attempt: a discovered trap's behavior is therefore always
   identical (determinism).
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
      /* Makes the object visible and restores its original solidity —
         never forcing "hazard" to true: the danger only depends on
         whatever is checked in "Dangerous on contact" for THIS object. A
         hidden spike is configured hazard=true from the start (but stays
         harmless while invisible, since the damage check requires both);
         a normal wall stays hazard=false and simply goes back to being one. */
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
      /* Appears instantly (no delay before blocking), then retracts
         after action.ms — a trap that doesn't exist until you trigger
         it, and disappears once "used". */
      obj.visible = true; obj.solid = true;
      scheduleTimer(action.ms || 500, () => { obj.visible = false; obj.solid = false; });
      fireCascade(obj);
      break;
    case "DISABLE":
      /* neutralise silencieusement l'objet cible : il reste "triggered"
         for good (so its own trigger will never fire again), but
         without ever running its action or cascade. */
      return;
    case "MOVE":
      /* Each MOVE only drives the axis matching its direction
         (left/right => X, up/down => Y), without touching the other axis —
         two MOVEs on different axes add up into a diagonal instead of
         cancelling out. A second MOVE on the SAME axis cleanly replaces
         cleanly replaces the first (expected behavior). */
      {
        obj.moveTarget = null; // MOVE_TO and MOVE cut each other off
        const speed = action.speed != null ? action.speed : 100;
        const dir = action.direction || "right";
        const axis = (dir === "left" || dir === "right") ? "x" : "y";
        const target = axis === "x" ? (dir === "left" ? -speed : speed) : (dir === "up" ? -speed : speed);
        const accel = action.acceleration || 0;
        const prevV = axis === "x" ? (obj.moveX ? obj.moveX.v : 0) : (obj.moveY ? obj.moveY.v : 0);
        const mover = { target, accel, v: accel ? prevV : target };
        if(axis === "x") obj.moveX = mover; else obj.moveY = mover;
        obj.state = "moving";
        if(action.duration){
          scheduleTimer(action.duration, () => {
            if(axis === "x") obj.moveX = null; else obj.moveY = null;
            if(!obj.moveX && !obj.moveY) obj.state = "idle";
          });
        }
      }
      fireCascade(obj);
      break;
    case "MOVE_TO":
      /* Moves the object directly to a given (x,y) position, at a given
         speed (with optional acceleration) — the duration is derived
         automatically from the distance to travel, instead of having to
         calculate it by hand. Takes full control of the object's
         movement (cancels MOVE if it was active on this object). */
      obj.moveX = null; obj.moveY = null;
      obj.moveTarget = {
        tx: action.x != null ? action.x : obj.x,
        ty: action.y != null ? action.y : obj.y,
        speed: action.speed != null ? action.speed : 100,
        accel: action.acceleration || 0,
        speedCur: action.acceleration ? 0 : (action.speed != null ? action.speed : 100),
      };
      obj.state = "moving";
      fireCascade(obj);
      break;
    case "ROTATE":
      /* continuous visual rotation (the hitbox stays axis-aligned;
         the rotation is a cosmetic effect, not a real rotated box).
         action.duration omitted = spins indefinitely. */
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
/* Actions on the special SCENE and PLAYER targets (in addition to level
   objects). Neither the scene nor the player are objects, so kept separate from
   applyActionStart. */
function applySceneAction(action){
  if(action.type === "SET_GRAVITY"){
    currentGravity = action.value != null ? action.value : DEFAULT_GRAVITY;
  } else if(action.type === "SET_SPEED"){
    currentMoveSpeed = action.value != null ? action.value : DEFAULT_MOVE_SPEED;
  } else if(action.type === "SET_CONTROLS"){
    controlsInverted = (action.value === "inverted");
  }
}
/* Largeur/hauteur "de base" du joueur — sert de ratio fixe pour que
   CHANGE_WIDTH et CHANGE_HEIGHT gardent toujours la boîte de collision
   cohérente avec ce que montre le sprite (dont l'échelle de rendu suit
   uniquement player.h) : changer l'une des deux dimensions fait suivre
   l'autre dans les mêmes proportions, au lieu de les désynchroniser. */
const PLAYER_BASE_W = 26, PLAYER_BASE_H = 38;
function applyPlayerAction(action){
  if(action.type === "CHANGE_WIDTH"){
    const newW = action.value != null ? action.value : PLAYER_BASE_W;
    const newH = newW * (PLAYER_BASE_H / PLAYER_BASE_W);
    player.x += (player.w - newW) / 2; // recenters horizontally
    player.y += (player.h - newH); // keeps the feet in the same place
    player.w = newW; player.h = newH;
  } else if(action.type === "CHANGE_HEIGHT"){
    const newH = action.value != null ? action.value : PLAYER_BASE_H;
    const newW = newH * (PLAYER_BASE_W / PLAYER_BASE_H);
    player.y += (player.h - newH); // keeps the feet in the same place
    player.x += (player.w - newW) / 2; // recenters horizontally
    player.w = newW; player.h = newH;
  } else if(action.type === "MOVE"){
    const speed = action.speed != null ? action.speed : 100;
    const dir = action.direction || "right";
    const axis = (dir === "left" || dir === "right") ? "x" : "y";
    const target = axis === "x" ? (dir === "left" ? -speed : speed) : (dir === "up" ? -speed : speed);
    const accel = action.acceleration || 0;
    const prevV = axis === "x" ? (player.moveX ? player.moveX.v : 0) : (player.moveY ? player.moveY.v : 0);
    const mover = { target, accel, v: accel ? prevV : target };
    if(axis === "x") player.moveX = mover; else player.moveY = mover;
    if(action.duration){
      scheduleTimer(action.duration, () => { if(axis === "x") player.moveX = null; else player.moveY = null; });
    }
  }
}
function fireCascade(obj){
  /* Each cascade link applies independently, even if the target has
     already received an action from another link (e.g. a first link that
     makes it appear, a second that makes it move). `triggered` only
     prevents the target's OWN trigger from firing again on its own — it
     must never block an explicit cascade from being applied. */
  const def = objectsById[obj.id];
  if(!def || !def.trap || !def.trap.then) return;
  for(const link of def.trap.then){
    scheduleTimer(link.delay || 0, () => {
      if(link.target === "SCENE"){ applySceneAction(link.action); return; }
      if(link.target === "PLAYER"){ applyPlayerAction(link.action); return; }
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
      const box = effectiveBox(obj);
      if(!overlap(player, box)) return false;
      if(!t.fromSide) return true;
      if(player.prevBox && overlap(player.prevBox, box)) return false; // already inside, not an "entry"
      const sides = player.prevBox ? enteredFromSides(player.prevBox, player, box) : [];
      return sides.includes(t.fromSide);
    }
    case "ON_TIMER": return now >= (t.delay || 0);
    case "ON_ATTEMPT": return (progress[level.id].attempts) >= (t.count || 1);
    case "ON_JUMP": return player.justJumped && overlap(player, effectiveBox(obj));
    default: return false;
  }
}

/* An object's effective collision box: for a rotating object, we use the
   axis-aligned rectangle that exactly bounds its rotated shape (it grows/
   shrinks with the angle). A simple approximation (not real oriented-
   rectangle collision), but consistent with the rendering:
   the player can climb onto a rotating platform. */
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
  objects = clone(lv.objects).map(o => Object.assign({ visible:true, hazard:!!o.hazard, triggered:false, state:"idle", pressPhase:0 }, o));
  objectsById = {};
  for(const o of lv.objects) objectsById[o.id] = o;
  player = {
    x: lv.playerStart.x, y: lv.playerStart.y, w:26, h:38,
    vx:0, vy:0, grounded:false, groundedOn:null, prevGroundedOn:null, justLandedOn:null,
    justJumped:false, lastBump:null, lastGroundY:null, prevBox:null, moveX:null, moveY:null, facing:1,
  };
  timers = []; now = 0; mode = "playing"; lastCause = null;
  currentGravity = lv.gravity != null ? lv.gravity : DEFAULT_GRAVITY;
  currentMoveSpeed = DEFAULT_MOVE_SPEED;
  controlsInverted = false;
  walkPhase = 0;
  initClouds();
  onLevelBuilt();
}

/* Combined collision resolution (a single pass per frame). Resolving in
   two separate passes (X then Y) breaks horizontal speed as soon as the
   player stays vertically nested inside an object from one frame to the
   next (typically right after hitting a ceiling): the following X pass
   then wrongly treats it as a side wall and cancels its speed. Here, only
   the axis actually involved is resolved: arrival from above/below first
   (common cases, floor and ceiling), otherwise the smallest penetration
   (wall). */
function resolveCollisions(dt){
  /* fallSign = direction of current gravity (1 = normal, -1 = inverted).
     All the resolution below is symmetric with respect to this sign:
     with inverted gravity, "landing" means sticking to the UNDERSIDE
     from a platform (the ground is at the ceiling), and the jump catch-up
     applies toward a lower platform (in the direction opposite to
     gravity) rather than a higher one. */
  const fallSign = currentGravity >= 0 ? 1 : -1;
  const prevBottom = player.y + player.h;
  const prevTop = player.y;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.grounded = false; player.groundedOn = null;

  for(const o of objects){
    /* An invisible object doesn't block physically by default (otherwise
       a trap the player successfully avoided would keep getting in the
       way) — unless "Solid even hidden" is explicitly checked. */
    if(!o.solid) continue;
    if(o.visible===false && !o.solidWhenHidden) continue;
    const box = effectiveBox(o);
    if(!overlap(player,box)) continue;

    if(fallSign > 0){
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
    } else {
      if(player.vy <= 0 && prevTop >= box.y + box.h - 2){
        player.y = box.y + box.h; player.vy = 0;
        player.grounded = true; player.groundedOn = o.id; player.lastGroundY = box.y + box.h;
        continue;
      }
      if(player.vy > 0 && prevBottom <= box.y + 2){
        player.y = box.y - player.h; player.vy = 0;
        player.lastBump = { id:o.id, t: now };
        continue;
      }
    }

    const overlapX = Math.min(player.x+player.w, box.x+box.w) - Math.max(player.x, box.x);
    const overlapY = Math.min(player.y+player.h, box.y+box.h) - Math.max(player.y, box.y);
    if(overlapX < overlapY){
      /* Step-up assist: measured against the position BEFORE this frame's
         movement (not after) — at high speed, a few px of margin can be
         crossed in a single frame. Only for climbing
         toward a platform noticeably closer to the "effective ceiling"
         than the one just left — never to plug a small
         trou qu'on traverse simplement en marchant. */
      let shortfall, targetIsRaised, movingTowardSurface;
      if(fallSign > 0){
        shortfall = prevBottom - box.y;
        targetIsRaised = player.lastGroundY == null || box.y < player.lastGroundY - 2;
        movingTowardSurface = player.vy >= 0;
      } else {
        shortfall = (box.y + box.h) - prevTop;
        targetIsRaised = player.lastGroundY == null || (box.y + box.h) > player.lastGroundY + 2;
        movingTowardSurface = player.vy <= 0;
      }
      if(targetIsRaised && shortfall > 0 && shortfall <= STEP_UP && movingTowardSurface){
        if(fallSign > 0){ player.y = box.y - player.h; player.lastGroundY = box.y; }
        else { player.y = box.y + box.h; player.lastGroundY = box.y + box.h; }
        player.vy = 0; player.grounded = true; player.groundedOn = o.id;
      } else {
        if(player.x < box.x) player.x -= overlapX; else player.x += overlapX;
        player.vx = 0;
      }
    } else {
      if(fallSign > 0){
        if(player.y < box.y){
          player.y -= overlapY; player.vy = 0; player.grounded = true; player.groundedOn = o.id; player.lastGroundY = box.y;
        } else {
          player.y += overlapY; player.vy = 0;
          player.lastBump = { id:o.id, t: now };
        }
      } else {
        if(player.y + player.h > box.y + box.h){
          player.y += overlapY; player.vy = 0; player.grounded = true; player.groundedOn = o.id; player.lastGroundY = box.y + box.h;
        } else {
          player.y -= overlapY; player.vy = 0;
          player.lastBump = { id:o.id, t: now };
        }
      }
    }
  }

  if(player.x < 0) player.x = 0;
  if(player.x + player.w > W) player.x = W - player.w;

  /* Exit (pipe): solid on the sides — blocks like a wall — but its top
     (the opening, in the direction opposite to gravity) wins the level as
     soon as the player enters it by falling/jumping in. Same fallSign logic
     as the rest of the function, sharing prevBottom/prevTop. */
  resolveExit(fallSign, prevBottom, prevTop);
}
function resolveExit(fallSign, prevBottom, prevTop){
  const e = level.exit;
  if(!overlap(player, e)) return;

  if(fallSign > 0){
    if(player.vy >= 0 && prevBottom <= e.y + 10){ onWin(); return; }
  } else {
    if(player.vy <= 0 && prevTop >= e.y + e.h - 10){ onWin(); return; }
  }

  const overlapX = Math.min(player.x+player.w, e.x+e.w) - Math.max(player.x, e.x);
  const overlapY = Math.min(player.y+player.h, e.y+e.h) - Math.max(player.y, e.y);
  if(overlapX < overlapY){
    if(player.x < e.x) player.x -= overlapX; else player.x += overlapX;
    player.vx = 0;
  } else {
    /* A deep vertical overlap resolved here = the player is landing from
       the pipe's "opening" side (above in normal gravity, below if
       inverted): that wins the level too, not just resolves as standing
       on it — consistent with the shortcut above. */
    if(fallSign > 0){
      if(player.y < e.y){ onWin(); return; }
      else { player.y += overlapY; player.vy = 0; }
    } else {
      if(player.y + player.h > e.y + e.h){ onWin(); return; }
      else { player.y -= overlapY; player.vy = 0; }
    }
  }
}

function update(dt){
  now += dt * 1000;
  processTimers();
  player.prevBox = { x:player.x, y:player.y, w:player.w, h:player.h };

  /* Animated objects (before collision resolution, so the player stands
     on a moving platform's up-to-date position this frame). */
  for(const o of objects){
    o._lastDX = 0; o._lastDY = 0;
    if(o.state === "falling"){
      o.y += o.fallSpeed * dt;
      if(o.y > H + 100){ o.visible = false; o.dead = true; }
    }
    /* moveX and moveY are two independent "engines" (one per axis): a
       a horizontal move and a vertical move can run
       IN PARALLEL on the same object, instead of overwriting one another. */
    if(o.moveX || o.moveY){
      let dx = 0, dy = 0;
      if(o.moveX){
        o.moveX.v = o.moveX.accel ? approach(o.moveX.v, o.moveX.target, o.moveX.accel*dt) : o.moveX.target;
        dx = o.moveX.v * dt;
      }
      if(o.moveY){
        o.moveY.v = o.moveY.accel ? approach(o.moveY.v, o.moveY.target, o.moveY.accel*dt) : o.moveY.target;
        dy = o.moveY.v * dt;
      }
      o.x += dx; o.y += dy; o._lastDX += dx; o._lastDY += dy;
    }
    /* MOVE_TO: moves in a straight line toward a fixed position, at a given
       speed (with optional acceleration), and stops exactly on arrival
       (no overshoot possible even at high speed/low frame rate). */
    if(o.moveTarget){
      const mt = o.moveTarget;
      const ddx = mt.tx - o.x, ddy = mt.ty - o.y;
      const dist = Math.hypot(ddx, ddy);
      if(dist < 0.5){
        o.x = mt.tx; o.y = mt.ty; o.moveTarget = null;
        if(!o.moveX && !o.moveY) o.state = "idle";
      } else {
        mt.speedCur = mt.accel ? approach(mt.speedCur, mt.speed, mt.accel*dt) : mt.speed;
        const step = mt.speedCur * dt;
        let sx, sy;
        if(step >= dist){ o.x = mt.tx; o.y = mt.ty; o.moveTarget = null; if(!o.moveX && !o.moveY) o.state = "idle"; sx=ddx; sy=ddy; }
        else { const ux = ddx/dist, uy = ddy/dist; sx = ux*step; sy = uy*step; o.x += sx; o.y += sy; }
        o._lastDX += sx; o._lastDY += sy;
      }
    }
    if(o.state === "rotating"){
      o.angle = (o.angle||0) + (o.rotateSpeed||0) * dt;
    }
    if(o.kind === "button"){
      /* Purely visual tracking: sinks while the player covers it,
         rises back up otherwise — independent of the trigger system
         (which only fires once via "triggered"). */
      const pressed = overlap(player, o);
      o.pressPhase = approach(o.pressPhase || 0, pressed ? 1 : 0, dt / 0.12);
    }
  }

  player.vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if(controlsInverted) player.vx = -player.vx;
  player.vx *= currentMoveSpeed;
  if(player.vx > 0) player.facing = 1; else if(player.vx < 0) player.facing = -1;
  walkPhase += Math.abs(player.vx) * dt * 0.15;
  if(Math.abs(player.vx) < 1) walkPhase = 0;

  player.justJumped = false;
  if(input.jumpQueued && player.grounded){
    /* The jump always pushes OPPOSITE to the direction of current gravity:
       with inverted gravity (stuck to the ceiling), jumping pushes
       downward, not upward. */
    player.vy = currentGravity >= 0 ? JUMP_VELOCITY : -JUMP_VELOCITY;
    player.grounded = false; player.groundedOn = null;
    player.justJumped = true;
  }
  input.jumpQueued = false;

  /* Impulsion externe (action MOVE ciblant PLAYER, cf. applyPlayerAction) :
     adds to the movement driven by the keys, without ever overwriting it —
     same two-independent-axis logic as for objects. */
  if(player.moveX){
    player.moveX.v = player.moveX.accel ? approach(player.moveX.v, player.moveX.target, player.moveX.accel*dt) : player.moveX.target;
    player.vx += player.moveX.v;
  }
  if(player.moveY){
    player.moveY.v = player.moveY.accel ? approach(player.moveY.v, player.moveY.target, player.moveY.accel*dt) : player.moveY.target;
    player.vy += player.moveY.v;
  }

  /* Physics substeps: at 240px/s and 60 fps, one frame moves the player
     4px, and their body is 26px wide — the real gap to cross without
     no contact at all (gap width minus player width) is often
     smaller than a single step, so it's crossed in one go before gravity
     has had time to accumulate. Recomputing gravity and collision
     several times per frame gives a visually continuous fall and
     several times per frame gives a visually continuous fall and
     correctly detects small gaps. */
  const SUBSTEPS = 4;
  const subDt = dt / SUBSTEPS;
  for(let s = 0; s < SUBSTEPS; s++){
    player.vy += currentGravity * subDt;
    if(player.vy > MAX_FALL) player.vy = MAX_FALL;
    if(player.vy < -MAX_FALL) player.vy = -MAX_FALL;
    resolveCollisions(subDt);
  }

  /* Carrying: if the player is standing on a moving platform, they move
     along with it. */
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

  if(player.y > H + 60){ onDeath(null); return; }
  for(const o of objects){
    if(o.hazard && o.visible !== false && overlap(player, effectiveBox(o))){ onDeath(o); return; }
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
    lastCause = cause.description || "A trap got you.";
  } else {
    lastCause = "You fell into the void.";
  }
  saveProgress();
  spawnDeathExplosion(player.x+player.w/2, player.y+player.h/2);
  onGameOver("dead");
}
function onWin(){
  mode = "won";
  const p = progress[level.id];
  p.completed = true;
  saveProgress();
  onGameOver("won");
}

/* Hooks implemented in main.js (UI/rendering) */
function onLevelBuilt(){}
function onGameOver(_result){}
