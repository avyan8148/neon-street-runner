window.onload = () => {

const $ = (sel) => document.querySelector(sel) || {};

const canvas = document.querySelector("canvas");
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
const sceneCanvas = document.createElement("canvas");
const sceneCtx = /** @type {CanvasRenderingContext2D} */ (sceneCanvas.getContext("2d"));
const glowCanvas = document.createElement("canvas");
const glowCtx = /** @type {CanvasRenderingContext2D} */ (glowCanvas.getContext("2d"));

const menuEl = $("#menu");
const settingsEl = $("#settings");
const touchEl = $("#touchControls");
const statusLineEl = $("#statusLine");
const autoDetectPillEl = $("#autoDetectPill");
const toastEl = $("#toast");
const deviceNotesEl = $("#deviceNotes");

// Basic runtime error surfacing (helps when opening via file:// without devtools).
window.addEventListener("error", (e) => {
  try {
    setToast(`Error: ${e.message || "unknown"}`, 4000);
    // eslint-disable-next-line no-console
    console.error(e.error || e.message);
  } catch {
    // ignore
  }
});

const btnStart = /** @type {HTMLButtonElement} */ ($("#btnStart"));
const btnSettings = /** @type {HTMLButtonElement} */ ($("#btnSettings"));
const btnCloseSettings = /** @type {HTMLButtonElement} */ ($("#btnCloseSettings"));
const btnStripe = /** @type {HTMLButtonElement} */ ($("#btnStripe"));

const stickEl = /** @type {HTMLDivElement} */ ($("#stick"));
const stickKnobEl = /** @type {HTMLDivElement} */ ($("#stickKnob"));
const btnPauseTouch = /** @type {HTMLButtonElement} */ ($("#btnPauseTouch"));
const btnThrottleTouch = /** @type {HTMLButtonElement} */ ($("#btnThrottleTouch"));
const btnBrakeTouch = /** @type {HTMLButtonElement} */ ($("#btnBrakeTouch"));
const btnNitroTouch = /** @type {HTMLButtonElement} */ ($("#btnNitroTouch"));
const btnDriftTouch = /** @type {HTMLButtonElement} */ ($("#btnDriftTouch"));

const STORAGE_KEY = "nsr_device";
const STORAGE_GFX = "nsr_gfx";
const STORAGE_BOT = "nsr_bot";
const STORAGE_CAR = "nsr_car";
const STORAGE_STRIPE = "nsr_stripe";
const STORAGE_MUSIC = "nsr_music";
const STORAGE_SFX = "nsr_sfx";
const STORAGE_GHOST = "nsr_ghost";
const STORAGE_DAILY_BEST = "nsr_daily_best_v1";

/** @typedef {"keyboard"|"touch"|"gamepad"} Device */
/** @typedef {"solo"|"bot"|"1v1"|"police"|"daily"} Mode */
/** @typedef {"low"|"high"} Graphics */
/** @typedef {"easy"|"medium"|"hard"} BotDifficulty */
/** @typedef {"rosso"|"black"|"white"|"yellow"} CarColor */
/** @typedef {"on"|"off"} Toggle */

const dailyHintEl = document.getElementById("dailyHint");

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const len2 = (x, y) => Math.hypot(x, y);

function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadDailyBest(key) {
  try {
    const raw = localStorage.getItem(STORAGE_DAILY_BEST);
    if (!raw) return { bestScore: 0, bestTime: 0 };
    const all = JSON.parse(raw);
    const rec = all?.[key];
    if (!rec) return { bestScore: 0, bestTime: 0 };
    return { bestScore: Number(rec.bestScore) || 0, bestTime: Number(rec.bestTime) || 0 };
  } catch {
    return { bestScore: 0, bestTime: 0 };
  }
}

function saveDailyBest(key, bestScore, bestTime) {
  try {
    const raw = localStorage.getItem(STORAGE_DAILY_BEST);
    const all = raw ? JSON.parse(raw) : {};
    all[key] = { bestScore, bestTime };
    localStorage.setItem(STORAGE_DAILY_BEST, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function nowMs() {
  return performance.now();
}

function setToast(text, ms = 1400) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  window.clearTimeout(setToast._t);
  setToast._t = window.setTimeout(() => (toastEl.hidden = true), ms);
}
setToast._t = 0;

function preferredDevice() {
  const hasTouch =
    "ontouchstart" in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    (navigator.msMaxTouchPoints ?? 0) > 0;
  const hasGamepad = (navigator.getGamepads?.() ?? []).some(Boolean);
  if (hasGamepad) return /** @type {Device} */ ("gamepad");
  if (hasTouch) return /** @type {Device} */ ("touch");
  return /** @type {Device} */ ("keyboard");
}

function deviceNotes(device) {
  if (device === "keyboard")
    return "Steer with WASD/Arrows. Hold Shift to drift. Tap Space for nitro. R restarts.";
  if (device === "touch")
    return "Use the left joystick to steer + throttle. Right buttons: Nitro and Drift. Works best in fullscreen.";
  return "Use the left stick to steer. RT accelerate, LT brake. A for nitro, B for drift.";
}

function modeNotes(mode) {
  if (mode === "solo") return "Free run: score by driving fast and drifting.";
  if (mode === "bot") return "Race vs Bot: keep ahead and avoid traffic.";
  if (mode === "1v1") return "Local 1v1: P1 uses WASD, P2 uses Arrow keys.";
  if (mode === "police") return "Police Chase: stay away from cops or get busted.";
  return "Daily Challenge: one run per day (same seed). Beat your best!";
}

/** @param {Device} device */
function setDevice(device) {
  state.device = device;
  localStorage.setItem(STORAGE_KEY, device);
  syncDeviceUI();
}

/** @param {Mode} mode */
function setMode(mode) {
  state.mode = mode;
  localStorage.setItem("nsr_mode", mode);
  syncModeUI();
}

function loadDevice() {
  const stored = /** @type {Device|null} */ (localStorage.getItem(STORAGE_KEY));
  if (stored === "keyboard" || stored === "touch" || stored === "gamepad") return stored;
  return preferredDevice();
}

function loadMode() {
  const stored = /** @type {Mode|null} */ (localStorage.getItem("nsr_mode"));
  if (stored === "solo" || stored === "bot" || stored === "1v1" || stored === "police" || stored === "daily") return stored;
  return /** @type {Mode} */ ("solo");
}

function loadGraphics() {
  const stored = /** @type {Graphics|null} */ (localStorage.getItem(STORAGE_GFX));
  if (stored === "low" || stored === "high") return stored;
  return /** @type {Graphics} */ ("low");
}

function loadBotDifficulty() {
  const stored = /** @type {BotDifficulty|null} */ (localStorage.getItem(STORAGE_BOT));
  if (stored === "easy" || stored === "medium" || stored === "hard") return stored;
  return /** @type {BotDifficulty} */ ("easy");
}

function loadCarColor() {
  const stored = /** @type {CarColor|null} */ (localStorage.getItem(STORAGE_CAR));
  if (stored === "rosso" || stored === "black" || stored === "white" || stored === "yellow") return stored;
  return /** @type {CarColor} */ ("rosso");
}

function loadStripe() {
  const stored = localStorage.getItem(STORAGE_STRIPE);
  if (stored === "0") return false;
  if (stored === "1") return true;
  return true;
}

function loadToggle(key, defaultOn = true) {
  const stored = localStorage.getItem(key);
  if (stored === "0") return false;
  if (stored === "1") return true;
  return defaultOn;
}

/** @param {Graphics} gfx */
function setGraphics(gfx) {
  state.graphics = gfx;
  localStorage.setItem(STORAGE_GFX, gfx);
  syncGraphicsUI();
  setToast(`Graphics: ${gfx.toUpperCase()}`);
}

/** @param {BotDifficulty} d */
function setBotDifficulty(d) {
  state.botDifficulty = d;
  localStorage.setItem(STORAGE_BOT, d);
  syncBotUI();
  setToast(`Bot: ${d.toUpperCase()}`);
}

/** @param {CarColor} c */
function setCarColor(c) {
  state.carColor = c;
  localStorage.setItem(STORAGE_CAR, c);
  syncCarUI();
  setToast(`Car: ${c.toUpperCase()}`);
}

function setStripe(on) {
  state.carStripe = !!on;
  localStorage.setItem(STORAGE_STRIPE, state.carStripe ? "1" : "0");
  syncCarUI();
}

function setMusic(on) {
  state.musicOn = !!on;
  localStorage.setItem(STORAGE_MUSIC, state.musicOn ? "1" : "0");
  syncAudioUI();
  if (state.musicOn) audio.startMusic();
  else audio.stopMusic();
}

function setSfx(on) {
  state.sfxOn = !!on;
  localStorage.setItem(STORAGE_SFX, state.sfxOn ? "1" : "0");
  syncAudioUI();
}

function setGhost(on) {
  state.ghostOn = !!on;
  localStorage.setItem(STORAGE_GHOST, state.ghostOn ? "1" : "0");
  syncReplayUI();
}

function syncDeviceUI() {
  const device = state.device;
  for (const el of document.querySelectorAll(".card[data-device]")) {
    const d = /** @type {HTMLElement} */ (el).getAttribute("data-device");
    if (!d) continue;
    if (d === device) el.classList.add("is-selected");
    else el.classList.remove("is-selected");
  }

  for (const el of document.querySelectorAll(".segmented__btn")) {
    const d = /** @type {HTMLElement} */ (el).getAttribute("data-device");
    if (!d) continue;
    if (d === device) el.classList.add("is-active");
    else el.classList.remove("is-active");
  }

  deviceNotesEl.textContent = deviceNotes(device);
  touchEl.hidden = device !== "touch" || !state.running;
  statusLineEl.textContent = `Device: ${device.toUpperCase()}`;
}

function syncModeUI() {
  const mode = state.mode;
  for (const el of document.querySelectorAll(".card[data-mode]")) {
    const m = /** @type {HTMLElement} */ (el).getAttribute("data-mode");
    if (!m) continue;
    if (m === mode) el.classList.add("is-selected");
    else el.classList.remove("is-selected");
  }
}

function syncGraphicsUI() {
  const gfx = state.graphics;
  for (const el of document.querySelectorAll(".segmented__btn[data-gfx]")) {
    const g = /** @type {HTMLElement} */ (el).getAttribute("data-gfx");
    if (!g) continue;
    if (g === gfx) el.classList.add("is-active");
    else el.classList.remove("is-active");
  }
}

function syncBotUI() {
  const d = state.botDifficulty;
  for (const el of document.querySelectorAll(".segmented__btn[data-bot]")) {
    const b = /** @type {HTMLElement} */ (el).getAttribute("data-bot");
    if (!b) continue;
    if (b === d) el.classList.add("is-active");
    else el.classList.remove("is-active");
  }
}

function syncCarUI() {
  const c = state.carColor;
  for (const el of document.querySelectorAll(".segmented__btn[data-carcolor]")) {
    const v = /** @type {HTMLElement} */ (el).getAttribute("data-carcolor");
    if (!v) continue;
    if (v === c) el.classList.add("is-active");
    else el.classList.remove("is-active");
  }
  if (btnStripe) btnStripe.textContent = `Stripe: ${state.carStripe ? "ON" : "OFF"}`;
}

function syncAudioUI() {
  for (const el of document.querySelectorAll(".segmented__btn[data-music]")) {
    const v = /** @type {HTMLElement} */ (el).getAttribute("data-music");
    if (!v) continue;
    const active = (v === "on") === state.musicOn;
    if (active) el.classList.add("is-active");
    else el.classList.remove("is-active");
  }
  for (const el of document.querySelectorAll(".segmented__btn[data-sfx]")) {
    const v = /** @type {HTMLElement} */ (el).getAttribute("data-sfx");
    if (!v) continue;
    const active = (v === "on") === state.sfxOn;
    if (active) el.classList.add("is-active");
    else el.classList.remove("is-active");
  }
}

function syncReplayUI() {
  for (const el of document.querySelectorAll(".segmented__btn[data-ghost]")) {
    const v = /** @type {HTMLElement} */ (el).getAttribute("data-ghost");
    if (!v) continue;
    const active = (v === "on") === state.ghostOn;
    if (active) el.classList.add("is-active");
    else el.classList.remove("is-active");
  }
}

function resizeCanvasToDisplaySize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(320, Math.round(rect.width * dpr));
  const h = Math.max(180, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    sceneCanvas.width = w;
    sceneCanvas.height = h;
    // Glow at half-res for speed
    glowCanvas.width = Math.max(1, Math.floor(w * 0.5));
    glowCanvas.height = Math.max(1, Math.floor(h * 0.5));
  }
}

const input = {
  steer: 0,
  throttle: 0,
  brake: 0,
  drift: false,
  nitro: false,
  pausePressed: false,
  restartPressed: false,
};

const input2 = {
  steer: 0,
  throttle: 0,
  brake: 0,
  drift: false,
  nitro: false,
};

const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (e.code === "Escape") {
    if (!settingsEl.hidden) {
      toggleSettings(false);
      e.preventDefault();
      return;
    }
    input.pausePressed = true;
  }
  if (e.code === "KeyR") input.restartPressed = true;
  if (e.code === "Enter" && !state.running && !menuEl.hidden) startGame();
  if (e.code === "Enter" && state.gameOver) input.restartPressed = true;
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

function readKeyboard() {
  const left = keys.has("ArrowLeft") || keys.has("KeyA");
  const right = keys.has("ArrowRight") || keys.has("KeyD");
  const up = keys.has("ArrowUp") || keys.has("KeyW");
  const down = keys.has("ArrowDown") || keys.has("KeyS");
  input.steer = (right ? 1 : 0) - (left ? 1 : 0);
  input.throttle = up ? 1 : 0;
  input.brake = down ? 1 : 0;
  input.drift = keys.has("ShiftLeft") || keys.has("ShiftRight");
  input.nitro = keys.has("Space");
}

function readKeyboardP1P2() {
  // P1: WASD
  const p1Left = keys.has("KeyA");
  const p1Right = keys.has("KeyD");
  const p1Up = keys.has("KeyW");
  const p1Down = keys.has("KeyS");
  input.steer = (p1Right ? 1 : 0) - (p1Left ? 1 : 0);
  input.throttle = p1Up ? 1 : 0;
  input.brake = p1Down ? 1 : 0;
  input.drift = keys.has("ShiftLeft") || keys.has("ShiftRight");
  input.nitro = keys.has("Space");

  // P2: Arrow keys
  const p2Left = keys.has("ArrowLeft");
  const p2Right = keys.has("ArrowRight");
  const p2Up = keys.has("ArrowUp");
  const p2Down = keys.has("ArrowDown");
  input2.steer = (p2Right ? 1 : 0) - (p2Left ? 1 : 0);
  input2.throttle = p2Up ? 1 : 0;
  input2.brake = p2Down ? 1 : 0;
  input2.drift = false;
  input2.nitro = false;
}

const touchState = {
  active: false,
  id: -1,
  centerX: 0,
  centerY: 0,
  dx: 0,
  dy: 0,
  nitro: false,
  drift: false,
  throttle: false,
  brake: false,
};

function setStickKnob(dx, dy) {
  const maxR = 44;
  const r = len2(dx, dy);
  const k = r > maxR ? maxR / r : 1;
  const x = dx * k;
  const y = dy * k;
  stickKnobEl.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
}

function resetStick() {
  touchState.active = false;
  touchState.id = -1;
  touchState.dx = 0;
  touchState.dy = 0;
  setStickKnob(0, 0);
}

stickEl.addEventListener("pointerdown", (e) => {
  touchState.active = true;
  touchState.id = e.pointerId;
  const rect = stickEl.getBoundingClientRect();
  touchState.centerX = rect.left + rect.width / 2;
  touchState.centerY = rect.top + rect.height / 2;
  stickEl.setPointerCapture(e.pointerId);
});
stickEl.addEventListener("pointermove", (e) => {
  if (!touchState.active || e.pointerId !== touchState.id) return;
  touchState.dx = e.clientX - touchState.centerX;
  touchState.dy = e.clientY - touchState.centerY;
  setStickKnob(touchState.dx, touchState.dy);
});
stickEl.addEventListener("pointerup", (e) => {
  if (e.pointerId !== touchState.id) return;
  resetStick();
});
stickEl.addEventListener("pointercancel", () => resetStick());

btnNitroTouch.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  touchState.nitro = true;
});
btnNitroTouch.addEventListener("pointerup", () => (touchState.nitro = false));
btnNitroTouch.addEventListener("pointercancel", () => (touchState.nitro = false));

