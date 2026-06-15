import { createBattle, teamCounts, updateBattle } from "./simulation.js?v=4";
import {
  CAMERA_LIMITS,
  cameraTransform,
  clampCamera,
  createCamera,
  edgeDirection,
  moveCamera,
  zoomCameraAt,
} from "./camera.js";

const canvas = document.getElementById("battlefield");
const ctx = canvas.getContext("2d");
const loading = document.getElementById("loading");
const allyCount = document.getElementById("ally-count");
const enemyCount = document.getElementById("enemy-count");
const battleMessage = document.getElementById("battle-message");
const pauseButton = document.getElementById("toggle-pause");
const restartButton = document.getElementById("restart");
const zoomLevel = document.getElementById("zoom-level");
const panelUnitCount = document.getElementById("panel-unit-count");
const panelStrength = document.getElementById("panel-strength");
const panelStatus = document.getElementById("panel-status");
const battleResult = document.getElementById("battle-result");
const resultTitle = document.getElementById("result-title");
const resultAllies = document.getElementById("result-allies");
const resultEnemies = document.getElementById("result-enemies");
const resultTime = document.getElementById("result-time");
const resultRestartButton = document.getElementById("result-restart");
const startScreen = document.getElementById("start-screen");
const startButton = document.getElementById("start-battle");

const ASSET_URLS = {
  ally: "./assets/unit/ger1.webp",
  enemy: "./assets/unit/sov1.webp",
  shell: "./assets/effect/tank_gun.webp",
};
const UNIT_SIZE = 128;
const UNIT_HALF_SIZE = UNIT_SIZE / 2;
const SHELL_SIZE = 56;
const SHELL_HALF_SIZE = SHELL_SIZE / 2;
const EXPLOSION_SIZE = 176;
const EXPLOSION_HALF_SIZE = EXPLOSION_SIZE / 2;
const EXPLOSION_FRAME_COUNT = 9;
const HP_BAR_WIDTH = 96;

const state = {
  map: null,
  mapLayer: null,
  images: {},
  explosionFrames: [],
  battle: null,
  terrainMovement: null,
  started: false,
  paused: false,
  lastTime: 0,
  camera: null,
  edgeScroll: { x: 0, y: 0 },
  gestureScale: null,
};

boot().catch(error => {
  console.error(error);
  loading.textContent = `起動エラー: ${error.message}`;
  loading.classList.add("error");
});

async function boot() {
  const [map, images, explosionFrames] = await Promise.all([
    fetchJson("./assets/map/map1.json"),
    loadImages(ASSET_URLS),
    loadExplosionFrames(),
  ]);

  state.map = map;
  state.images = images;
  state.explosionFrames = explosionFrames;
  state.terrainMovement = createTerrainMovement(map);
  state.mapLayer = await buildMapLayer(map);
  state.camera = createCamera(
    map.width * map.tileSize,
    map.height * map.tileSize,
    { scale: initialCameraScale() }
  );
  zoomLevel.textContent = `${Math.round(state.camera.scale * 100)}%`;
  resetBattle({ waitForStart: true });
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("pointermove", updateEdgeScroll);
  window.addEventListener("pointerout", stopEdgeScrollOutsideWindow);
  window.addEventListener("blur", clearEdgeScroll);
  pauseButton.addEventListener("click", togglePause);
  restartButton.addEventListener("click", () => {
    resetBattle({ waitForStart: !state.started });
  });
  resultRestartButton.addEventListener("click", () => resetBattle());
  startButton.addEventListener("click", startBattle);
  window.addEventListener("keydown", handleKeyboard);
  canvas.addEventListener("wheel", zoomWithWheel, { passive: false });
  canvas.addEventListener("gesturestart", startGestureZoom, { passive: false });
  canvas.addEventListener("gesturechange", changeGestureZoom, { passive: false });
  canvas.addEventListener("gestureend", endGestureZoom);
  loading.hidden = true;
  state.lastTime = performance.now();
  requestAnimationFrame(frame);
}

function resetBattle(options = {}) {
  if (!state.map) return;
  state.battle = createBattle({
    width: state.map.width * state.map.tileSize,
    height: state.map.height * state.map.tileSize,
    terrainMovement: state.terrainMovement,
  });
  state.battle.explosions ??= [];
  state.started = !options.waitForStart;
  state.paused = false;
  battleResult.hidden = true;
  startScreen.hidden = state.started;
  syncPauseButton();
  battleMessage.textContent = state.started ? "ENGAGED" : "READY";
  updateHud();
  exposeDebugState();
}

