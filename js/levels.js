"use strict";
/* =========================================================================
   Free Fall — level data (pure, serializable)
   A level contains ONLY data: geometry + trap definitions
   (trigger/action/cascade). The screen is fixed, the camera never moves.
   See js/engine.js for the generic interpretation of this data.

   KITS: each trap isn't hand-written level by level, but assembled by a
   parameterizable "kit" function (position, size, timing). A kit returns
   an array of objects ready to be concatenated into a level's `objects`
   list — it's the "reusable tile": the same Kits.jumpBlocker(...) function
   can be placed at any coordinate, in any level, with its own disarm
   button for each placement (prefixed identifiers so two placements of
   the same kit never collide). This is also the structure an LLM level
   generator would work with: pick a kit, give it coordinates.
   ========================================================================= */

const W = 800, H = 450;
const DEFAULT_GRAVITY = 2200;
const DEFAULT_MOVE_SPEED = 240;
const JUMP_VELOCITY = -620, MAX_FALL = 900;
let currentMoveSpeed = DEFAULT_MOVE_SPEED;
let controlsInverted = false;
let currentGravity = DEFAULT_GRAVITY;
let walkPhase = 0;
const STEP_UP = 14;

const DESC = {
  FALLING_GENERIC: "This platform collapses shortly after you walk on it.",
  FALLING_B: "B collapses shortly after landing, and its fall triggers A's.",
  FALLING_A: "A also collapses after landing — even faster if B has already fallen.",
  HIDDEN_SPIKE: "A hidden spike reveals itself the moment you set foot on this part of the floor.",
  FAKE_DOOR: "This door looked like the exit... but the floor gives way right underneath it.",
  BUTTON: "A button that opens a locked gate further along.",
  GATE: "A locked gate that blocks the way until the button is pressed.",
  JUMP_BLOCKER: "An invisible ceiling slams shut the instant you jump here, and drops you back into the void.",
  DISABLE_BUTTON: "A hidden button, off the obvious path, that disarms a trap further along.",
};