btnDriftTouch.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  touchState.drift = true;
});
btnDriftTouch.addEventListener("pointerup", () => (touchState.drift = false));
btnDriftTouch.addEventListener("pointercancel", () => (touchState.drift = false));

if (btnPauseTouch) {
  btnPauseTouch.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    input.pausePressed = true;
    audio.playSfx("click");
    if (navigator.vibrate) navigator.vibrate(12);
  });
}

function bindHold(btn, onDown, onUp) {
  if (!btn) return;
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    onDown();
    audio.playSfx("click");
    if (navigator.vibrate) navigator.vibrate(10);
  });
  btn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    onUp();
  });
  btn.addEventListener("pointercancel", () => onUp());
  btn.addEventListener("pointerleave", () => onUp());
}

bindHold(btnThrottleTouch, () => (touchState.throttle = true), () => (touchState.throttle = false));
bindHold(btnBrakeTouch, () => (touchState.brake = true), () => (touchState.brake = false));

function readTouch() {
  const maxR = 52;
  const dx = clamp(touchState.dx / maxR, -1, 1);
  input.steer = dx;
  // Improved touch: joystick steers only; Gas/Brake are buttons.
  input.throttle = touchState.throttle ? 1 : 0;
  input.brake = touchState.brake ? 1 : 0;
  input.drift = touchState.drift;
  input.nitro = touchState.nitro;
}

const gamepadState = {
  connected: false,
  lastSeenAt: 0,
};

window.addEventListener("gamepadconnected", () => {
  gamepadState.connected = true;
  gamepadState.lastSeenAt = nowMs();
  if (state.device === "gamepad") setToast("Gamepad connected.");
});
window.addEventListener("gamepaddisconnected", () => {
  gamepadState.connected = false;
  if (state.device === "gamepad") setToast("Gamepad disconnected.");
});

function readGamepad() {
  const pads = navigator.getGamepads?.() ?? [];
  const gp = pads.find(Boolean);
  if (!gp) {
    input.steer = 0;
    input.throttle = 0;
    input.brake = 0;
    input.drift = false;
    input.nitro = false;
    return;
  }

  gamepadState.connected = true;
  gamepadState.lastSeenAt = nowMs();

  const lx = gp.axes?.[0] ?? 0;
  input.steer = Math.abs(lx) < 0.08 ? 0 : clamp(lx, -1, 1);

  // Typical: axes[2]/axes[5] or buttons[6]/buttons[7] for triggers. Prefer buttons first.
  const lt = gp.buttons?.[6]?.value ?? 0;
  const rt = gp.buttons?.[7]?.value ?? 0;

  input.throttle = clamp(rt, 0, 1);
  input.brake = clamp(lt, 0, 1);

  const nitroBtn = gp.buttons?.[0]?.pressed ?? false; // A / Cross
  const driftBtn = gp.buttons?.[1]?.pressed ?? false; // B / Circle
  input.nitro = nitroBtn;
  input.drift = driftBtn;
}

const state = {
  device: /** @type {Device} */ ("keyboard"),
  mode: /** @type {Mode} */ ("solo"),
  graphics: /** @type {Graphics} */ ("low"),
  botDifficulty: /** @type {BotDifficulty} */ ("easy"),
  carColor: /** @type {CarColor} */ ("rosso"),
  carStripe: true,
  musicOn: true,
  sfxOn: true,
  ghostOn: true,
  running: false,
  paused: false,
  gameOver: false,
  startedAt: 0,
  lastMs: 0,
  time: 0,
  score: 0,
  shake: 0,
  vibe: 0,
  prevDrift: false,
  hazardHits: 0,
  race: {
    active: false,
    finished: false,
    startY: 0,
    finishY: 0,
    winner: /** @type {"P1"|"P2"|"BOT"|""} */ (""),
  },
  daily: {
    seed: 0,
    key: "",
    bestScore: 0,
    bestTime: 0,
    rnd: /** @type {null | (() => number)} */ (null),
  },
  heat: {
    level: 0,
    value: 0, // 0..1 within level
  },
  // Track
  roadW: 320,
  roadCenterX: 0,
  roadCurve: 0,
  // Entities
  car: {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    a: 0, // angle
    av: 0,
    speed: 0,
    nitro: 1,
    driftCharge: 0,
    boostTimer: 0,
  },
  car2: {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    a: 0,
    av: 0,
    speed: 0,
    nitro: 1,
    driftCharge: 0,
    boostTimer: 0,
  },
  botCar: {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    a: 0,
    av: 0,
    speed: 0,
    nitro: 1,
    driftCharge: 0,
    boostTimer: 0,
    rubberBand: 0,
  },
  police: {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    a: 0,
    speed: 0,
    busted: 0, // 0..1
  },
  pickups: /** @type {Array<{x:number,y:number,kind:"orb"|"hazard"}>} */ ([]),
  ai: /** @type {Array<{x:number,y:number,v:number,seed:number}>} */ ([]),
  particles: /** @type {Array<{x:number,y:number,vx:number,vy:number,life:number,kind:"spark"|"smoke"|"glow"}>} */ ([]),
  ghost: {
    rec: /** @type {Array<{t:number,x:number,y:number,a:number}>} */ ([]),
    play: /** @type {Array<{t:number,x:number,y:number,a:number}>} */ ([]),
    playing: false,
  },
};