function startBattle() {
  if (state.started) return;
  state.started = true;
  state.lastTime = performance.now();
  startScreen.hidden = true;
  syncPauseButton();
  battleMessage.textContent = "ENGAGED";
  updateHud();
}

function togglePause() {
  if (!state.started || state.battle?.winner) return;
  state.paused = !state.paused;
  syncPauseButton();
  battleMessage.textContent = state.paused ? "PAUSED" : battleLabel();
}

function syncPauseButton() {
  pauseButton.textContent = state.paused ? "RESUME" : "PAUSE";
  pauseButton.disabled = !state.started || Boolean(state.battle?.winner);
  pauseButton.classList.toggle("is-active", state.paused);
  pauseButton.setAttribute("aria-pressed", String(state.paused));
}

function handleKeyboard(event) {
  if (!["Enter", "Space"].includes(event.code) || event.repeat) return;
  if (event.target.matches?.("input, textarea, select, button, [contenteditable='true']")) return;
  event.preventDefault();
  if (!state.started) {
    startBattle();
    return;
  }
  if (event.code !== "Space") return;
  togglePause();
}

function frame(now) {
  const delta = Math.min((now - state.lastTime) / 1000, 0.1);
  state.lastTime = now;
  if (state.started && !state.paused) updateBattle(state.battle, delta);
  updateCamera(delta);
  updateHud();
  render();
  requestAnimationFrame(frame);
}

function render() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const camera = cameraTransform(state.camera, width, height);
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(state.mapLayer, 0, 0);
  drawBattle();
  ctx.restore();
}

function drawBattle() {
  for (const unit of state.battle.units) {
    if (!unit.alive) continue;
    drawUnit(unit);
  }
  for (const shell of state.battle.shells) drawShell(shell);
  for (const explosion of state.battle.explosions ?? []) drawExplosion(explosion);
}

function drawUnit(unit) {
  const image = state.images[unit.team];
  ctx.save();
  ctx.translate(unit.x, unit.y);
  if (unit.facing === "right") ctx.scale(-1, 1);
  ctx.drawImage(image, -UNIT_HALF_SIZE, -UNIT_HALF_SIZE, UNIT_SIZE, UNIT_SIZE);
  ctx.restore();

  const hpRatio = unit.hp / unit.maxHp;
  ctx.fillStyle = "#000000";
  ctx.fillRect(unit.x - HP_BAR_WIDTH / 2 - 2, unit.y - 74, HP_BAR_WIDTH + 4, 12);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(unit.x - HP_BAR_WIDTH / 2 - 1.5, unit.y - 73.5, HP_BAR_WIDTH + 3, 11);
  ctx.fillStyle = unit.team === "ally" ? "#ffffff" : "#db0814";
  ctx.fillRect(unit.x - HP_BAR_WIDTH / 2 + 2, unit.y - 70, (HP_BAR_WIDTH - 4) * hpRatio, 4);
}

function drawShell(shell) {
  ctx.save();
  ctx.translate(shell.x, shell.y);
  ctx.rotate(shell.angle);
  ctx.drawImage(
    state.images.shell,
    -SHELL_HALF_SIZE,
    -SHELL_HALF_SIZE,
    SHELL_SIZE,
    SHELL_SIZE
  );
  ctx.restore();
}

function drawExplosion(explosion) {
  const frameDuration = state.battle.rules.explosionFrameDuration;
  const frameIndex = Math.min(
    state.explosionFrames.length - 1,
    Math.floor(explosion.age / frameDuration)
  );
  const image = state.explosionFrames[frameIndex];
  if (!image) return;
  ctx.drawImage(
    image,
    explosion.x - EXPLOSION_HALF_SIZE,
    explosion.y - EXPLOSION_HALF_SIZE,
    EXPLOSION_SIZE,
    EXPLOSION_SIZE
  );
}