/* ---------------------------- Kit library ---------------------------- */
const Kits = {
  /** Fixed floor / platform, never trapped. */
  static(id, x, y, w, h = 40){
    return [{ id, kind:"static", x, y, w, h, solid:true }];
  },

  /** Purely decorative floating block (same brick as a trap, out of normal
      reach): breaks the "isolated block = trap" heuristic. */
  decoy(id, x, y, w, h = 18){
    return [{ id, kind:"static", x, y, w, h, solid:true }];
  },

  /** Platform that collapses `shakeMs` after landing. If `then` is
      provided ({target, delay, shakeMs}), its fall in turn triggers the
      fall of another platform in the level (causal chain). */
  fallingPlatform(id, x, y, w, { h = 22, shakeMs = 400, fallSpeed = 260, description = DESC.FALLING_GENERIC, then = null } = {}){
    const trap = { trigger:{type:"ON_LAND"}, action:{type:"FALL", shakeMs, fallSpeed} };
    if(then) trap.then = [{ target: then.target, delay: then.delay || 0,
      action:{ type:"FALL", shakeMs: then.shakeMs != null ? then.shakeMs : shakeMs, fallSpeed: then.fallSpeed || fallSpeed } }];
    return [{ id, kind:"falling", x, y, w, h, solid:true, description, trap }];
  },

  /** Invisible spike that reveals itself when the player steps into its zone. */
  hiddenSpike(id, x, y, w, { h = 22, revealDelay = 150 } = {}){
    return [{ id, kind:"hidden_spike", x, y, w, h, solid:false, hazard:true, visible:false,
      description: DESC.HIDDEN_SPIKE,
      trap:{ trigger:{type:"ON_ENTER"}, action:{type:"REVEAL", delay: revealDelay} } }];
  },

  /** Locked gate (wall) + button (on a small platform, alongside) that
      opens it. `prefix` avoids any identifier collision when placing
      several gates in the same level. */
  lockedGate(prefix, { gateX, gateY = 290, gateH = 120, padX, padY = 340, padW = 60, padH = 20 }){
    const gateId = prefix+"_gate", padId = prefix+"_pad", btnId = prefix+"_btn";
    return [
      { id: padId, kind:"static", x:padX, y:padY, w:padW, h:padH, solid:true },
      { id: btnId, kind:"button", x:padX, y:padY-18, w:padW, h:16, solid:false, description: DESC.BUTTON,
        trap:{ trigger:{type:"ON_ENTER"}, action:{type:"ACTIVATE"},
               then:[{ target:gateId, delay:0, action:{type:"OPEN"} }] } },
      { id: gateId, kind:"gate", x:gateX, y:gateY, w:16, h:gateH, solid:true, description: DESC.GATE, trap:{} },
    ];
  },

  /** Fake exit: a "safe" platform floating in a gap, topped with a door
      that looks like the exit. Touching the door (a deliberate move, never
      required to progress) makes the platform
      THEN the platform, `dropDelay` ms later. */
  fakeExit(prefix, { ledgeX, ledgeY, ledgeW, doorX, doorY, doorW, doorH, dropDelay = 150 }){
    const ledgeId = prefix+"_ledge", doorId = prefix+"_door";
    return [
      { id: ledgeId, kind:"falling", x:ledgeX, y:ledgeY, w:ledgeW, h:20, solid:true, description: DESC.FAKE_DOOR, trap:{} },
      { id: doorId, kind:"door", x:doorX, y:doorY, w:doorW, h:doorH, solid:false, description: DESC.FAKE_DOOR,
        trap:{ trigger:{type:"ON_ENTER"}, action:{type:"DISAPPEAR"},
               then:[{ target:ledgeId, delay:dropDelay, action:{type:"FALL", shakeMs:0, fallSpeed:320} }] } },
    ];
  },

  /** THE LYING CEILING — the "obvious jump at the edge of a gap" tile:
      jumping from the `sensor` zone (usually the last stretch of floor
      before the void) instantly makes a wall/ceiling slam shut above the
      trajectory; it retracts on its own after `appearMs`. A button placed
      OFF TO THE SIDE (never on the direct path, always reachable via a
      detour) silently disarms the trigger before you even jump — that's
      the solvability guarantee. Same kit, reusable at
      any position to place other "fake jumps" elsewhere. */
  jumpBlocker(prefix, {
    sensorX, sensorY = 372, sensorW = 50, sensorH = 38,
    blockerX, blockerY = 270, blockerW = 100, blockerH = 60, appearMs = 550,
    padX, padY = 350, padW = 70, padH = 20,
  }){
    const sensorId = prefix+"_sensor", blockerId = prefix+"_blocker";
    const padId = prefix+"_pad", btnId = prefix+"_btn";
    return [
      { id: padId, kind:"static", x:padX, y:padY, w:padW, h:padH, solid:true },
      { id: btnId, kind:"button", x:padX, y:padY-18, w:padW, h:16, solid:false, description: DESC.DISABLE_BUTTON,
        trap:{ trigger:{type:"ON_ENTER"}, action:{type:"ACTIVATE"},
               then:[{ target:sensorId, delay:0, action:{type:"DISABLE"} }] } },
      { id: sensorId, kind:"sensor", x:sensorX, y:sensorY, w:sensorW, h:sensorH, solid:false, visible:false,
        trap:{ trigger:{type:"ON_JUMP"}, action:{type:"NONE"},
               then:[{ target:blockerId, delay:0, action:{type:"APPEAR_TEMP", ms:appearMs} }] } },
      { id: blockerId, kind:"blocker", x:blockerX, y:blockerY, w:blockerW, h:blockerH, solid:false, visible:false,
        description: DESC.JUMP_BLOCKER, trap:{} },
    ];
  },
  /** Boundary walls: closes off the level at the top, left, and right, so
      the only way to "leave" is by falling (death) or reaching the exit —
      never by leaving the screen through an edge. Placed last in
      the list so it renders on top at the corners. */
  boundaryWalls(thickness = 14){
    return [
      { id:"_boundTop", kind:"gate", x:0, y:0, w:W, h:thickness, solid:true },
      { id:"_boundLeft", kind:"gate", x:0, y:0, w:thickness, h:H, solid:true },
      { id:"_boundRight", kind:"gate", x:W-thickness, y:0, w:thickness, h:H, solid:true },
    ];
  },
};