function resetGame() {
  const w = canvas.width;
  const h = canvas.height;
  state.running = true;
  state.paused = false;
  state.gameOver = false;
  state.startedAt = nowMs();
  state.lastMs = state.startedAt;
  state.time = 0;
  state.score = 0;
  state.shake = 0;
  state.vibe = 0;
  state.prevDrift = false;
  state.hazardHits = 0;
  state.heat.level = 0;
  state.heat.value = 0;
  state.race.active = state.mode === "bot" || state.mode === "1v1" || state.mode === "daily";
  state.race.finished = false;
  state.race.winner = "";
  state.race.startY = state.car.y;
  state.race.finishY = state.car.y - 6500; // race length

  state.roadW = Math.min(w * 0.56, 520);
  state.roadCenterX = 0;
  state.roadCurve = 0;

  state.car.x = 0;
  state.car.y = 0;
  state.car.vx = 0;
  state.car.vy = -20;
  state.car.a = -Math.PI / 2;
  state.car.av = 0;
  state.car.speed = 0;
  state.car.nitro = 1;
  state.car.driftCharge = 0;
  state.car.boostTimer = 0;

  state.car2.x = 42;
  state.car2.y = 80;
  state.car2.vx = 0;
  state.car2.vy = -15;
  state.car2.a = -Math.PI / 2;
  state.car2.av = 0;
  state.car2.speed = 0;
  state.car2.nitro = 1;
  state.car2.driftCharge = 0;
  state.car2.boostTimer = 0;

  state.botCar.active = state.mode === "bot";
  state.botCar.x = -42;
  // Give a small head start on higher difficulties so it can actually win sometimes.
  const headStart = state.botDifficulty === "hard" ? -240 : state.botDifficulty === "medium" ? -120 : 0;
  state.botCar.y = 90 + headStart;
  state.botCar.vx = 0;
  state.botCar.vy = -18;
  state.botCar.a = -Math.PI / 2;
  state.botCar.av = 0;
  state.botCar.speed = 0;
  state.botCar.nitro = 1;
  state.botCar.driftCharge = 0;
  state.botCar.boostTimer = 0;
  state.botCar.rubberBand = 0;

  state.police.active = state.mode === "police";
  state.police.x = 0;
  state.police.y = 520;
  state.police.vx = 0;
  state.police.vy = -60;
  state.police.a = -Math.PI / 2;
  state.police.speed = 0;
  state.police.busted = 0;

  state.pickups.length = 0;
  state.ai.length = 0;
  state.particles.length = 0;
  state.ghost.rec.length = 0;
  state.ghost.playing = false;
  // Seeded spawns for Daily Challenge.
  const key = todayKey();
  state.daily.key = key;
  state.daily.seed = fnv1a(`nsr:${key}`);
  const best = loadDailyBest(key);
  state.daily.bestScore = best.bestScore;
  state.daily.bestTime = best.bestTime;
  if (dailyHintEl) {
    dailyHintEl.textContent =
      best.bestScore > 0 ? `Best: ${Math.floor(best.bestScore)} (${best.bestTime.toFixed(1)}s)` : "Best: —";
  }

  const seeded = state.mode === "daily";
  state.daily.rnd = seeded ? mulberry32(state.daily.seed) : null;
  const rnd = seeded ? state.daily.rnd : Math.random;

  for (let i = 0; i < 22; i++) spawnPickup(-i * 220 - 220, rnd);
  const trafficCount = state.mode === "1v1" ? 2 : 3;
  for (let i = 0; i < trafficCount; i++) spawnAiCar(-i * 640 - 540, rnd);

  // Load ghost for today if enabled.
  if (state.mode === "daily" && state.ghostOn) {
    try {
      const raw = localStorage.getItem(`nsr_ghost_${state.daily.key}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 5) {
          state.ghost.play = arr;
          state.ghost.playing = true;
        } else {
          state.ghost.play = [];
          state.ghost.playing = false;
        }
      } else {
        state.ghost.play = [];
        state.ghost.playing = false;
      }
    } catch {
      state.ghost.play = [];
      state.ghost.playing = false;
    }
  } else {
    state.ghost.play = [];
    state.ghost.playing = false;
  }

  syncDeviceUI();
  syncModeUI();
}

function spawnPickup(y, rnd = Math.random) {
  const kind = rnd() < 0.22 ? "hazard" : "orb";
  const lane = (rnd() * 2 - 1) * (state.roadW * 0.32);
  state.pickups.push({ x: lane, y, kind });
}

function spawnAiCar(y, rnd = Math.random) {
  const lane = (rnd() * 2 - 1) * (state.roadW * 0.24);
  state.ai.push({ x: lane, y, v: 120 + rnd() * 80, seed: rnd() * 10_000 });
}

function toggleSettings(open) {
  const shouldOpen = open ?? settingsEl.hidden;
  settingsEl.hidden = !shouldOpen;
  if (!settingsEl.hidden) deviceNotesEl.textContent = deviceNotes(state.device);
}

btnSettings.addEventListener("click", () => toggleSettings(true));
btnCloseSettings.addEventListener("click", () => toggleSettings(false));

// Close settings if you click outside the sheet.
document.addEventListener("pointerdown", (e) => {
  if (settingsEl.hidden) return;
  const t = /** @type {Node} */ (e.target);
  if (settingsEl.contains(t)) return;
  if (btnSettings.contains(t)) return;
  toggleSettings(false);
});

for (const btn of document.querySelectorAll(".card")) {
  btn.addEventListener("click", () => {
    const device = /** @type {Device} */ (btn.getAttribute("data-device"));
    if (device === "keyboard" || device === "touch" || device === "gamepad") {
      setDevice(device);
      setToast(`Selected: ${device.toUpperCase()}`);
      audio.playSfx("click");
    }
  });
}

for (const btn of document.querySelectorAll(".card[data-mode]")) {
  btn.addEventListener("click", () => {
    const mode = /** @type {Mode} */ (btn.getAttribute("data-mode"));
    if (mode === "solo" || mode === "bot" || mode === "1v1" || mode === "police" || mode === "daily") {
      setMode(mode);
      setToast(`Mode: ${mode.toUpperCase()}`);
      audio.playSfx("click");
    }
  });
}

for (const btn of document.querySelectorAll(".segmented__btn")) {
  btn.addEventListener("click", () => {
    const device = /** @type {Device} */ (btn.getAttribute("data-device"));
    if (device === "keyboard" || device === "touch" || device === "gamepad") {
      setDevice(device);
      setToast(`Device: ${device.toUpperCase()}`);
      return;
    }

    const gfx = /** @type {Graphics} */ (btn.getAttribute("data-gfx"));
    if (gfx === "low" || gfx === "high") {
      setGraphics(gfx);
      return;
    }

    const bot = /** @type {BotDifficulty} */ (btn.getAttribute("data-bot"));
    if (bot === "easy" || bot === "medium" || bot === "hard") {
      setBotDifficulty(bot);
      return;
    }

    const carColor = /** @type {CarColor} */ (btn.getAttribute("data-carcolor"));
    if (carColor === "rosso" || carColor === "black" || carColor === "white" || carColor === "yellow") {
      setCarColor(carColor);
      audio.playSfx("click");
      return;
    }

    const music = /** @type {Toggle} */ (btn.getAttribute("data-music"));
    if (music === "on" || music === "off") {
      setMusic(music === "on");
      audio.playSfx("click");
      return;
    }

    const sfx = /** @type {Toggle} */ (btn.getAttribute("data-sfx"));
    if (sfx === "on" || sfx === "off") {
      setSfx(sfx === "on");
      audio.playSfx("click");
      return;
    }

    const ghost = /** @type {Toggle} */ (btn.getAttribute("data-ghost"));
    if (ghost === "on" || ghost === "off") {
      setGhost(ghost === "on");
      audio.playSfx("click");
      return;
    }
  });
}

if (btnStripe) {
  btnStripe.addEventListener("click", () => {
    setStripe(!state.carStripe);
    audio.playSfx("click");
  });
}

btnStart.addEventListener("click", () => {
  startGame();
});

window.addEventListener("resize", () => resizeCanvasToDisplaySize());

function startGame() {
  menuEl.hidden = true;
  audio.resume();
  if (state.musicOn) audio.startMusic();
  resetGame();
}

function updateInputs() {
  if (state.mode === "1v1") {
    readKeyboardP1P2();
    return;
  }

  if (state.device === "keyboard") readKeyboard();
  else if (state.device === "touch") readTouch();
  else readGamepad();
}

function update(dt) {
  if (!state.running) return;
  if (state.paused) return;
  if (state.gameOver) return;
  if (state.race.finished) return;

  const car = state.car;
  const car2 = state.car2;
  const botCar = state.botCar;
  const worldRoadLeft = () => state.roadCenterX - state.roadW / 2;
  const worldRoadRight = () => state.roadCenterX + state.roadW / 2;

  // Ease road curve slightly with steering for vibe.
  state.roadCurve = lerp(state.roadCurve, input.steer * 0.9, 0.04);
  state.roadCenterX = lerp(state.roadCenterX, state.roadCurve * state.roadW * 0.28, 0.035);

  const doCarPhysics = (c, inp, tuning) => {
    const maxSpeed = tuning?.maxSpeed ?? 540;
    const accel = tuning?.accel ?? 430;
    const brake = tuning?.brake ?? 560;
    const steerPower = inp.drift ? 7.2 : 5.0;
    const driftSideGrip = 0.72; // lower => more slide
    const normalSideGrip = 0.965;
    const forwardGrip = inp.drift ? 0.992 : 0.996;

    const nitroOn = inp.nitro && c.nitro > 0.02;
    const nitroMult = nitroOn ? 1.5 : 1;

    // Drift boost: build charge while sliding; release to get a mini-boost.
    const canCharge = inp.drift && c.speed > 150 && Math.abs(inp.steer) > 0.2;
    if (canCharge) {
      c.driftCharge = clamp(c.driftCharge + dt * 0.42 * (0.55 + Math.abs(inp.steer) * 0.9), 0, 1);
      state.vibe = Math.min(1, state.vibe + dt * 0.25);
    } else {
      c.driftCharge = Math.max(0, c.driftCharge - dt * 0.18);
    }

    if (c._prevDrift && !inp.drift && c.driftCharge > 0.14 && c.speed > 140) {
      c.boostTimer = Math.max(c.boostTimer, 0.45 + c.driftCharge * 0.9);
      state.shake = Math.min(1, state.shake + 0.18 + c.driftCharge * 0.22);
      if (c === car) {
        setToast("Drift boost!");
        audio.playSfx("boost");
      }
      c.driftCharge = 0;
    }
    c._prevDrift = inp.drift;

    const boostOn = c.boostTimer > 0;
    const boostMult = boostOn ? 1.22 : 1;
    if (boostOn) c.boostTimer = Math.max(0, c.boostTimer - dt);

    const targetSteer = inp.steer;
    const steer = targetSteer * steerPower;

    // Stronger yaw when drifting (handbrake-like).
    const yawLerp = inp.drift ? 0.22 : 0.14;
    c.av = lerp(c.av, steer, yawLerp);
    c.a += c.av * dt;

    const ax = Math.cos(c.a);
    const ay = Math.sin(c.a);

    const thrust = accel * inp.throttle * nitroMult * boostMult;
    c.vx += ax * thrust * dt;
    c.vy += ay * thrust * dt;

    const brakeForce = brake * inp.brake;
    c.vx -= ax * brakeForce * dt;
    c.vy -= ay * brakeForce * dt;

    // Drift-style damping: reduce sideways velocity less during drift.
    const fwd = c.vx * ax + c.vy * ay;
    const side = -c.vx * ay + c.vy * ax;
    const fwd2 = fwd * Math.pow(forwardGrip, dt * 60);
    const sideGrip = inp.drift ? driftSideGrip : normalSideGrip;
    const side2 = side * Math.pow(sideGrip, dt * 60);
    c.vx = fwd2 * ax - side2 * ay;
    c.vy = fwd2 * ay + side2 * ax;

    // Handbrake effect
    if (inp.drift && c.speed > 90) {
      const sign = Math.sign(inp.steer || c.av || 1);
      const slipPush = 220 + Math.min(220, c.speed * 0.45);
      c.vx += (-ay) * sign * slipPush * dt * 0.55;
      c.vy += (ax) * sign * slipPush * dt * 0.55;
      c.vx -= ax * 90 * dt;
      c.vy -= ay * 90 * dt;
    }

    // Cap speed.
    const sp = len2(c.vx, c.vy);
    if (sp > maxSpeed) {
      const k = maxSpeed / sp;
      c.vx *= k;
      c.vy *= k;
    }
    c.speed = len2(c.vx, c.vy);

    // Nitro management.
    if (nitroOn) c.nitro = Math.max(0, c.nitro - dt * 0.22);
    else c.nitro = Math.min(1, c.nitro + dt * 0.06);

    c.x += c.vx * dt;
    c.y += c.vy * dt;

    // Road bounds.
    const left = state.roadCenterX - state.roadW / 2;
    const right = state.roadCenterX + state.roadW / 2;
    const margin = 28;
    if (c.x < left + margin) {
      const d = (left + margin) - c.x;
      c.x += d;
      // Bounce back toward center instead of dying.
      c.vx = Math.abs(c.vx) * 0.35;
      c.vy *= 0.98;
      c.x = lerp(c.x, state.roadCenterX, 0.55);
      if (c === car) {
        state.shake = Math.min(1, state.shake + 0.22);
        audio.playSfx("wall");
      }
    }
    if (c.x > right - margin) {
      const d = c.x - (right - margin);
      c.x -= d;
      // Bounce back toward center instead of dying.
      c.vx = -Math.abs(c.vx) * 0.35;
      c.vy *= 0.98;
      c.x = lerp(c.x, state.roadCenterX, 0.55);
      if (c === car) {
        state.shake = Math.min(1, state.shake + 0.22);
        audio.playSfx("wall");
      }
    }

    return { ax, ay, nitroOn };
  };

  // Player 1
  doCarPhysics(car, input);

  // Player 2 in 1v1
  if (state.mode === "1v1") {
    doCarPhysics(car2, input2);
  }

  // Bot opponent (simple lane-follow + rubber band)
  if (state.mode === "bot" && botCar.active) {
    // gap > 0 means bot is behind (player is ahead; more negative y is ahead)
    const gap = botCar.y - car.y;
    botCar.rubberBand = lerp(botCar.rubberBand, clamp(gap / 1100, -1, 1), 0.05);

    const botBehind = gap > 0;

    const diff = state.botDifficulty;
    const diffTuning =
      diff === "easy"
        ? { maxSpeed: 575, accel: 440, brake: 585, nitroBehind: 0.04, steerScale: 0.92, bump: 0.0, block: 0.08, cheat: 0.0, rubber: 0.0 }
      : diff === "medium"
          ? { maxSpeed: 740, accel: 620, brake: 640, nitroBehind: 0.20, steerScale: 1.12, bump: 0.55, block: 0.26, cheat: 170, rubber: 220 }
          : { maxSpeed: 820, accel: 700, brake: 700, nitroBehind: 0.28, steerScale: 1.18, bump: 0.85, block: 0.34, cheat: 320, rubber: 360 };

    // --- Smarter bot steering: racing line + avoidance + overtake ---
    const botWorldX = botCar.x;
    const botWorldY = botCar.y;
    const roadL = worldRoadLeft();
    const roadR = worldRoadRight();
    const roadMargin = 42;

    const look = clamp(420 + botCar.speed * 0.9, 420, 980);
    const sideRoom = Math.max(40, state.roadW * 0.22);

    // Smooth racing line: near center but with gentle oscillation, plus "block" if ahead.
    const line = state.roadCenterX + Math.sin(state.time * 0.55) * (state.roadW * 0.10);

    // On hard, anticipate your steering more aggressively.
    const anticipate = diff === "hard" ? 140 : diff === "medium" ? 105 : 70;
    const chaseX = car.x + clamp(input.steer * anticipate, -150, 150);
    const blockX = car.x + clamp((car.x - botCar.x) * (0.22 + diffTuning.block), -150, 150);
    let targetX = botBehind ? chaseX : blockX;

    // Blend back toward a racing line so it doesn't just mirror the player.
    targetX = lerp(targetX, line, botBehind ? 0.25 : 0.55);

    // Perception: find threats ahead of bot (traffic and hazards).
    /** @type {{x:number,y:number,type:"traffic"|"hazard"}[]} */
    const threats = [];

    // Red hazards
    for (const p of state.pickups) {
      if (p.kind !== "hazard") continue;
      const wx = p.x + state.roadCenterX;
      const wy = p.y;
      const dy = botWorldY - wy;
      if (dy <= 0) continue; // not ahead
      if (dy > look) continue;
      threats.push({ x: wx, y: wy, type: "hazard" });
    }

    // Traffic cars
    for (const t of state.ai) {
      const wx = t.x + state.roadCenterX;
      const wy = t.y;
      const dy = botWorldY - wy;
      if (dy <= 0) continue;
      if (dy > look) continue;
      threats.push({ x: wx, y: wy, type: "traffic" });
    }

    // Avoidance force (steer away from close threats)
    let avoid = 0;
    let blocker = null;
    let blockerDist = 1e9;
    for (const th of threats) {
      const dxT = th.x - botWorldX;
      const dyT = botWorldY - th.y; // >0 ahead
      const adx = Math.abs(dxT);
      const laneHit = adx < (th.type === "traffic" ? 70 : 60);
      const w = clamp(1 - dyT / look, 0, 1);

      // Mark nearest blocker in front of bot
      if (laneHit && dyT < blockerDist) {
        blockerDist = dyT;
        blocker = th;
      }

      // Repulsion
      const strength = (th.type === "traffic" ? 1.0 : 1.25) * w;
      avoid += (-Math.sign(dxT || 1)) * strength * clamp((80 - adx) / 80, 0, 1);
    }

    // Overtake decision: if a blocker is right ahead, pick side with more space.
    if (blocker && blockerDist < 220) {
      const leftTarget = clamp(blocker.x - sideRoom, roadL + roadMargin, roadR - roadMargin);
      const rightTarget = clamp(blocker.x + sideRoom, roadL + roadMargin, roadR - roadMargin);

      const scoreSide = (xSide) => {
        let score = 0;
        for (const th of threats) {
          const dyT = botWorldY - th.y;
          if (dyT < 0 || dyT > 340) continue;
          const d = Math.abs(th.x - xSide);
          const penalty = clamp((120 - d) / 120, 0, 1);
          score += penalty * (th.type === "traffic" ? 1.2 : 1.5);
        }
        // Prefer staying away from edges
        score += clamp((roadMargin + 30 - (xSide - roadL)) / 80, 0, 1) * 0.9;
        score += clamp((roadMargin + 30 - (roadR - xSide)) / 80, 0, 1) * 0.9;
        return score;
      };

      targetX = scoreSide(leftTarget) <= scoreSide(rightTarget) ? leftTarget : rightTarget;
    }

    // Apply avoidance gently.
    targetX += avoid * (diff === "hard" ? 68 : diff === "medium" ? 54 : 42);
    targetX = clamp(targetX, roadL + roadMargin, roadR - roadMargin);

    const dx = targetX - botCar.x;

    const botInp = {
      steer: clamp((dx / (state.roadW * 0.20)) * diffTuning.steerScale, -1, 1),
      throttle: 1,
      brake: 0,
      drift: botCar.speed > 240 && Math.abs(dx) > state.roadW * 0.20,
      nitro: botCar.nitro > 0.08 && botBehind && gap < 1900 && Math.abs(dx) < state.roadW * 0.35,
    };

    // Hard uses nitro more often (feels like it "wants to win").
    if (diff === "hard" && botCar.nitro > 0.06 && gap < 2400) {
      botInp.nitro = botBehind || Math.abs(dx) < state.roadW * 0.22;
    }

    // Push harder when behind so it actually tries to win.
    const throttleBoost = botBehind
      ? (0.08 + clamp(gap / 1400, 0, 1) * (0.18 + diffTuning.nitroBehind))
      : (0.03 + diffTuning.block * 0.04);
    botInp.throttle = clamp(botInp.throttle + throttleBoost, 0, 1);

    // Brake if a traffic car is directly in front and we haven't committed to an overtake yet.
    if (blocker && blockerDist < 120 && Math.abs(dx) < 40) {
      botInp.brake = diff === "hard" ? 0.15 : 0.25;
      botInp.throttle = Math.min(botInp.throttle, 0.75);
    }

    doCarPhysics(botCar, botInp, { maxSpeed: diffTuning.maxSpeed, accel: diffTuning.accel, brake: diffTuning.brake });

    // Extra "skill" on higher difficulties: a controlled catch-up push when behind.
    // (Keeps races close and makes medium/hard actually fight to win.)
    if (diffTuning.cheat > 0 && botBehind) {
      const axb = Math.cos(botCar.a);
      const ayb = Math.sin(botCar.a);
      const k = clamp(gap / 1200, 0, 1);
      botCar.vx += axb * diffTuning.cheat * k * dt;
      botCar.vy += ayb * diffTuning.cheat * k * dt;
    }

    // Rubberband: keep the race tight (bot refuses to fall behind too far on medium/hard).
    if (diffTuning.rubber > 0 && botBehind) {
      const axb = Math.cos(botCar.a);
      const ayb = Math.sin(botCar.a);
      const k2 = clamp(gap / 700, 0, 1);
      botCar.vx += axb * diffTuning.rubber * k2 * dt;
      botCar.vy += ayb * diffTuning.rubber * k2 * dt;
      // Give it a little nitro back while chasing so it keeps pressure.
      botCar.nitro = Math.min(1, botCar.nitro + dt * (diff === "hard" ? 0.14 : 0.08));
    }

    // Light bumping when close
    const dx2 = botCar.x - car.x;
    const dy2 = botCar.y - car.y;
    if (diffTuning.bump > 0 && dx2 * dx2 + dy2 * dy2 < (70 * 70)) {
      const push = 180 * dt;
      car.vx += (dx2 > 0 ? -1 : 1) * push * diffTuning.bump;
      car.vy += 60 * dt * diffTuning.bump;
      state.shake = Math.min(1, state.shake + 0.25 * diffTuning.bump);
    }
  }

  // Race finish check
  if (state.race.active) {
    const finishY = state.race.finishY;
    const p1Done = car.y <= finishY;
    const p2Done = state.mode === "1v1" ? (car2.y <= finishY) : false;
    const botDone = state.mode === "bot" ? (botCar.y <= finishY) : false;

    if (p1Done || p2Done || botDone) {
      state.race.finished = true;
      if (state.mode === "bot") state.race.winner = p1Done ? "P1" : "BOT";
      else if (state.mode === "1v1") state.race.winner = p1Done ? "P1" : "P2";
      else state.race.winner = "P1";
      setToast(`Finish! Winner: ${state.race.winner}`);
      audio.playSfx("finish");
    }
  }

  // Save daily ghost + best
  if (state.mode === "daily" && state.race.finished && state.ghostOn) {
    const best = loadDailyBest(state.daily.key);
    const scoreNow = state.score;
    const timeNow = state.time;
    const isBetter = scoreNow > best.bestScore || (scoreNow === best.bestScore && timeNow < best.bestTime);
    if (isBetter) {
      saveDailyBest(state.daily.key, scoreNow, timeNow);
      try {
        localStorage.setItem(`nsr_ghost_${state.daily.key}`, JSON.stringify(state.ghost.rec));
      } catch {
        // ignore
      }
      if (dailyHintEl) dailyHintEl.textContent = `Best: ${Math.floor(scoreNow)} (${timeNow.toFixed(1)}s)`;
      setToast("New daily best!");
    }
  }

  // Police chase (simple pursuit + busted meter)
  if (state.mode === "police" && state.police.active) {
    const p = state.police;
    // Stay close behind, but try to align and ram.
    const ax = Math.cos(car.a);
    const ay = Math.sin(car.a);

    // Police tries to get to a side "pit" position when close, otherwise closes from behind.
    const dxp = p.x - car.x;
    const dyp = p.y - car.y;
    const dist = Math.hypot(dxp, dyp);
    const heat = state.heat.level;
    const closeForPit = dist < (heat >= 2 ? 300 : 220);

    // Target a point slightly ahead of the player (so cops can catch/ram, not forever trail).
    const ahead = closeForPit ? (heat >= 2 ? 140 : 80) : (heat >= 2 ? 220 : 160);
    const behind = closeForPit ? (heat >= 2 ? 30 : -40) : -120;
    const forwardX = car.x + ax * ahead;
    const forwardY = car.y + ay * ahead;

    const sideSign = (dxp > 0 ? 1 : -1) || 1;
    const sideOffset = closeForPit ? 70 : 40;
    const sideX = -ay * sideSign * sideOffset;
    const sideY = ax * sideSign * sideOffset;

    const desiredX = closeForPit ? (forwardX + sideX) : (car.x + ax * behind);
    const desiredY = closeForPit ? (forwardY + sideY) : (car.y + ay * behind);
    const dx = desiredX - p.x;
    const dy = desiredY - p.y;

    // Pursuit velocity (snappier)
    const top = (closeForPit ? 820 : 900) + heat * 160;
    p.vx = lerp(p.vx, clamp(dx * 2.2, -top, top), 0.12);
    p.vy = lerp(p.vy, clamp(dy * 2.2, -top, top), 0.12);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.speed = len2(p.vx, p.vy);
    p.a = Math.atan2(p.vy, p.vx) - Math.PI / 2;

    // Keep police on the road.
    const left = state.roadCenterX - state.roadW / 2;
    const right = state.roadCenterX + state.roadW / 2;
    p.x = clamp(p.x, left + 24, right - 24);

    const dx2 = p.x - car.x;
    const dy2 = p.y - car.y;
    const dist2 = dx2 * dx2 + dy2 * dy2;
    const close = dist2 < ((140 + heat * 10) * (140 + heat * 10));

    // Busted builds when close; builds faster when you're slow (like getting boxed in).
    if (close) {
      const slowBonus = clamp(1 - car.speed / 260, 0, 1);
      const bumpBonus = dist2 < (70 * 70) ? 0.14 + heat * 0.04 : 0;
      // Slower busted fill
      p.busted = clamp(p.busted + dt * (0.12 + slowBonus * (0.20 + heat * 0.05) + bumpBonus), 0, 1);
      state.shake = Math.min(1, state.shake + dt * 0.35);

      // Ram effect: if very close, nudge player sideways (PIT-like).
      if (dist2 < (72 * 72)) {
        const push = 320 * dt;
        car.vx += (dx2 > 0 ? -1 : 1) * push;
        car.vy += (dy2 > 0 ? -1 : 1) * (push * 0.25);
      }
    } else {
      // Recover a bit faster when you're away
      p.busted = clamp(p.busted - dt * 0.16, 0, 1);
    }

    if (p.busted >= 1) {
      state.gameOver = true;
      setToast("Busted! Press R to retry.");
      audio.playSfx("busted");
    }
  }

  // Score: reward speed + drifting.
  const driftBonus = input.drift ? 1.0 + Math.min(0.75, Math.abs(input.steer) * 0.75) : 1;
  state.score += (car.speed / 240) * driftBonus * dt;

  // Heat system (builds with speed + drift + near traffic; increases difficulty)
  if (state.mode !== "solo") {
    const sp = clamp(car.speed / 540, 0, 1);
    let heatGain = sp * 0.08;
    if (input.drift && car.speed > 170) heatGain += 0.10;

    // Near-miss traffic boosts heat.
    for (const t of state.ai) {
      const dx = (t.x + state.roadCenterX) - car.x;
      const dy = t.y - car.y;
      if (dx * dx + dy * dy < (82 * 82)) {
        heatGain += 0.08;
        break;
      }
    }

    // Heat ramps within level; levels 0..3
    const decay = 0.025;
    const v = clamp(state.heat.value + dt * (heatGain - decay), 0, 1);
    state.heat.value = v;
    if (state.heat.value >= 1 && state.heat.level < 3) {
      state.heat.level += 1;
      state.heat.value = 0.15;
      setToast(`Heat ${state.heat.level}!`);
      audio.playSfx("boost");
    }
  } else {
    state.heat.level = 0;
    state.heat.value = 0;
  }

  // Particles: drift sparks + nitro smoke
  if (input.drift && car.speed > 150) {
    const count = 2 + Math.floor(Math.abs(input.steer) * 3);
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x: car.x + (Math.random() * 2 - 1) * 14,
        y: car.y + 28 + Math.random() * 10,
        vx: (Math.random() * 2 - 1) * 30,
        vy: 120 + Math.random() * 80,
        life: 0.35 + Math.random() * 0.25,
        kind: "spark",
      });
    }
  }
  const nitroNow = input.nitro && car.nitro > 0.02;
  const boostNow = car.boostTimer > 0;
  if ((nitroNow || boostNow) && car.speed > 120) {
    state.particles.push({
      x: car.x + (Math.random() * 2 - 1) * 10,
      y: car.y + 48 + Math.random() * 10,
      vx: (Math.random() * 2 - 1) * 20,
      vy: 220 + Math.random() * 120,
      life: 0.45 + Math.random() * 0.35,
      kind: boostNow ? "glow" : "smoke",
    });
  }

  // Update particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.86, dt * 60);
    p.vy *= Math.pow(0.92, dt * 60);
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  // Ghost recording (for daily mode)
  if (state.mode === "daily" && state.ghostOn) {
    // Sample at ~20 Hz
    const last = state.ghost.rec[state.ghost.rec.length - 1];
    if (!last || (state.time - last.t) >= 0.05) {
      state.ghost.rec.push({ t: state.time, x: car.x, y: car.y, a: car.a });
      // limit memory
      if (state.ghost.rec.length > 9000) state.ghost.rec.shift();
    }
  }

  // Scroll pickups/AI ahead of the player.
  const leadY = car.y - 1200;
  const rnd = state.mode === "daily" && state.daily.rnd ? state.daily.rnd : Math.random;
  const heat = state.heat.level;
  for (const p of state.pickups) {
    if (p.y > car.y + 260) {
      p.y = leadY - rnd() * 1200;
      const hazardRate = 0.18 + heat * 0.05; // more hazards at higher heat
      p.kind = rnd() < hazardRate ? "hazard" : "orb";
      p.x = (rnd() * 2 - 1) * (state.roadW * 0.33);
    }
  }
  for (const a of state.ai) {
    if (a.y > car.y + 520) {
      a.y = leadY - 400 - rnd() * 1200;
      a.x = (rnd() * 2 - 1) * (state.roadW * 0.22);
      a.v = 120 + rnd() * (80 + heat * 20);
      a.seed = rnd() * 10_000;
    }
    // AI moves forward (negative y) but with gentle lane sway.
    a.y -= a.v * dt;
    a.x += Math.sin((state.time * 0.8) + a.seed) * dt * 18;
  }

  // Collisions (simple circles).
  for (const p of state.pickups) {
    const dx = (p.x + state.roadCenterX) - car.x;
    const dy = p.y - car.y;
    const r = p.kind === "hazard" ? 28 : 22;
    if (dx * dx + dy * dy < (r + 22) * (r + 22)) {
      if (p.kind === "orb") {
        state.score += 6.5;
        car.nitro = Math.min(1, car.nitro + 0.22);
        state.vibe = Math.min(1, state.vibe + 0.18);
        setToast("Nitro orb + score!");
        audio.playSfx("orb");
      } else {
        state.hazardHits += 1;
        state.score = Math.max(0, state.score - 8);
        car.vx *= 0.55;
        car.vy *= 0.55;
        car.nitro = Math.max(0, car.nitro - 0.22);
        state.shake = Math.min(1, state.shake + 0.6);
        setToast(`Hit obstacle! (${state.hazardHits}/5)`);
        audio.playSfx("hazard");

        if (state.hazardHits >= 5) {
          state.gameOver = true;
          state.paused = false;
          state.shake = Math.min(1, state.shake + 0.9);
          setToast("Wrecked! Press R to retry.");
          audio.playSfx("busted");
        }
      }
      p.y = car.y - 1600 - Math.random() * 1400;
      p.x = (Math.random() * 2 - 1) * (state.roadW * 0.33);
      p.kind = Math.random() < 0.2 ? "hazard" : "orb";
    }
  }

  for (const a of state.ai) {
    const dx = (a.x + state.roadCenterX) - car.x;
    const dy = a.y - car.y;
    if (dx * dx + dy * dy < (26 + 24) * (26 + 24)) {
      // Bump.
      const push = 220;
      car.vx += (dx > 0 ? -1 : 1) * push * dt;
      car.vy += 90 * dt;
      state.shake = Math.min(1, state.shake + 0.7);
      state.score = Math.max(0, state.score - 4);
      setToast("Traffic bump!");
      a.y = car.y - 1700 - Math.random() * 900;
    }
  }

  state.shake = Math.max(0, state.shake - dt * 1.8);
  state.vibe = Math.max(0, state.vibe - dt * 0.45);
}

function draw() {
  resizeCanvasToDisplaySize();
  const w = canvas.width;
  const h = canvas.height;

  const car = state.car;
  let camX = car.x;
  let camY = car.y;
  if (state.mode === "1v1") {
    camX = (state.car.x + state.car2.x) / 2;
    camY = (state.car.y + state.car2.y) / 2;
  }

  const shakeX = (Math.random() * 2 - 1) * state.shake * 9;
  const shakeY = (Math.random() * 2 - 1) * state.shake * 7;

  // Low graphics path: draw directly to the main canvas (no bloom/grain/extra work).
  if (state.graphics === "low") {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#070812";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.3, h * 0.25, 20, w * 0.3, h * 0.25, Math.max(w, h));
    g.addColorStop(0, "rgba(30,240,255,0.07)");
    g.addColorStop(0.35, "rgba(255,59,212,0.05)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.translate(shakeX, shakeY);
    ctx.translate(w / 2, h / 2);
    ctx.translate(-camX, -camY);

    drawRoad(w, h, camX, camY, ctx);
    drawPickups(ctx);
    drawAi(ctx);
    if (state.mode === "bot" && state.botCar.active) drawBotCar(ctx);
    if (state.mode === "1v1") drawCar2(ctx);
    drawCar(ctx);
    if (state.mode === "police" && state.police.active) drawPolice(ctx);
    drawSpeedStreaks(ctx, camX, camY);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawHud(w, h);
    ctx.restore();
    return;
  }

  // Render scene to offscreen first (lets us bloom/glow cheaply).
  sceneCtx.save();
  sceneCtx.setTransform(1, 0, 0, 1, 0, 0);
  sceneCtx.clearRect(0, 0, w, h);

  // Background
  sceneCtx.fillStyle = "#070812";
  sceneCtx.fillRect(0, 0, w, h);
  const g = sceneCtx.createRadialGradient(w * 0.3, h * 0.25, 20, w * 0.3, h * 0.25, Math.max(w, h));
  g.addColorStop(0, "rgba(30,240,255,0.09)");
  g.addColorStop(0.35, "rgba(255,59,212,0.07)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  sceneCtx.fillStyle = g;
  sceneCtx.fillRect(0, 0, w, h);

  // World transform
  sceneCtx.translate(shakeX, shakeY);
  sceneCtx.translate(w / 2, h / 2);
  sceneCtx.translate(-camX, -camY);

  // Draw world
  drawRoad(w, h, camX, camY, sceneCtx);
  drawPickups(sceneCtx);
  drawAi(sceneCtx);
  drawParticles(sceneCtx);
  if (state.mode === "daily" && state.ghostOn) drawGhost(sceneCtx);
  if (state.mode === "bot" && state.botCar.active) drawBotCar(sceneCtx);
  if (state.mode === "1v1") drawCar2(sceneCtx);
  drawCar(sceneCtx);
  if (state.mode === "police" && state.police.active) drawPolice(sceneCtx);

  // Speed streaks (world-space)
  drawSpeedStreaks(sceneCtx, camX, camY);

  sceneCtx.restore();

  // Compose to main canvas with bloom/glow.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(sceneCanvas, 0, 0);

  // Bloom pass: downsample + blur + screen blend
  const gw = glowCanvas.width;
  const gh = glowCanvas.height;
  glowCtx.save();
  glowCtx.setTransform(1, 0, 0, 1, 0, 0);
  glowCtx.clearRect(0, 0, gw, gh);
  glowCtx.drawImage(sceneCanvas, 0, 0, gw, gh);
  glowCtx.globalCompositeOperation = "source-in";
  glowCtx.fillStyle = "rgba(255,255,255,0.92)";
  glowCtx.fillRect(0, 0, gw, gh);
  glowCtx.globalCompositeOperation = "source-over";
  glowCtx.filter = "blur(10px) saturate(1.2)";
  glowCtx.drawImage(glowCanvas, 0, 0);
  glowCtx.filter = "none";
  glowCtx.restore();

  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.55 + clamp(state.vibe, 0, 1) * 0.25;
  ctx.drawImage(glowCanvas, 0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // Vignette
  const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, Math.min(w, h) * 0.25, w * 0.5, h * 0.55, Math.max(w, h) * 0.62);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // Subtle film grain
  drawGrain(ctx, w, h);

  // HUD on top
  drawHud(w, h);
  ctx.restore();
}

function drawGhost(ctx2) {
  if (!state.ghost.playing || !state.ghost.play?.length) return;
  const t = state.time;
  const arr = state.ghost.play;
  // Find segment (linear scan backwards is ok at this size)
  let i = arr.length - 1;
  while (i > 0 && arr[i].t > t) i--;
  const a = arr[i];
  const b = arr[Math.min(arr.length - 1, i + 1)];
  if (!a || !b) return;
  const span = Math.max(0.0001, b.t - a.t);
  const u = clamp((t - a.t) / span, 0, 1);
  const gx = lerp(a.x, b.x, u);
  const gy = lerp(a.y, b.y, u);
  const ga = lerp(a.a, b.a, u);

  drawSupercar(
    { ...state.car, x: gx, y: gy, a: ga, boostTimer: 0 },
    {
      paintStops: [
        [0, "rgba(30,240,255,0.45)"],
        [0.5, "rgba(255,59,212,0.30)"],
        [1, "rgba(0,0,0,0.10)"],
      ],
      accent: "rgba(255,255,255,0.10)",
      hasStripe: false,
      badge: null,
    },
    { nitroTrail: false, drifting: false, alpha: 0.55 },
    ctx2
  );
}

function drawParticles(ctx2) {
  if (state.graphics !== "high") return;
  for (const p of state.particles) {
    ctx2.save();
    ctx2.translate(p.x, p.y);
    if (p.kind === "spark") {
      ctx2.globalAlpha = clamp(p.life * 2.4, 0, 1);
      ctx2.fillStyle = Math.random() < 0.5 ? "rgba(255,207,51,0.95)" : "rgba(30,240,255,0.75)";
      ctx2.fillRect(-1, -1, 2, 2);
      ctx2.fillRect(2, 0, 1, 1);
    } else if (p.kind === "glow") {
      ctx2.globalAlpha = clamp(p.life * 1.6, 0, 1);
      const g = ctx2.createRadialGradient(0, 0, 0, 0, 0, 26);
      g.addColorStop(0, "rgba(255,59,212,0.24)");
      g.addColorStop(0.5, "rgba(30,240,255,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx2.fillStyle = g;
      ctx2.beginPath();
      ctx2.arc(0, 0, 26, 0, Math.PI * 2);
      ctx2.fill();
    } else {
      ctx2.globalAlpha = clamp(p.life * 1.4, 0, 1) * 0.65;
      const g = ctx2.createRadialGradient(0, 0, 2, 0, 0, 24);
      g.addColorStop(0, "rgba(83,255,122,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx2.fillStyle = g;
      ctx2.beginPath();
      ctx2.arc(0, 0, 24, 0, Math.PI * 2);
      ctx2.fill();
    }
    ctx2.restore();
  }
}

function drawCar2(ctx2) {
  drawSupercar(state.car2, {
    paintStops: [
      [0, "rgba(160,200,255,0.92)"],
      [0.3, "rgba(60,120,255,0.92)"],
      [0.75, "rgba(18,40,120,0.92)"],
      [1, "rgba(18,18,28,0.92)"],
    ],
    accent: "rgba(30,240,255,0.16)",
    hasStripe: false,
    badge: null,
  }, { nitroTrail: false, drifting: false, alpha: 0.94 }, ctx2);
}

function drawBotCar(ctx2) {
  drawSupercar(state.botCar, {
    paintStops: [
      [0, "rgba(255,220,90,0.92)"],
      [0.35, "rgba(235,140,30,0.92)"],
      [0.8, "rgba(140,70,10,0.92)"],
      [1, "rgba(18,18,28,0.92)"],
    ],
    accent: "rgba(255,255,255,0.12)",
    hasStripe: false,
    badge: null,
  }, { nitroTrail: false, drifting: false, alpha: 0.9 }, ctx2);
}

function drawPolice(ctx2) {
  const p = state.police;
  ctx2.save();
  ctx2.translate(p.x, p.y);
  ctx2.rotate(p.a + Math.PI / 2);

  // Shadow
  ctx2.fillStyle = "rgba(0,0,0,0.32)";
  ctx2.beginPath();
  ctx2.ellipse(0, 18, 36, 16, 0, 0, Math.PI * 2);
  ctx2.fill();

  // Body
  const body = ctx2.createLinearGradient(-26, -42, 26, 54);
  body.addColorStop(0, "rgba(245,248,255,0.92)");
  body.addColorStop(0.55, "rgba(120,130,160,0.92)");
  body.addColorStop(1, "rgba(25,28,44,0.92)");
  ctx2.fillStyle = body;
  ctx2.beginPath();
  ctx2.moveTo(0, -42);
  ctx2.quadraticCurveTo(20, -38, 28, -26);
  ctx2.quadraticCurveTo(32, -8, 28, 10);
  ctx2.quadraticCurveTo(22, 42, 0, 52);
  ctx2.quadraticCurveTo(-22, 42, -28, 10);
  ctx2.quadraticCurveTo(-32, -8, -28, -26);
  ctx2.quadraticCurveTo(-20, -38, 0, -42);
  ctx2.closePath();
  ctx2.fill();

  // Lightbar
  ctx2.fillStyle = "rgba(0,0,0,0.25)";
  roundRect(ctx2, -18, -10, 36, 10, 4);
  ctx2.fill();
  ctx2.fillStyle = "rgba(30,240,255,0.45)";
  roundRect(ctx2, -17, -9, 17, 8, 3);
  ctx2.fill();
  ctx2.fillStyle = "rgba(255,59,79,0.45)";
  roundRect(ctx2, 0, -9, 17, 8, 3);
  ctx2.fill();

  // Outline
  ctx2.strokeStyle = "rgba(255,255,255,0.20)";
  ctx2.lineWidth = 2;
  ctx2.stroke();

  ctx2.restore();
}

function drawSupercar(car, style, fx, ctx2) {
  const nitroTrail = !!fx?.nitroTrail;
  const drifting = !!fx?.drifting;
  const alpha = fx?.alpha ?? 1;

  ctx2.save();
  ctx2.globalAlpha = alpha;
  ctx2.translate(car.x, car.y);
  ctx2.rotate(car.a + Math.PI / 2);

  const boostOn = car.boostTimer > 0;

  // Shadow + subtle ground glow
  ctx2.fillStyle = "rgba(0,0,0,0.32)";
  ctx2.beginPath();
  ctx2.ellipse(0, 18, 34, 16, 0, 0, Math.PI * 2);
  ctx2.fill();

  const ground = ctx2.createRadialGradient(0, 18, 6, 0, 18, 56);
  ground.addColorStop(0, "rgba(30,240,255,0.09)");
  ground.addColorStop(0.5, drifting ? "rgba(255,207,51,0.07)" : "rgba(255,59,212,0.05)");
  ground.addColorStop(1, "rgba(0,0,0,0)");
  ctx2.fillStyle = ground;
  ctx2.beginPath();
  ctx2.ellipse(0, 18, 56, 26, 0, 0, Math.PI * 2);
  ctx2.fill();

  // Exhaust trail
  if (nitroTrail || boostOn) {
    const trail = ctx2.createRadialGradient(0, 56, 2, 0, 56, 52);
    trail.addColorStop(0, boostOn ? "rgba(255,59,212,0.18)" : "rgba(83,255,122,0.18)");
    trail.addColorStop(0.55, "rgba(30,240,255,0.08)");
    trail.addColorStop(1, "rgba(0,0,0,0)");
    ctx2.fillStyle = trail;
    ctx2.beginPath();
    ctx2.ellipse(0, 60, 22, 52, 0, 0, Math.PI * 2);
    ctx2.fill();
  }

  // Wheels
  const wheelFrontY = -18;
  const wheelRearY = 22;
  const wheelX = 22;
  for (const wy of [wheelFrontY, wheelRearY]) {
    ctx2.fillStyle = "rgba(0,0,0,0.62)";
    ctx2.beginPath();
    ctx2.ellipse(-wheelX, wy, 8.5, 12, 0.06, 0, Math.PI * 2);
    ctx2.ellipse(wheelX, wy, 8.5, 12, -0.06, 0, Math.PI * 2);
    ctx2.fill();

    ctx2.fillStyle = "rgba(255,255,255,0.10)";
    ctx2.beginPath();
    ctx2.ellipse(-wheelX, wy, 5.5, 8, 0.06, 0, Math.PI * 2);
    ctx2.ellipse(wheelX, wy, 5.5, 8, -0.06, 0, Math.PI * 2);
    ctx2.fill();
  }

  // Body silhouette
  const paint = ctx2.createLinearGradient(-28, -44, 28, 54);
  for (const [t, col] of style.paintStops) paint.addColorStop(t, col);
  ctx2.fillStyle = paint;
  ctx2.beginPath();
  ctx2.moveTo(0, -42);
  ctx2.quadraticCurveTo(18, -40, 26, -28);
  ctx2.quadraticCurveTo(30, -14, 28, -2);
  ctx2.quadraticCurveTo(26, 18, 30, 30);
  ctx2.quadraticCurveTo(24, 48, 0, 52);
  ctx2.quadraticCurveTo(-24, 48, -30, 30);
  ctx2.quadraticCurveTo(-26, 18, -28, -2);
  ctx2.quadraticCurveTo(-30, -14, -26, -28);
  ctx2.quadraticCurveTo(-18, -40, 0, -42);
  ctx2.closePath();
  ctx2.fill();

  // Glass
  const glass = ctx2.createLinearGradient(-14, -20, 14, 14);
  glass.addColorStop(0, "rgba(0,0,0,0.55)");
  glass.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx2.fillStyle = glass;
  roundRect(ctx2, -14, -24, 28, 34, 12);
  ctx2.fill();

  // Stripe
  if (style.hasStripe) {
    ctx2.save();
    ctx2.globalAlpha = 0.9;
    const stripe1 = ctx2.createLinearGradient(0, -44, 0, 54);
    stripe1.addColorStop(0, "rgba(255,255,255,0.18)");
    stripe1.addColorStop(0.5, "rgba(255,255,255,0.05)");
    stripe1.addColorStop(1, "rgba(255,255,255,0.00)");
    ctx2.fillStyle = stripe1;
    if (ctx2.roundRect) ctx2.roundRect(-5.5, -40, 11, 90, 8);
    else roundRect(ctx2, -5.5, -40, 11, 90, 8);
    ctx2.fill();
    ctx2.restore();
  }

  // Lights
  ctx2.fillStyle = "rgba(255,255,255,0.55)";
  ctx2.fillRect(-18, -34, 10, 3);
  ctx2.fillRect(8, -34, 10, 3);
  ctx2.save();
  ctx2.translate(0, 45.5);
  ctx2.fillStyle = "rgba(255,59,79,0.55)";
  for (const x of [-12, 12]) {
    ctx2.beginPath();
    ctx2.arc(x, 0, 4.2, 0, Math.PI * 2);
    ctx2.fill();
  }
  ctx2.restore();

  // Badge
  if (style.badge === "ferrari") {
    ctx2.fillStyle = "rgba(255,210,60,0.75)";
    ctx2.beginPath();
    ctx2.arc(-10.5, -6, 2.4, 0, Math.PI * 2);
    ctx2.fill();
  }

  // Outline
  ctx2.strokeStyle = "rgba(255,255,255,0.22)";
  ctx2.lineWidth = 2;
  ctx2.stroke();
  ctx2.strokeStyle = drifting ? "rgba(255,207,51,0.18)" : style.accent;
  ctx2.lineWidth = 1;
  ctx2.stroke();

  // Sparks
  if (drifting) {
    const sparks = 10;
    for (let i = 0; i < sparks; i++) {
      ctx2.fillStyle = i % 2 === 0 ? "rgba(255,207,51,0.88)" : "rgba(30,240,255,0.65)";
      const sx = (Math.random() * 2 - 1) * 24;
      const sy = 28 + Math.random() * 20;
      ctx2.fillRect(sx, sy, 2, 2);
    }
  }

  ctx2.restore();
}

function drawRoad(w, h, camX, camY, ctx2) {
  const half = state.roadW / 2;
  const cx = state.roadCenterX;

  // Draw a tall slab around camera.
  const top = camY - h;
  const bottom = camY + h;

  // Asphalt
  ctx2.fillStyle = "rgba(10, 12, 26, 0.92)";
  ctx2.fillRect(cx - half, top, state.roadW, bottom - top);

  if (state.graphics === "high") {
    // Asphalt texture (fast procedural speckles + faint streaks)
    const texStepY = 18;
    const texStepX = 26;
    ctx2.globalAlpha = 0.35;
    for (let y = Math.floor(top / texStepY) * texStepY; y < bottom; y += texStepY) {
      const row = Math.sin(y * 0.07) * 0.5 + 0.5;
      for (let x = cx - half + 10; x < cx + half - 10; x += texStepX) {
        const n = (Math.sin((x * 12.9898 + y * 78.233) * 0.017) * 43758.5453) % 1;
        const a = 0.04 + Math.abs(n) * 0.08;
        ctx2.fillStyle = `rgba(255,255,255,${a})`;
        ctx2.fillRect(x + (row * 3), y, 2, 1);
      }
    }
    ctx2.globalAlpha = 1;
  }

  if (state.graphics === "high") {
    // Side city silhouettes (simple neon buildings)
    const cityStep = 120;
    for (let y = Math.floor((top - 200) / cityStep) * cityStep; y < bottom + 260; y += cityStep) {
      const n = (Math.sin((y * 0.03) * 12.9898) * 43758.5453) % 1;
      const bw = 52 + Math.abs(n) * 90;
      const bh = 90 + Math.abs(Math.sin(y * 0.02)) * 180;
      const inset = 36 + Math.abs(Math.sin(y * 0.015)) * 60;
      const leftX = cx - half - inset - bw;
      const rightX = cx + half + inset;
      const baseY = y + 10;
      const grad = ctx2.createLinearGradient(0, baseY - bh, 0, baseY + 10);
      grad.addColorStop(0, "rgba(25,18,60,0.70)");
      grad.addColorStop(1, "rgba(6,6,18,0.10)");
      ctx2.fillStyle = grad;
      ctx2.fillRect(leftX, baseY - bh, bw, bh);
      ctx2.fillRect(rightX, baseY - bh, bw, bh);

      // Neon window strip
      ctx2.globalAlpha = 0.45;
      ctx2.fillStyle = Math.abs(n) > 0.5 ? "rgba(30,240,255,0.22)" : "rgba(255,59,212,0.18)";
      ctx2.fillRect(leftX + 6, baseY - bh + 14, bw - 12, 3);
      ctx2.fillRect(rightX + 6, baseY - bh + 26, bw - 12, 3);
      ctx2.globalAlpha = 1;
    }
  }

  // Side glow rails.
  const railGlow = ctx2.createLinearGradient(cx - half, 0, cx + half, 0);
  railGlow.addColorStop(0, "rgba(30,240,255,0.55)");
  railGlow.addColorStop(0.12, "rgba(30,240,255,0)");
  railGlow.addColorStop(0.88, "rgba(255,59,212,0)");
  railGlow.addColorStop(1, "rgba(255,59,212,0.55)");
  ctx2.fillStyle = railGlow;
  ctx2.fillRect(cx - half - 6, top, state.roadW + 12, bottom - top);

  // Edge lines.
  ctx2.strokeStyle = "rgba(255,255,255,0.18)";
  ctx2.lineWidth = 2;
  ctx2.beginPath();
  ctx2.moveTo(cx - half, top);
  ctx2.lineTo(cx - half, bottom);
  ctx2.moveTo(cx + half, top);
  ctx2.lineTo(cx + half, bottom);
  ctx2.stroke();

  // Lane dashes.
  ctx2.strokeStyle = "rgba(255,255,255,0.14)";
  ctx2.lineWidth = 2;
  const dash = 34;
  const gap = 26;
  const start = Math.floor((top - 500) / (dash + gap)) * (dash + gap);
  for (let y = start; y < bottom + 500; y += dash + gap) {
    const t = (Math.sin((y * 0.006) + state.time * 1.5) * 0.5 + 0.5) * 0.4 + 0.3;
    ctx2.globalAlpha = t;
    ctx2.beginPath();
    ctx2.moveTo(cx, y);
    ctx2.lineTo(cx, y + dash);
    ctx2.stroke();
  }
  ctx2.globalAlpha = 1;

  // Finish line (race modes)
  if (state.race.active) {
    const fy = state.race.finishY;
    if (fy > camY - h && fy < camY + h) {
      const stripeH = 18;
      const x0 = cx - half;
      const y0 = fy - stripeH / 2;
      // Base
      ctx2.fillStyle = "rgba(255,255,255,0.10)";
      ctx2.fillRect(x0, y0, state.roadW, stripeH);
      // Checkers
      const size = 14;
      for (let x = x0; x < x0 + state.roadW; x += size) {
        const i = Math.floor((x - x0) / size);
        ctx2.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.35)";
        ctx2.fillRect(x, y0, size, stripeH);
      }
      // Neon edge
      ctx2.fillStyle = "rgba(30,240,255,0.22)";
      ctx2.fillRect(x0 - 6, y0 - 2, state.roadW + 12, 2);
      ctx2.fillStyle = "rgba(255,59,212,0.18)";
      ctx2.fillRect(x0 - 6, y0 + stripeH, state.roadW + 12, 2);
    }
  }

  // Neon "spray" particles on edges.
  const sprayCount = 50;
  for (let i = 0; i < sprayCount; i++) {
    const sy = top + ((i / sprayCount) * (bottom - top));
    const phase = (i * 0.23 + state.time * 1.4);
    const jitter = Math.sin(phase) * 2.0;
    const leftX = cx - half - 10 + jitter;
    const rightX = cx + half + 10 - jitter;
    ctx2.fillStyle = i % 2 === 0 ? "rgba(30,240,255,0.14)" : "rgba(255,59,212,0.12)";
    ctx2.fillRect(leftX, sy, 4, 1);
    ctx2.fillRect(rightX, sy + 8, 4, 1);
  }
}

function drawPickups(ctx2) {
  for (const p of state.pickups) {
    ctx2.save();
    ctx2.translate(p.x + state.roadCenterX, p.y);
    if (p.kind === "orb") {
      const r = 12;
      const glow = ctx2.createRadialGradient(0, 0, 0, 0, 0, 34);
      glow.addColorStop(0, "rgba(83,255,122,0.85)");
      glow.addColorStop(0.4, "rgba(83,255,122,0.18)");
      glow.addColorStop(1, "rgba(83,255,122,0)");
      ctx2.fillStyle = glow;
      ctx2.beginPath();
      ctx2.arc(0, 0, 34, 0, Math.PI * 2);
      ctx2.fill();

      ctx2.fillStyle = "rgba(255,255,255,0.85)";
      ctx2.beginPath();
      ctx2.arc(0, 0, r, 0, Math.PI * 2);
      ctx2.fill();
    } else {
      const glow = ctx2.createRadialGradient(0, 0, 0, 0, 0, 38);
      glow.addColorStop(0, "rgba(255,59,79,0.85)");
      glow.addColorStop(0.5, "rgba(255,59,79,0.18)");
      glow.addColorStop(1, "rgba(255,59,79,0)");
      ctx2.fillStyle = glow;
      ctx2.beginPath();
      ctx2.arc(0, 0, 40, 0, Math.PI * 2);
      ctx2.fill();

      ctx2.fillStyle = "rgba(255,59,79,0.95)";
      ctx2.beginPath();
      ctx2.moveTo(-16, -14);
      ctx2.lineTo(18, 0);
      ctx2.lineTo(-16, 14);
      ctx2.closePath();
      ctx2.fill();
    }
    ctx2.restore();
  }
}

function drawAi(ctx2) {
  for (const a of state.ai) {
    ctx2.save();
    ctx2.translate(a.x + state.roadCenterX, a.y);
    const wob = Math.sin(state.time * 1.6 + a.seed) * 0.18;
    ctx2.rotate(wob);

    ctx2.fillStyle = "rgba(255,255,255,0.08)";
    ctx2.beginPath();
    ctx2.ellipse(0, 10, 24, 10, 0, 0, Math.PI * 2);
    ctx2.fill();

    const body = ctx2.createLinearGradient(-20, -22, 20, 22);
    body.addColorStop(0, "rgba(30,240,255,0.32)");
    body.addColorStop(1, "rgba(255,59,212,0.22)");
    ctx2.fillStyle = body;
    roundRect(ctx2, -18, -20, 36, 44, 10);
    ctx2.fill();

    ctx2.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx2, -12, -14, 24, 18, 7);
    ctx2.fill();

    ctx2.restore();
  }
}

function drawCar(ctx2) {
  const paintStops =
    state.carColor === "rosso"
      ? [
          [0, "rgba(255,110,120,0.95)"],
          [0.25, "rgba(220,24,48,0.95)"],
          [0.72, "rgba(150,10,28,0.95)"],
          [1, "rgba(40,8,14,0.95)"],
        ]
      : state.carColor === "black"
        ? [
            [0, "rgba(90,92,110,0.95)"],
            [0.35, "rgba(38,40,52,0.95)"],
            [0.78, "rgba(18,18,26,0.95)"],
            [1, "rgba(6,6,10,0.95)"],
          ]
        : state.carColor === "white"
          ? [
              [0, "rgba(255,255,255,0.95)"],
              [0.32, "rgba(210,214,228,0.95)"],
              [0.78, "rgba(130,138,168,0.95)"],
              [1, "rgba(18,18,28,0.95)"],
            ]
          : [
              [0, "rgba(255,246,155,0.95)"],
              [0.32, "rgba(255,205,60,0.95)"],
              [0.78, "rgba(190,130,22,0.95)"],
              [1, "rgba(40,20,6,0.95)"],
            ];

  drawSupercar(
    state.car,
    {
      paintStops,
      accent: "rgba(30,240,255,0.12)",
      hasStripe: state.carStripe,
      badge: "ferrari",
    },
    {
      nitroTrail: (input.nitro && state.car.nitro > 0.02) || state.car.boostTimer > 0,
      drifting: input.drift && state.car.speed > 110,
      alpha: 1,
    },
    ctx2
  );
}

function drawHud(w, h) {
  const car = state.car;
  const speedKmh = Math.round((car.speed / 520) * 320);

  // HUD glass.
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  roundRect(ctx, 14, 14, 310, 88, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  roundRect(ctx, 14, 14, 310, 88, 18);
  ctx.stroke();

  ctx.fillStyle = "rgba(238,241,255,0.92)";
  ctx.font = "900 18px ui-sans-serif, system-ui";
  ctx.fillText(`${speedKmh} km/h`, 28, 44);

  ctx.fillStyle = "rgba(238,241,255,0.75)";
  ctx.font = "700 12px ui-sans-serif, system-ui";
  ctx.fillText(`Score  ${Math.floor(state.score)}`, 28, 64);
  ctx.fillText(`Time   ${state.time.toFixed(1)}s`, 28, 82);
  const hp = Math.max(0, 5 - state.hazardHits);
  ctx.fillText(`HP     ${hp}/5`, 172, 44);
  ctx.fillText(`Mode   ${state.mode.toUpperCase()}`, 172, 64);

  if (state.mode === "bot" && state.botCar.active) {
    const lead = Math.round((state.botCar.y - state.car.y) * 0.1); // + means player ahead
    const label = lead >= 0 ? `You +${lead}m` : `Bot +${Math.abs(lead)}m`;
    ctx.fillText(`Race   ${label}`, 172, 82);
    ctx.fillText(`Bot    ${state.botDifficulty.toUpperCase()}`, 172, 100);
  }

  if (state.mode === "1v1") {
    const lead = Math.round((state.car2.y - state.car.y) * 0.1);
    const label = lead >= 0 ? `P1 +${lead}m` : `P2 +${Math.abs(lead)}m`;
    ctx.fillText(`Race   ${label}`, 172, 82);
  }

  if (state.race.active) {
    const total = Math.max(1, state.race.startY - state.race.finishY);
    const done = clamp((state.race.startY - state.car.y) / total, 0, 1);
    const px = 14;
    const py = 112;
    const pw = 310;
    const ph = 10;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(ctx, px, py, pw, ph, 999);
    ctx.fill();
    const fill = Math.floor(pw * done);
    const grad = ctx.createLinearGradient(px, 0, px + pw, 0);
    grad.addColorStop(0, "rgba(30,240,255,0.85)");
    grad.addColorStop(1, "rgba(255,59,212,0.85)");
    ctx.fillStyle = grad;
    roundRect(ctx, px, py, fill, ph, 999);
    ctx.fill();
    ctx.fillStyle = "rgba(238,241,255,0.75)";
    ctx.font = "800 11px ui-sans-serif, system-ui";
    ctx.fillText("FINISH", px + 8, py - 6);
  }

  // Nitro bar.
  const bx = 172;
  const by = 54;
  const bw = 130;
  const bh = 10;
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  roundRect(ctx, bx, by, bw, bh, 999);
  ctx.fill();

  const fillW = Math.floor(bw * car.nitro);
  const nitroGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  nitroGrad.addColorStop(0, "rgba(83,255,122,0.92)");
  nitroGrad.addColorStop(1, "rgba(30,240,255,0.92)");
  ctx.fillStyle = nitroGrad;
  roundRect(ctx, bx, by, fillW, bh, 999);
  ctx.fill();

  ctx.fillStyle = "rgba(238,241,255,0.7)";
  ctx.font = "800 11px ui-sans-serif, system-ui";
  ctx.fillText("NITRO", bx, by - 6);

  // Drift charge / boost indicator.
  const dx = 172;
  const dy = 78;
  const dw = 130;
  const dh = 10;
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  roundRect(ctx, dx, dy, dw, dh, 999);
  ctx.fill();
  const driftFill = Math.floor(dw * clamp(car.driftCharge, 0, 1));
  const driftGrad = ctx.createLinearGradient(dx, 0, dx + dw, 0);
  driftGrad.addColorStop(0, "rgba(255,207,51,0.92)");
  driftGrad.addColorStop(1, "rgba(255,59,212,0.82)");
  ctx.fillStyle = driftGrad;
  roundRect(ctx, dx, dy, driftFill, dh, 999);
  ctx.fill();
  ctx.fillStyle = "rgba(238,241,255,0.7)";
  ctx.font = "800 11px ui-sans-serif, system-ui";
  ctx.fillText(car.boostTimer > 0 ? "BOOST" : "DRIFT", dx, dy - 6);

  // Drift indicator
  if (input.drift) {
    ctx.fillStyle = "rgba(255,207,51,0.92)";
    ctx.fillText("DRIFT", 256, 82);
  }

  // Police busted meter
  if (state.mode === "police" && state.police.active) {
    const bx2 = 14;
    const by2 = 112;
    const bw2 = 310;
    const bh2 = 12;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(ctx, bx2, by2, bw2, bh2, 999);
    ctx.fill();
    const fill = Math.floor(bw2 * clamp(state.police.busted, 0, 1));
    const grad = ctx.createLinearGradient(bx2, 0, bx2 + bw2, 0);
    grad.addColorStop(0, "rgba(255,207,51,0.88)");
    grad.addColorStop(1, "rgba(255,59,79,0.88)");
    ctx.fillStyle = grad;
    roundRect(ctx, bx2, by2, fill, bh2, 999);
    ctx.fill();
    ctx.fillStyle = "rgba(238,241,255,0.75)";
    ctx.font = "800 11px ui-sans-serif, system-ui";
    ctx.fillText("BUSTED", bx2 + 8, by2 - 6);
  }

  // Heat meter (non-solo)
  if (state.mode !== "solo") {
    const hx = 14;
    const hy = state.mode === "police" && state.police.active ? 140 : 112;
    const hw = 310;
    const hh = 10;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(ctx, hx, hy, hw, hh, 999);
    ctx.fill();
    const fill = Math.floor(hw * clamp(state.heat.value, 0, 1));
    const grad = ctx.createLinearGradient(hx, 0, hx + hw, 0);
    grad.addColorStop(0, "rgba(83,255,122,0.75)");
    grad.addColorStop(0.5, "rgba(255,207,51,0.80)");
    grad.addColorStop(1, "rgba(255,59,79,0.82)");
    ctx.fillStyle = grad;
    roundRect(ctx, hx, hy, fill, hh, 999);
    ctx.fill();
    ctx.fillStyle = "rgba(238,241,255,0.75)";
    ctx.font = "800 11px ui-sans-serif, system-ui";
    ctx.fillText(`HEAT ${state.heat.level}`, hx + 8, hy - 6);
  }

  // Pause overlay.
  if (state.paused) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(238,241,255,0.95)";
    ctx.font = "900 26px ui-sans-serif, system-ui";
    ctx.fillText("PAUSED", w / 2 - 60, h / 2 - 10);
    ctx.fillStyle = "rgba(238,241,255,0.75)";
    ctx.font = "700 14px ui-sans-serif, system-ui";
    ctx.fillText("Press Esc to resume", w / 2 - 76, h / 2 + 18);
  }

  // Game over overlay.
  if (state.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.68)";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(238,241,255,0.96)";
    ctx.font = "900 30px ui-sans-serif, system-ui";
    ctx.fillText("WRECKED", w / 2 - 78, h / 2 - 24);

    ctx.fillStyle = "rgba(238,241,255,0.78)";
    ctx.font = "700 14px ui-sans-serif, system-ui";
    ctx.fillText("Press R (or Enter) to retry", w / 2 - 112, h / 2 + 6);

    ctx.fillStyle = "rgba(238,241,255,0.70)";
    ctx.font = "700 13px ui-sans-serif, system-ui";
    ctx.fillText(`Final score: ${Math.floor(state.score)}`, w / 2 - 62, h / 2 + 28);
  }

  // Race finished overlay.
  if (state.race.finished) {
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(238,241,255,0.96)";
    ctx.font = "900 30px ui-sans-serif, system-ui";
    ctx.fillText("FINISH", w / 2 - 52, h / 2 - 24);

    ctx.fillStyle = "rgba(238,241,255,0.80)";
    ctx.font = "800 16px ui-sans-serif, system-ui";
    ctx.fillText(`Winner: ${state.race.winner}`, w / 2 - 68, h / 2 + 2);

    ctx.fillStyle = "rgba(238,241,255,0.75)";
    ctx.font = "700 14px ui-sans-serif, system-ui";
    ctx.fillText("Press R (or Enter) to race again", w / 2 - 122, h / 2 + 28);
  }

  ctx.restore();
}

function roundRect(ctx2, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx2.beginPath();
  ctx2.moveTo(x + rr, y);
  ctx2.arcTo(x + w, y, x + w, y + h, rr);
  ctx2.arcTo(x + w, y + h, x, y + h, rr);
  ctx2.arcTo(x, y + h, x, y, rr);
  ctx2.arcTo(x, y, x + w, y, rr);
  ctx2.closePath();
}

function drawSpeedStreaks(ctx2, camX, camY) {
  const sp = clamp(state.car.speed / 540, 0, 1);
  if (sp < 0.35) return;

  const count = Math.floor(16 + sp * 40);
  const spreadX = state.roadW * 0.75;
  const spreadY = 680;
  ctx2.save();
  ctx2.globalAlpha = 0.10 + sp * 0.18;
  ctx2.strokeStyle = "rgba(255,255,255,0.35)";
  ctx2.lineWidth = 2;
  for (let i = 0; i < count; i++) {
    const x = camX + (Math.random() * 2 - 1) * spreadX;
    const y = camY + (Math.random() * 2 - 1) * spreadY;
    const len = 30 + Math.random() * 120 * sp;
    ctx2.beginPath();
    ctx2.moveTo(x, y);
    ctx2.lineTo(x, y + len);
    ctx2.stroke();
  }
  ctx2.restore();
}

function drawGrain(ctx2, w, h) {
  if (state.graphics !== "high") return;
  const t = state.time;
  const a = 0.06;
  ctx2.save();
  ctx2.globalAlpha = a;
  ctx2.globalCompositeOperation = "overlay";
  const step = 6;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const n = (Math.sin((x * 12.9898 + y * 78.233 + t * 1200) * 0.017) * 43758.5453) % 1;
      const g = Math.floor(110 + n * 70);
      ctx2.fillStyle = `rgb(${g},${g},${g})`;
      ctx2.fillRect(x, y, 2, 2);
    }
  }
  ctx2.restore();
}

function frame(ms) {
  const dt = Math.min(0.05, Math.max(0.001, (ms - state.lastMs) / 1000));
  state.lastMs = ms;

  if (state.running && !state.paused && !state.gameOver) {
    state.time += dt;
  }

  updateInputs();

  if (!state.running && !menuEl.hidden) {
    const pref = preferredDevice();
    autoDetectPillEl.textContent = `Auto-detect: ${pref.toUpperCase()}`;

    if (state.device === "gamepad") {
      const pads = navigator.getGamepads?.() ?? [];
      const gp = pads.find(Boolean);
      const startPressed = gp?.buttons?.[9]?.pressed ?? false; // Start / Options
      const aPressed = gp?.buttons?.[0]?.pressed ?? false; // A / Cross
      if (startPressed || aPressed) startGame();
    }
  }

  if (state.gameOver) {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = pads.find(Boolean);
    const startPressed = gp?.buttons?.[9]?.pressed ?? false;
    const aPressed = gp?.buttons?.[0]?.pressed ?? false;
    if (startPressed || aPressed) input.restartPressed = true;
  }

  if (input.pausePressed && state.running) {
    if (!state.gameOver) {
      state.paused = !state.paused;
      setToast(state.paused ? "Paused" : "Resumed");
    }
  }

  if (input.restartPressed && state.running) {
    resetGame();
    setToast("Restarted");
  }
  input.pausePressed = false;
  input.restartPressed = false;

  if (!menuEl.hidden && state.device === "gamepad") {
    // Auto-highlight gamepad if a pad becomes visible.
    const hasPad = (navigator.getGamepads?.() ?? []).some(Boolean);
    if (hasPad && state.device !== "gamepad") setDevice("gamepad");
  }

  if (state.running) update(dt);
  draw();

  // Engine sound follows player.
  if (state.running && !state.paused && !state.gameOver && !state.race.finished) {
    audio.tickEngine(state.car.speed, input.throttle);
  } else {
    audio.stopEngine();
  }

  requestAnimationFrame(frame);
}

function init() {
  state.device = loadDevice();
  state.mode = loadMode();
  state.graphics = loadGraphics();
  state.botDifficulty = loadBotDifficulty();
  state.carColor = loadCarColor();
  state.carStripe = loadStripe();
  state.musicOn = loadToggle(STORAGE_MUSIC, true);
  state.sfxOn = loadToggle(STORAGE_SFX, true);
  syncDeviceUI();
  syncModeUI();
  syncGraphicsUI();
  syncBotUI();
  syncCarUI();
  syncAudioUI();
  menuEl.hidden = false;
  state.running = false;
  setToast("Pick a device, then Start.");

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) state.paused = true;
  });

  // Allow starting via gamepad.
  window.addEventListener("gamepadconnected", () => {
    if (!state.running && !menuEl.hidden) setToast("Gamepad ready. Choose Gamepad and press Start.");
  });

  requestAnimationFrame(frame);
}

init();
const audio = (() => {
  /** @type {AudioContext|null} */
  let ac = null;
  /** @type {GainNode|null} */
  let master = null;
  /** @type {GainNode|null} */
  let musicGain = null;
  /** @type {GainNode|null} */
  let sfxGain = null;

  /** @type {OscillatorNode|null} */
  let engineOsc = null;
  /** @type {GainNode|null} */
  let engineGain = null;
  /** @type {BiquadFilterNode|null} */
  let engineFilter = null;

  let musicTimer = 0;
  let musicOn = false;

  function ensure() {
    if (ac) return ac;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(ac.destination);

    musicGain = ac.createGain();
    musicGain.gain.value = 0.35;
    musicGain.connect(master);

    sfxGain = ac.createGain();
    sfxGain.gain.value = 0.7;
    sfxGain.connect(master);

    // Engine
    engineOsc = ac.createOscillator();
    engineOsc.type = "sawtooth";
    engineFilter = ac.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 420;
    engineGain = ac.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(sfxGain);
    engineOsc.start();

    return ac;
  }

  async function resume() {
    const ctx2 = ensure();
    if (!ctx2) return;
    if (ctx2.state === "suspended") {
      try {
        await ctx2.resume();
      } catch {
        // ignore
      }
    }
  }

  function oneShot(type, freq, dur, gain, dest, opts) {
    if (!ac) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = 0;
    osc.connect(g);
    g.connect(dest);
    const t0 = ac.currentTime;
    const a = opts?.attack ?? 0.002;
    const d = dur;
    const r = opts?.release ?? Math.min(0.12, dur * 0.5);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + r);
    osc.start(t0);
    osc.stop(t0 + d + r + 0.02);
  }

  function noiseBurst(dur, gain, dest, color = "white") {
    if (!ac) return;
    const length = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, length, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      data[i] = color === "white" ? w : w * (1 - i / length);
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = color === "white" ? 2800 : 1400;
    f.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    const t0 = ac.currentTime;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function playSfx(name) {
    if (!state.sfxOn) return;
    ensure();
    if (!ac || !sfxGain) return;
    const g = sfxGain;
    if (name === "click") oneShot("triangle", 880, 0.03, 0.12, g, { attack: 0.001, release: 0.05 });
    if (name === "orb") {
      oneShot("sine", 880, 0.06, 0.16, g, { attack: 0.001, release: 0.08 });
      oneShot("sine", 1320, 0.05, 0.12, g, { attack: 0.001, release: 0.08 });
    }
    if (name === "hazard") {
      oneShot("square", 140, 0.08, 0.22, g, { attack: 0.002, release: 0.10 });
      noiseBurst(0.10, 0.10, g);
    }
    if (name === "boost") oneShot("sawtooth", 220, 0.10, 0.18, g, { attack: 0.002, release: 0.10 });
    if (name === "wall") {
      oneShot("square", 90, 0.06, 0.20, g, { attack: 0.001, release: 0.08 });
      noiseBurst(0.06, 0.08, g, "pink");
    }
    if (name === "finish") {
      oneShot("triangle", 660, 0.09, 0.14, g, { attack: 0.002, release: 0.12 });
      oneShot("triangle", 990, 0.12, 0.16, g, { attack: 0.002, release: 0.14 });
      oneShot("triangle", 1320, 0.16, 0.14, g, { attack: 0.002, release: 0.18 });
    }
    if (name === "busted") {
      oneShot("sawtooth", 160, 0.22, 0.18, g, { attack: 0.002, release: 0.24 });
      oneShot("square", 120, 0.26, 0.14, g, { attack: 0.002, release: 0.28 });
    }
  }

  function tickEngine(speed, throttle) {
    if (!state.sfxOn) return;
    ensure();
    if (!ac || !engineOsc || !engineGain || !engineFilter) return;
    const s = clamp(speed / 540, 0, 1);
    const f = 110 + s * 260 + throttle * 50;
    engineOsc.frequency.setTargetAtTime(f, ac.currentTime, 0.03);
    engineFilter.frequency.setTargetAtTime(320 + s * 1200, ac.currentTime, 0.05);
    const targetGain = 0.02 + s * 0.06 + throttle * 0.02;
    engineGain.gain.setTargetAtTime(targetGain, ac.currentTime, 0.06);
  }

  function stopEngine() {
    if (!ac || !engineGain) return;
    engineGain.gain.setTargetAtTime(0, ac.currentTime, 0.08);
  }

  function scheduleMusicStep(t0, rootHz, stepIdx) {
    if (!ac || !musicGain) return;
    // Very simple procedural loop (original, generated): bass + pluck + hat.
    const bass = [0, 0, -3, 0, -5, -3, 0, 2];
    const scale = [0, 3, 5, 7, 10]; // minor pentatonic
    const b = bass[stepIdx % bass.length];
    const note = rootHz * Math.pow(2, b / 12);
    const pluck = rootHz * Math.pow(2, (scale[(stepIdx * 2) % scale.length] + 12) / 12);

    // Bass
    const o1 = ac.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(note, t0);
    const g1 = ac.createGain();
    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.exponentialRampToValueAtTime(0.10, t0 + 0.01);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o1.connect(g1);
    g1.connect(musicGain);
    o1.start(t0);
    o1.stop(t0 + 0.26);

    // Pluck
    const o2 = ac.createOscillator();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(pluck, t0);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.exponentialRampToValueAtTime(0.05, t0 + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    const f2 = ac.createBiquadFilter();
    f2.type = "lowpass";
    f2.frequency.setValueAtTime(1800, t0);
    o2.connect(f2);
    f2.connect(g2);
    g2.connect(musicGain);
    o2.start(t0);
    o2.stop(t0 + 0.18);

    // Hat
    const hatGain = 0.018;
    noiseBurst(0.03, hatGain, musicGain, "white");
  }

  function startMusic() {
    ensure();
    if (!ac || !musicGain) return;
    if (musicOn) return;
    musicOn = true;
    const bpm = 118;
    const step = 60 / bpm / 2; // 8th notes
    let stepIdx = 0;
    const roots = [196, 220, 174, 196]; // G3, A3, F3, G3
    const loopSteps = 16;
    const tick = () => {
      if (!musicOn || !ac) return;
      const t = ac.currentTime + 0.04;
      const root = roots[Math.floor(stepIdx / loopSteps) % roots.length];
      scheduleMusicStep(t, root, stepIdx);
      stepIdx = (stepIdx + 1) % (loopSteps * roots.length);
      musicTimer = window.setTimeout(tick, step * 1000);
    };
    tick();
  }

  function stopMusic() {
    musicOn = false;
    window.clearTimeout(musicTimer);
    musicTimer = 0;
  }

  return { ensure, resume, playSfx, tickEngine, stopEngine, startMusic, stopMusic };
})();
function startGame() {
    if (typeof gameLoop === "function") {
        setInterval(gameLoop, 1000 / 60);
    } else if (typeof draw === "function") {
        setInterval(draw, 1000 / 60);
    }
}

    startGame();
};