async function buildMapLayer(map) {
  const layer = document.createElement("canvas");
  layer.width = map.width * map.tileSize;
  layer.height = map.height * map.tileSize;
  const layerCtx = layer.getContext("2d", { alpha: false });
  layerCtx.imageSmoothingEnabled = false;

  const terrainNames = [...new Set(
    map.placements.filter(item => item.kind === "terrain").map(item => item.name)
  )];
  const terrainImages = Object.fromEntries(await Promise.all(
    terrainNames.map(async name => [
      name,
      await loadFirstImage([
        `./assets/map/${encodeURIComponent(name)}.webp`,
        `./assets/map/${encodeURIComponent(name)}.png`,
      ]),
    ])
  ));

  const ordered = [...map.placements].sort((a, b) => a.zIndex - b.zIndex);
  for (const placement of ordered) {
    const image = terrainImages[placement.name];
    if (!image) continue;
    layerCtx.drawImage(
      image,
      placement.x * map.tileSize,
      placement.y * map.tileSize,
      placement.width * map.tileSize,
      placement.height * map.tileSize
    );
  }
  return layer;
}

function createTerrainMovement(map) {
  const cells = new Float32Array(map.width * map.height);
  cells.fill(1);
  for (const placement of map.placements) {
    if (placement.kind !== "terrain") continue;
    const multiplier = placement.name === "red" ? 0.5 : 1;
    cells[placement.y * map.width + placement.x] = multiplier;
  }
  return {
    width: map.width,
    height: map.height,
    tileSize: map.tileSize,
    cells,
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio));
  canvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio));
  if (state.camera) {
    clampCamera(state.camera, rect.width, rect.height);
    zoomLevel.textContent = `${Math.round(state.camera.scale * 100)}%`;
  }
}

function updateEdgeScroll(event) {
  if (event.target.closest?.("button, input, select, textarea, a, [role='button']")) {
    clearEdgeScroll();
    return;
  }
  state.edgeScroll = edgeDirection(
    event.clientX,
    event.clientY,
    window.innerWidth,
    window.innerHeight
  );
}

function stopEdgeScrollOutsideWindow(event) {
  if (!event.relatedTarget) clearEdgeScroll();
}

function clearEdgeScroll() {
  state.edgeScroll = { x: 0, y: 0 };
}

function updateCamera(delta) {
  if (!state.started || !state.camera || (!state.edgeScroll.x && !state.edgeScroll.y)) return;
  moveCamera(
    state.camera,
    state.edgeScroll.x,
    state.edgeScroll.y,
    delta,
    canvas.clientWidth,
    canvas.clientHeight
  );
}

function zoomWithWheel(event) {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const factor = Math.exp(-event.deltaY * 0.0015);
  zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
}

function startGestureZoom(event) {
  event.preventDefault();
  state.gestureScale = state.camera.scale;
}

function changeGestureZoom(event) {
  event.preventDefault();
  if (!state.gestureScale) return;
  const rect = canvas.getBoundingClientRect();
  zoomAt(
    (state.gestureScale * event.scale) / state.camera.scale,
    event.clientX - rect.left,
    event.clientY - rect.top
  );
}

function endGestureZoom() {
  state.gestureScale = null;
}

function zoomAt(factor, screenX, screenY) {
  zoomCameraAt(
    state.camera,
    state.camera.scale * factor,
    screenX,
    screenY,
    canvas.clientWidth,
    canvas.clientHeight
  );
  zoomLevel.textContent = `${Math.round(state.camera.scale * 100)}%`;
}

function initialCameraScale() {
  return window.innerWidth < 720 ? 0.42 : 0.6;
}

function updateHud() {
  if (!state.battle) return;
  const counts = teamCounts(state.battle);
  allyCount.textContent = counts.ally;
  enemyCount.textContent = counts.enemy;
  updateCommanderPanel(counts);
  updateBattleResult(counts);
  syncPauseButton();
  if (!state.started) {
    battleMessage.textContent = "READY";
  } else if (!state.paused) {
    battleMessage.textContent = battleLabel();
  }
  exposeDebugState();
}

function updateBattleResult(counts) {
  const winner = state.battle.winner;
  if (!winner) {
    battleResult.hidden = true;
    return;
  }

  resultTitle.textContent = winner === "ally"
    ? "ALLIED VICTORY"
    : winner === "enemy"
      ? "DEFEAT"
      : "DRAW";
  resultTitle.classList.toggle("is-defeat", winner === "enemy");
  resultAllies.textContent = counts.ally;
  resultEnemies.textContent = counts.enemy;
  resultTime.textContent = formatBattleTime(state.battle.elapsed);
  battleResult.hidden = false;
}