const LEVELS_SOURCE = [
  {
    id:"l1", name:"First Jump", difficulty:1, gravity:DEFAULT_GRAVITY,
    playerStart:{x:40,y:372},
    exit:{x:730,y:370,w:40,h:40},
    objects:[
      ...Kits.static("ground1", 0, 410, 260),
      ...Kits.fallingPlatform("B", 320, 410, 90, { shakeMs:450, fallSpeed:260, description:DESC.FALLING_GENERIC }),
      ...Kits.static("ground2", 470, 410, 330),
      ...Kits.decoy("decoy1", 380, 150, 70),
      ...Kits.boundaryWalls(),
    ],
  },
  {
    id:"l2", name:"Domino Effect", difficulty:3, gravity:DEFAULT_GRAVITY,
    playerStart:{x:40,y:372},
    exit:{x:730,y:370,w:40,h:40},
    objects:[
      ...Kits.static("ground1", 0, 410, 200),
      ...Kits.fallingPlatform("B", 260, 410, 80, { shakeMs:700, fallSpeed:300, description:DESC.FALLING_B,
        then:{ target:"A", delay:250, shakeMs:500 } }),
      ...Kits.fallingPlatform("A", 400, 410, 80, { shakeMs:700, fallSpeed:300, description:DESC.FALLING_A }),
      ...Kits.static("ground2", 560, 410, 240),
      ...Kits.hiddenSpike("spike1", 582, 388, 26),
      ...Kits.decoy("decoy2", 330, 150, 70),
      ...Kits.boundaryWalls(),
    ],
  },
  {
    id:"l3", name:"Fake Exit", difficulty:4, gravity:DEFAULT_GRAVITY,
    playerStart:{x:40,y:372},
    exit:{x:730,y:370,w:40,h:40},
    /* The real path crosses the gap (260->350) in a single direct jump.
       A "safe" platform floats in the gap to tempt a cautious player: if
       they also climb up to the door above (a deliberate move, not
       required to progress), the door and the platform disappear and
       falls into the void. The direct path itself never triggers the trap. */
    objects:[
      ...Kits.static("groundA", 0, 410, 260),
      ...Kits.fakeExit("fake1", { ledgeX:275, ledgeY:330, ledgeW:70, doorX:290, doorY:150, doorW:40, doorH:70 }),
      ...Kits.static("groundB", 350, 410, 450),
      ...Kits.lockedGate("lock1", { gateX:620, padX:460 }),
      ...Kits.decoy("decoy3", 550, 150, 70),
      ...Kits.boundaryWalls(),
    ],
  },
  {
    id:"l4", name:"The Lying Ceiling", difficulty:5, gravity:DEFAULT_GRAVITY,
    playerStart:{x:40,y:372},
    exit:{x:730,y:370,w:40,h:40},
    /* The "obvious" jump at the edge of groundA triggers a ceiling that
       slams shut the exact moment the player takes off, sending them back
       Nothing gives it away beforehand: it's invisible and non-solid until
       into the void. The only guaranteed way through is the kit's button
       — never on the direct path — which silently disarms the ceiling's
       trigger before you even jump. */
    objects:[
      ...Kits.static("groundA", 0, 410, 190),
      ...Kits.jumpBlocker("trap1", {
        padX:90, padY:350, padW:70,
        sensorX:140, sensorW:50,
        blockerX:180, blockerY:270, blockerW:100, blockerH:60, appearMs:550,
      }),
      ...Kits.static("groundB", 310, 410, 490),
      ...Kits.boundaryWalls(),
    ],
  },
];

function clone(o){ return JSON.parse(JSON.stringify(o)); }
function overlap(a,b){ return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
function approach(cur, target, maxDelta){
  if(cur < target) return Math.min(cur+maxDelta, target);
  if(cur > target) return Math.max(cur-maxDelta, target);
  return cur;
}
/* Determines from which side(s) a box (prevBox) that wasn't overlapping
   `obj` entered into overlap with `obj`. Used by the ON_ENTER trigger
   with a required entry direction. */
function enteredFromSides(prevBox, newBox, obj){
  const sides = [];
  if(prevBox.x+prevBox.w <= obj.x && newBox.x+newBox.w > obj.x) sides.push("left");
  if(prevBox.x >= obj.x+obj.w && newBox.x < obj.x+obj.w) sides.push("right");
  if(prevBox.y+prevBox.h <= obj.y && newBox.y+newBox.h > obj.y) sides.push("top");
  if(prevBox.y >= obj.y+obj.h && newBox.y < obj.y+obj.h) sides.push("bottom");
  return sides;
}

const SAVE_KEY = "chutelibre_progress_v1";
function loadProgress(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  const p = {};
  for(const lv of LEVELS_SOURCE) p[lv.id] = {attempts:0, discovered:[], completed:false};
  return p;
}
function saveProgress(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); }catch(e){} }
let progress = loadProgress();
for(const lv of LEVELS_SOURCE) if(!progress[lv.id]) progress[lv.id] = {attempts:0, discovered:[], completed:false};

/* Manually imported (JSON) levels, in addition to the built-in ones — used
   to verify that a level designed in the editor behaves exactly the same
   once loaded here, in the real game. Purely in-memory (not persisted). */
let IMPORTED_LEVELS = [];
/* Levels loaded automatically from Firebase at startup (those with
   status "FINAL" — "PRODUCTION" levels are never offered here, only
   visible/testable from the editor). */
let FIREBASE_LEVELS = [];
function allLevels(){ return LEVELS_SOURCE.concat(IMPORTED_LEVELS).concat(FIREBASE_LEVELS); }
function ensureLevelProgress(id){
  if(!progress[id]) progress[id] = {attempts:0, discovered:[], completed:false};
}