function formatBattleTime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function updateCommanderPanel(counts) {
  const alliedUnits = state.battle.units.filter(unit => unit.team === "ally");
  const totalHp = alliedUnits.reduce((sum, unit) => sum + unit.hp, 0);
  const totalMaxHp = alliedUnits.reduce((sum, unit) => sum + unit.maxHp, 0);
  panelUnitCount.textContent = counts.ally;
  panelStrength.textContent = String(Math.round((totalHp / totalMaxHp) * 100));

  if (!state.started) {
    panelStatus.textContent = "READY";
  } else if (state.paused) {
    panelStatus.textContent = "PAUSED";
  } else if (state.battle.winner === "ally") {
    panelStatus.textContent = "VICTORIOUS";
  } else if (state.battle.winner) {
    panelStatus.textContent = "DEFEATED";
  } else if (alliedUnits.some(unit => unit.alive && unit.state === "attacking")) {
    panelStatus.textContent = "ENGAGED";
  } else {
    panelStatus.textContent = "ADVANCING";
  }
}

function battleLabel() {
  if (!state.battle?.winner) return "ENGAGED";
  if (state.battle.winner === "ally") return "ALLIED VICTORY";
  if (state.battle.winner === "enemy") return "ENEMY VICTORY";
  return "DRAW";
}

function exposeDebugState() {
  const debugState = {
    ready: Boolean(state.map && state.battle),
    started: state.started,
    paused: state.paused,
    elapsed: state.battle?.elapsed ?? 0,
    winner: state.battle?.winner ?? null,
    camera: state.camera ? {
      centerX: Math.round(state.camera.centerX),
      centerY: Math.round(state.camera.centerY),
      scale: Number(state.camera.scale.toFixed(3)),
    } : null,
    counts: state.battle ? teamCounts(state.battle) : null,
    shells: state.battle?.shells.length ?? 0,
    explosions: state.battle?.explosions?.map(explosion => ({
      id: explosion.id,
      age: Number(explosion.age.toFixed(3)),
      frame: Math.floor(explosion.age / state.battle.rules.explosionFrameDuration),
    })) ?? [],
    units: state.battle?.units.map(unit => ({
      id: unit.id,
      team: unit.team,
      x: Math.round(unit.x),
      y: Math.round(unit.y),
      hp: unit.hp,
      alive: unit.alive,
      state: unit.state,
      facing: unit.facing,
    })) ?? [],
  };
  window.__RTS_DEBUG__ = debugState;
  canvas.dataset.ready = String(debugState.ready);
  canvas.dataset.started = String(debugState.started);
  canvas.dataset.elapsed = debugState.elapsed.toFixed(2);
  canvas.dataset.winner = debugState.winner ?? "";
  canvas.dataset.shells = String(debugState.shells);
  canvas.dataset.explosions = String(debugState.explosions.length);
  canvas.dataset.explosionFrame = String(debugState.explosions[0]?.frame ?? "");
  canvas.dataset.minimumHp = String(
    debugState.units.reduce((minimum, unit) => Math.min(minimum, unit.hp), 100)
  );
  canvas.dataset.unitStates = [...new Set(debugState.units.map(unit => unit.state))].join(",");
  canvas.dataset.cameraX = String(debugState.camera?.centerX ?? "");
  canvas.dataset.cameraY = String(debugState.camera?.centerY ?? "");
  canvas.dataset.cameraScale = String(debugState.camera?.scale ?? "");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} を読み込めませんでした`);
  return response.json();
}

async function loadImages(urls) {
  return Object.fromEntries(await Promise.all(
    Object.entries(urls).map(async ([key, url]) => [key, await loadImage(url)])
  ));
}

function loadExplosionFrames() {
  return Promise.all(
    Array.from(
      { length: EXPLOSION_FRAME_COUNT },
      (_, index) => loadImage(`./assets/effect/ex${index + 1}.webp`)
    )
  );
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`${url} を読み込めませんでした`));
    image.src = url;
  });
}

async function loadFirstImage(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await loadImage(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
