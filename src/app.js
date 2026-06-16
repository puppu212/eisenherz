import {
  createBattle,
  issueMoveOrder,
  setAllyControlMode,
  teamCounts,
  updateBattle,
} from "./simulation.js?v=9";
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
const loadingMessage = document.getElementById("loading-message");
const allyCount = document.getElementById("ally-count");
const enemyCount = document.getElementById("enemy-count");
const battleMessage = document.getElementById("battle-message");
const pauseButton = document.getElementById("toggle-pause");
const restartButton = document.getElementById("restart");
const controlHoldButton = document.getElementById("set-control-hold");
const controlAutoButton = document.getElementById("set-control-auto");
const formationLineButton = document.getElementById("set-formation-line");
const formationSquareButton = document.getElementById("set-formation-square");
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
const showControlsButton = document.getElementById("show-controls");
const closeControlsButton = document.getElementById("close-controls");
const controlsDialog = document.getElementById("controls-dialog");
const commanderPanel = document.querySelector(".commander-panel");
const unitStatusPanel = document.querySelector(".unit-status-panel");
const formationPanel = document.getElementById("formation-panel");
const selectionBox = document.getElementById("selection-box");
const panelSelectionBox = document.getElementById("panel-selection-box");

const ROLE_LABELS = {
  frontline: "FRONTLINE",
  rearGuard: "REAR GUARD",
};
const TYPE_LABELS = {
  tank: "TANK UNIT",
  artillery: "ARTILLERY UNIT",
};

const ASSET_URLS = {
  ally: "./assets/unit/ger1.webp",
  allyArtillery: "./assets/unit/ger2.webp",
  enemy: "./assets/unit/sov1.webp",
  shell: "./assets/effect/tank_gun.webp",
  artilleryShell: "./assets/effect/grenades.webp",
};
const UNIT_SIZE = 128;
const UNIT_HALF_SIZE = UNIT_SIZE / 2;
const SHELL_SIZE = 56;
const SHELL_HALF_SIZE = SHELL_SIZE / 2;
const ARTILLERY_SHELL_SIZE = 64;
const ARTILLERY_SHELL_HALF_SIZE = ARTILLERY_SHELL_SIZE / 2;
const EXPLOSION_SIZE = 176;
const EXPLOSION_HALF_SIZE = EXPLOSION_SIZE / 2;
const EXPLOSION_FRAME_COUNT = 9;
const HP_BAR_WIDTH = 96;
const FORMATION_UNIT_SPACING = 92;
const FORMATION_BLOCK_GAP = 96;
const FORMATION_ROLE_GAP = 190;
const FORMATION_SQUARE_COLUMNS = 2;

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
  selectedUnitIds: new Set(),
  formationStyle: "line",
  unitCards: new Map(),
  formationButtons: new Map(),
  selectionDrag: null,
  panelSelectionDrag: null,
  externalPanelSelectionDrag: null,
  commandDrag: null,
  hudPanelDrag: null,
  suppressPanelClick: false,
};

boot().catch(error => {
  console.error(error);
  loadingMessage.textContent = `起動エラー: ${error.message}`;
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
  syncViewportSize();
  window.visualViewport?.addEventListener("resize", syncViewportSize);
  window.visualViewport?.addEventListener("scroll", syncViewportSize);
  window.addEventListener("resize", syncViewportSize);
  window.addEventListener("orientationchange", syncViewportSize);
  window.addEventListener("pointermove", updateEdgeScroll);
  window.addEventListener("pointerout", stopEdgeScrollOutsideWindow);
  window.addEventListener("blur", clearEdgeScroll);
  window.addEventListener("click", blurClickedButton);
  pauseButton.addEventListener("click", togglePause);
  controlHoldButton.addEventListener("pointerdown", stopPanelDragFromControlButton);
  controlAutoButton.addEventListener("pointerdown", stopPanelDragFromControlButton);
  formationLineButton.addEventListener("pointerdown", stopPanelDragFromControlButton);
  formationSquareButton.addEventListener("pointerdown", stopPanelDragFromControlButton);
  controlHoldButton.addEventListener("click", event => {
    event.stopPropagation();
    setControlMode("hold");
  });
  controlAutoButton.addEventListener("click", event => {
    event.stopPropagation();
    setControlMode("auto");
  });
  formationLineButton.addEventListener("click", event => {
    event.stopPropagation();
    setFormationStyle("line");
  });
  formationSquareButton.addEventListener("click", event => {
    event.stopPropagation();
    setFormationStyle("square");
  });
  restartButton.addEventListener("click", () => {
    resetBattle({ waitForStart: !state.started });
  });
  resultRestartButton.addEventListener("click", () => resetBattle());
  startButton.addEventListener("click", startBattle);
  showControlsButton.addEventListener("click", showControls);
  closeControlsButton.addEventListener("click", hideControls);
  commanderPanel.addEventListener("click", handlePanelSelection);
  commanderPanel.addEventListener("pointerdown", startHudPanelDrag);
  unitStatusPanel.addEventListener("click", handlePanelSelection);
  unitStatusPanel.addEventListener("pointerdown", startHudPanelDrag);
  window.addEventListener("pointerdown", startExternalPanelSelection);
  window.addEventListener("pointermove", updateExternalPanelSelection);
  window.addEventListener("pointerup", finishExternalPanelSelection);
  window.addEventListener("pointercancel", cancelExternalPanelSelection);
  window.addEventListener("pointermove", updateHudPanelDrag);
  window.addEventListener("pointerup", finishHudPanelDrag);
  window.addEventListener("pointercancel", cancelHudPanelDrag);
  window.addEventListener("keydown", handleKeyboard);
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  canvas.addEventListener("pointerdown", startCommandDrag);
  canvas.addEventListener("pointermove", updateCommandDrag);
  canvas.addEventListener("pointerup", finishCommandDrag);
  canvas.addEventListener("pointercancel", cancelCommandDrag);
  canvas.addEventListener("pointerdown", startMapSelection);
  canvas.addEventListener("pointermove", updateMapSelection);
  canvas.addEventListener("pointerup", finishMapSelection);
  canvas.addEventListener("pointercancel", cancelMapSelection);
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
  state.selectedUnitIds.clear();
  state.selectionDrag = null;
  state.panelSelectionDrag = null;
  state.externalPanelSelectionDrag = null;
  state.commandDrag = null;
  state.hudPanelDrag = null;
  state.suppressPanelClick = false;
  battleResult.hidden = true;
  controlsDialog.hidden = true;
  selectionBox.hidden = true;
  panelSelectionBox.hidden = true;
  startScreen.hidden = state.started;
  buildFormationPanel();
  syncPauseButton();
  syncControlModeButton();
  syncFormationStyleButton();
  battleMessage.textContent = state.started ? "ENGAGED" : "READY";
  updateHud();
  exposeDebugState();
}

function startBattle() {
  if (state.started || !controlsDialog.hidden) return;
  state.started = true;
  state.lastTime = performance.now();
  startScreen.hidden = true;
  syncPauseButton();
  battleMessage.textContent = "ENGAGED";
  updateHud();
}

function showControls() {
  controlsDialog.hidden = false;
  closeControlsButton.focus();
}

function hideControls() {
  controlsDialog.hidden = true;
  showControlsButton.focus();
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

function setControlMode(mode) {
  if (!state.battle) return;
  setAllyControlMode(state.battle, mode);
  controlHoldButton.blur();
  controlAutoButton.blur();
  syncControlModeButton();
  updateHud();
}

function stopPanelDragFromControlButton(event) {
  event.stopPropagation();
}

function blurClickedButton(event) {
  event.target.closest?.("button")?.blur();
}

function syncControlModeButton() {
  const isAuto = state.battle?.allyControlMode === "auto";
  controlHoldButton.classList.toggle("is-active", !isAuto);
  controlAutoButton.classList.toggle("is-active", isAuto);
  controlHoldButton.setAttribute("aria-pressed", String(!isAuto));
  controlAutoButton.setAttribute("aria-pressed", String(isAuto));
}

function setFormationStyle(style) {
  state.formationStyle = style === "square" ? "square" : "line";
  formationLineButton.blur();
  formationSquareButton.blur();
  syncFormationStyleButton();
}

function syncFormationStyleButton() {
  const isSquare = state.formationStyle === "square";
  formationLineButton.classList.toggle("is-active", !isSquare);
  formationSquareButton.classList.toggle("is-active", isSquare);
  formationLineButton.setAttribute("aria-pressed", String(!isSquare));
  formationSquareButton.setAttribute("aria-pressed", String(isSquare));
}

function handleKeyboard(event) {
  if (event.code === "Space") {
    event.preventDefault();
  }
  if (!controlsDialog.hidden) {
    if (event.code === "Escape") {
      event.preventDefault();
      hideControls();
    }
    return;
  }
  if (!["Enter", "Space"].includes(event.code) || event.repeat) return;
  if (event.target.matches?.("input, textarea, select, [contenteditable='true']")) return;
  if (!state.started) {
    if (event.code === "Enter") {
      event.preventDefault();
      startBattle();
    }
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
  drawActiveMoveGhosts();
  drawCommandPreview();
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

function drawCommandPreview() {
  const drag = state.commandDrag;
  if (!drag || state.selectedUnitIds.size === 0) return;
  const angle = commandAngle(drag);
  const destinations = formationDestinations(drag.startX, drag.startY, angle);
  if (destinations.length === 0) return;

  ctx.save();
  ctx.lineJoin = "miter";
  drawCommandArrow(drag.startX, drag.startY, drag.currentX, drag.currentY, angle);
  for (const destination of destinations) {
    drawMoveGhost(destination.x, destination.y, destination.role, "preview");
  }
  ctx.restore();
}

function drawActiveMoveGhosts() {
  const destinations = state.battle.units
    .filter(unit => unit.alive && unit.team === "ally" && unit.command?.type === "move")
    .map(unit => ({
      x: unit.command.x,
      y: unit.command.y,
      role: unit.role,
    }));
  if (destinations.length === 0) return;

  ctx.save();
  for (const destination of destinations) {
    drawMoveGhost(destination.x, destination.y, destination.role, "committed");
  }
  ctx.restore();
}

function drawMoveGhost(x, y, role, variant = "preview") {
  const isCommitted = variant === "committed";
  ctx.globalAlpha = isCommitted ? 0.62 : 1;
  ctx.setLineDash(isCommitted ? [10, 8] : []);
  ctx.strokeStyle = role === "frontline" ? "#ffffff" : "#db0814";
  ctx.lineWidth = isCommitted ? 3 : 5;
  ctx.strokeRect(x - 24, y - 24, 48, 48);
  ctx.setLineDash([]);
  if (!isCommitted) {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 18, y - 18, 36, 36);
  }
  ctx.globalAlpha = 1;
}

function drawCommandArrow(startX, startY, currentX, currentY, angle) {
  const length = Math.max(90, Math.hypot(currentX - startX, currentY - startY));
  const endX = startX + Math.cos(angle) * length;
  const endY = startY + Math.sin(angle) * length;
  drawStrokedArrow(startX, startY, endX, endY, 15, "#ffffff");
  drawStrokedArrow(startX, startY, endX, endY, 8, "#db0814");
}

function drawStrokedArrow(startX, startY, endX, endY, lineWidth, color) {
  const angle = Math.atan2(endY - startY, endX - startX);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  const headLength = lineWidth === 15 ? 42 : 34;
  const headWidth = lineWidth === 15 ? 34 : 24;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - Math.cos(angle) * headLength + Math.cos(angle + Math.PI / 2) * headWidth,
    endY - Math.sin(angle) * headLength + Math.sin(angle + Math.PI / 2) * headWidth
  );
  ctx.lineTo(
    endX - Math.cos(angle) * headLength + Math.cos(angle - Math.PI / 2) * headWidth,
    endY - Math.sin(angle) * headLength + Math.sin(angle - Math.PI / 2) * headWidth
  );
  ctx.closePath();
  ctx.fill();
}

function drawUnit(unit) {
  const image = unit.type === "artillery"
    ? state.images.allyArtillery
    : state.images[unit.team];
  ctx.save();
  ctx.translate(unit.x, unit.y);
  if (unit.facing === "right") ctx.scale(-1, 1);
  ctx.drawImage(image, -UNIT_HALF_SIZE, -UNIT_HALF_SIZE, UNIT_SIZE, UNIT_SIZE);
  ctx.restore();

  if (state.selectedUnitIds.has(unit.id)) drawSelectionMarker(unit);

  const hpRatio = unit.hp / unit.maxHp;
  ctx.fillStyle = "#000000";
  ctx.fillRect(unit.x - HP_BAR_WIDTH / 2 - 2, unit.y - 74, HP_BAR_WIDTH + 4, 12);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(unit.x - HP_BAR_WIDTH / 2 - 1.5, unit.y - 73.5, HP_BAR_WIDTH + 3, 11);
  ctx.fillStyle = unit.team === "ally" ? "#ffffff" : "#db0814";
  ctx.fillRect(unit.x - HP_BAR_WIDTH / 2 + 2, unit.y - 70, (HP_BAR_WIDTH - 4) * hpRatio, 4);
}

function drawSelectionMarker(unit) {
  const half = UNIT_HALF_SIZE + 7;
  const corner = 22;
  ctx.save();
  ctx.translate(unit.x, unit.y);
  ctx.strokeStyle = "#db0814";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-half + corner, -half);
  ctx.lineTo(-half, -half);
  ctx.lineTo(-half, -half + corner);
  ctx.moveTo(half - corner, -half);
  ctx.lineTo(half, -half);
  ctx.lineTo(half, -half + corner);
  ctx.moveTo(-half, half - corner);
  ctx.lineTo(-half, half);
  ctx.lineTo(-half + corner, half);
  ctx.moveTo(half, half - corner);
  ctx.lineTo(half, half);
  ctx.lineTo(half - corner, half);
  ctx.stroke();
  ctx.restore();
}

function drawShell(shell) {
  if (shell.type === "artillery") {
    drawArtilleryShell(shell);
    return;
  }
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

function drawArtilleryShell(shell) {
  const progress = shell.progress ?? 0;
  const arc = 4 * shell.arcHeight * progress * (1 - progress);
  const dx = shell.targetX - shell.startX;
  const dy = shell.targetY - shell.startY - 4 * shell.arcHeight * (1 - 2 * progress);
  ctx.save();
  ctx.translate(shell.x, shell.y - arc);
  ctx.rotate(Math.atan2(dy, dx) + Math.PI);
  ctx.drawImage(
    state.images.artilleryShell,
    -ARTILLERY_SHELL_HALF_SIZE,
    -ARTILLERY_SHELL_HALF_SIZE,
    ARTILLERY_SHELL_SIZE,
    ARTILLERY_SHELL_SIZE
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

function syncViewportSize() {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${viewportHeight}px`);
  resizeCanvas();
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
  if (state.selectionDrag) {
    clearEdgeScroll();
    return;
  }
  if (event.target.closest?.(
    "button, input, select, textarea, a, [role='button'], .hud-panel"
  )) {
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
  return CAMERA_LIMITS.minScale;
}

function updateHud() {
  if (!state.battle) return;
  const counts = teamCounts(state.battle);
  allyCount.textContent = counts.ally;
  enemyCount.textContent = counts.enemy;
  updateCommanderPanel(counts);
  syncFormationPanel();
  syncControlModeButton();
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

function buildFormationPanel() {
  const allies = state.battle.units.filter(unit => unit.team === "ally");
  const roleGroups = new Map();
  for (const unit of allies) {
    if (!roleGroups.has(unit.role)) roleGroups.set(unit.role, new Map());
    const formations = roleGroups.get(unit.role);
    if (!formations.has(unit.formationId)) formations.set(unit.formationId, []);
    formations.get(unit.formationId).push(unit);
  }

  state.unitCards.clear();
  state.formationButtons.clear();
  const fragment = document.createDocumentFragment();
  for (const role of ["frontline", "rearGuard"]) {
    const formations = roleGroups.get(role);
    if (!formations) continue;
    const roleGroup = document.createElement("section");
    roleGroup.className = "role-group";
    roleGroup.dataset.role = role;

    const heading = document.createElement("h3");
    heading.className = "role-heading";
    heading.innerHTML = `<span>${ROLE_LABELS[role]}</span><b>${[...formations.values()].flat().length}</b>`;
    roleGroup.append(heading);

    for (const [formationId, units] of formations) {
      const row = document.createElement("div");
      row.className = "formation-row";
      row.dataset.formationId = formationId;

      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "formation-select";
      selectButton.dataset.selectFormation = formationId;
      selectButton.textContent = TYPE_LABELS[units[0].type] ?? "FORMATION";
      state.formationButtons.set(formationId, selectButton);

      const unitList = document.createElement("div");
      unitList.className = "formation-units";
      for (const unit of units) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "unit-card";
        card.dataset.selectUnit = unit.id;
        card.setAttribute("aria-label", `${TYPE_LABELS[unit.type] ?? "UNIT"}を選択`);

        const image = document.createElement("img");
        image.src = unit.type === "artillery"
          ? ASSET_URLS.allyArtillery
          : ASSET_URLS.ally;
        image.alt = "";

        const hp = document.createElement("span");
        hp.className = "unit-card-hp";
        const hpFill = document.createElement("i");
        hp.append(hpFill);
        card.append(image, hp);
        unitList.append(card);
        state.unitCards.set(unit.id, { card, hpFill });
      }
      row.append(selectButton, unitList);
      roleGroup.append(row);
    }
    fragment.append(roleGroup);
  }
  formationPanel.replaceChildren(fragment);
  syncFormationPanel();
}

function syncFormationPanel() {
  if (!state.battle) return;
  const allies = state.battle.units.filter(unit => unit.team === "ally");
  const livingIds = new Set(allies.filter(unit => unit.alive).map(unit => unit.id));
  for (const id of state.selectedUnitIds) {
    if (!livingIds.has(id)) state.selectedUnitIds.delete(id);
  }

  for (const unit of allies) {
    const entry = state.unitCards.get(unit.id);
    if (!entry) continue;
    entry.card.classList.toggle("is-selected", state.selectedUnitIds.has(unit.id));
    entry.card.classList.toggle("is-destroyed", !unit.alive);
    entry.card.disabled = !unit.alive;
    entry.hpFill.style.width = `${Math.max(0, (unit.hp / unit.maxHp) * 100)}%`;
  }

  for (const [formationId, button] of state.formationButtons) {
    const ids = allies
      .filter(unit => unit.alive && unit.formationId === formationId)
      .map(unit => unit.id);
    button.classList.toggle("is-selected", isEntireGroupSelected(ids));
    button.disabled = ids.length === 0;
  }

  for (const button of commanderPanel.querySelectorAll("[data-select-role]")) {
    const ids = allies
      .filter(unit => unit.alive && unit.role === button.dataset.selectRole)
      .map(unit => unit.id);
    button.classList.toggle("is-selected", isEntireGroupSelected(ids));
    button.disabled = ids.length === 0;
  }

  const allButton = commanderPanel.querySelector("[data-select-scope='all']");
  const allIds = allies.filter(unit => unit.alive).map(unit => unit.id);
  allButton.classList.toggle("is-selected", isEntireGroupSelected(allIds));
  allButton.disabled = allIds.length === 0;
}

function isEntireGroupSelected(ids) {
  return ids.length > 0 && ids.every(id => state.selectedUnitIds.has(id));
}

function handlePanelSelection(event) {
  if (state.suppressPanelClick) return;
  const unitButton = event.target.closest("[data-select-unit]");
  const formationButton = event.target.closest("[data-select-formation]");
  const roleButton = event.target.closest("[data-select-role]");
  const allButton = event.target.closest("[data-select-scope='all']");
  if (unitButton) {
    toggleUnitSelection([unitButton.dataset.selectUnit], event.shiftKey);
  } else if (formationButton) {
    toggleSelectionBy(
      unit => unit.formationId === formationButton.dataset.selectFormation,
      event.shiftKey
    );
  } else if (roleButton) {
    toggleSelectionBy(unit => unit.role === roleButton.dataset.selectRole, event.shiftKey);
  } else if (allButton) {
    toggleSelectionBy(() => true, event.shiftKey);
  }
}

function startPanelSelection(event) {
  if (event.button !== 0) return;
  if (event.target.closest("[data-select-formation]")) return;
  const unitButton = event.target.closest("[data-select-unit]");
  state.panelSelectionDrag = {
    pointerId: event.pointerId,
    unitId: unitButton?.dataset.selectUnit ?? null,
    startClientX: event.clientX,
    startClientY: event.clientY,
    currentClientX: event.clientX,
    currentClientY: event.clientY,
    additive: event.shiftKey,
    moved: false,
    captured: true,
  };
  clearEdgeScroll();
  unitStatusPanel.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updatePanelSelection(event) {
  const drag = state.panelSelectionDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.currentClientX = event.clientX;
  drag.currentClientY = event.clientY;
  drag.moved ||= Math.hypot(
    event.clientX - drag.startClientX,
    event.clientY - drag.startClientY
  ) >= 5;
  if (drag.moved) {
    updatePanelSelectionBox(drag);
  }
}

function finishPanelSelection(event) {
  const drag = state.panelSelectionDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.currentClientX = event.clientX;
  drag.currentClientY = event.clientY;
  if (drag.moved) {
    const bounds = normalizedBounds(
      drag.startClientX,
      drag.startClientY,
      drag.currentClientX,
      drag.currentClientY
    );
    selectUnitIds(unitCardsInClientBounds(bounds), drag.additive);
  } else {
    selectUnitIds(drag.unitId ? [drag.unitId] : [], drag.additive);
  }
  state.suppressPanelClick = true;
  setTimeout(() => {
    state.suppressPanelClick = false;
  }, 0);
  event.preventDefault();
  cancelPanelSelection(event);
}

function cancelPanelSelection(event) {
  if (state.panelSelectionDrag?.captured && event?.pointerId != null) {
    unitStatusPanel.releasePointerCapture?.(event.pointerId);
  }
  state.panelSelectionDrag = null;
  panelSelectionBox.hidden = true;
}

function startHudPanelDrag(event) {
  if (event.button !== 0) return;
  if (event.target.closest?.("button")) return;
  const panel = event.currentTarget;
  const rect = panel.getBoundingClientRect();
  state.hudPanelDrag = {
    pointerId: event.pointerId,
    panel,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startLeft: rect.left,
    startTop: rect.top,
    moved: false,
  };
  panel.setPointerCapture?.(event.pointerId);
}

function updateHudPanelDrag(event) {
  const drag = state.hudPanelDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const dx = event.clientX - drag.startClientX;
  const dy = event.clientY - drag.startClientY;
  drag.moved ||= Math.hypot(dx, dy) >= 5;
  if (!drag.moved) return;
  placeHudPanel(drag.panel, drag.startLeft + dx, drag.startTop + dy);
  drag.panel.classList.add("is-dragging");
  event.preventDefault();
}

function finishHudPanelDrag(event) {
  const drag = state.hudPanelDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (drag.moved) {
    state.suppressPanelClick = true;
    setTimeout(() => {
      state.suppressPanelClick = false;
    }, 0);
    event.preventDefault();
  }
  cancelHudPanelDrag(event);
}

function cancelHudPanelDrag(event) {
  const drag = state.hudPanelDrag;
  if (!drag) return;
  drag.panel.classList.remove("is-dragging");
  if (event?.pointerId != null) drag.panel.releasePointerCapture?.(event.pointerId);
  state.hudPanelDrag = null;
}

function placeHudPanel(panel, clientLeft, clientTop) {
  const parentRect = panel.offsetParent.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const left = Math.max(parentRect.left, Math.min(
    parentRect.right - panelRect.width,
    clientLeft
  ));
  const top = Math.max(parentRect.top, Math.min(
    parentRect.bottom - panelRect.height,
    clientTop
  ));
  panel.style.left = `${left - parentRect.left}px`;
  panel.style.top = `${top - parentRect.top}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
}

function startExternalPanelSelection(event) {
  if (
    event.button !== 0 ||
    !state.started ||
    state.battle?.winner ||
    event.target.closest?.(".hud-panel, button, input, select, textarea, a, [role='button']")
  ) return;
  state.externalPanelSelectionDrag = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    currentClientX: event.clientX,
    currentClientY: event.clientY,
    additive: event.shiftKey,
    moved: false,
  };
}

function updateExternalPanelSelection(event) {
  const drag = state.externalPanelSelectionDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.currentClientX = event.clientX;
  drag.currentClientY = event.clientY;
  drag.moved ||= Math.hypot(
    event.clientX - drag.startClientX,
    event.clientY - drag.startClientY
  ) >= 6;
}

function finishExternalPanelSelection(event) {
  const drag = state.externalPanelSelectionDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.currentClientX = event.clientX;
  drag.currentClientY = event.clientY;
  if (drag.moved) {
    const bounds = normalizedBounds(
      drag.startClientX,
      drag.startClientY,
      drag.currentClientX,
      drag.currentClientY
    );
    const ids = unitCardsInClientBounds(bounds);
    if (ids.length > 0) selectUnitIds(ids, drag.additive);
  }
  cancelExternalPanelSelection();
}

function cancelExternalPanelSelection() {
  state.externalPanelSelectionDrag = null;
}

function unitCardsInClientBounds(bounds) {
  const ids = [];
  for (const [id, entry] of state.unitCards) {
    if (entry.card.disabled) continue;
    const rect = entry.card.getBoundingClientRect();
    if (
      rect.right >= bounds.left &&
      rect.left <= bounds.right &&
      rect.bottom >= bounds.top &&
      rect.top <= bounds.bottom
    ) {
      ids.push(id);
    }
  }
  return ids;
}

function updatePanelSelectionBox(drag) {
  const panelRect = unitStatusPanel.getBoundingClientRect();
  const bounds = normalizedBounds(
    drag.startClientX - panelRect.left,
    drag.startClientY - panelRect.top,
    drag.currentClientX - panelRect.left,
    drag.currentClientY - panelRect.top
  );
  panelSelectionBox.hidden = false;
  panelSelectionBox.style.left = `${bounds.left}px`;
  panelSelectionBox.style.top = `${bounds.top}px`;
  panelSelectionBox.style.width = `${bounds.right - bounds.left}px`;
  panelSelectionBox.style.height = `${bounds.bottom - bounds.top}px`;
}

function selectBy(predicate, additive = false) {
  const ids = state.battle.units
    .filter(unit => unit.team === "ally" && unit.alive && predicate(unit))
    .map(unit => unit.id);
  selectUnitIds(ids, additive);
}

function toggleSelectionBy(predicate, additive = false) {
  const ids = state.battle.units
    .filter(unit => unit.team === "ally" && unit.alive && predicate(unit))
    .map(unit => unit.id);
  toggleUnitSelection(ids, additive);
}

function toggleUnitSelection(ids, additive = false) {
  const eligibleIds = aliveAllyIds();
  const nextIds = ids.filter(id => eligibleIds.has(id));
  if (!additive && isEntireGroupSelected(nextIds)) {
    state.selectedUnitIds.clear();
    syncFormationPanel();
    exposeDebugState();
    return;
  }
  selectUnitIds(nextIds, additive);
}

function selectUnitIds(ids, additive = false) {
  const eligible = aliveAllyIds();
  const nextIds = ids.filter(id => eligible.has(id));
  if (!additive) state.selectedUnitIds.clear();
  for (const id of nextIds) {
    if (additive && state.selectedUnitIds.has(id)) {
      state.selectedUnitIds.delete(id);
    } else {
      state.selectedUnitIds.add(id);
    }
  }
  syncFormationPanel();
  exposeDebugState();
}

function aliveAllyIds() {
  return new Set(
    state.battle.units
      .filter(unit => unit.team === "ally" && unit.alive)
      .map(unit => unit.id)
  );
}

function startCommandDrag(event) {
  if (
    !state.started ||
    state.battle?.winner ||
    !battleResult.hidden ||
    state.selectedUnitIds.size === 0
  ) return;
  const isRightCommand = event.button === 2;
  const isFacingCommand = event.button === 0 && event.ctrlKey;
  if (!isRightCommand && !isFacingCommand) return;
  const point = canvasPoint(event);
  const world = screenToWorld(point.x, point.y);
  state.commandDrag = {
    pointerId: event.pointerId,
    startX: world.x,
    startY: world.y,
    currentX: world.x,
    currentY: world.y,
    moved: false,
  };
  clearEdgeScroll();
  canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updateCommandDrag(event) {
  const drag = state.commandDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = canvasPoint(event);
  const world = screenToWorld(point.x, point.y);
  drag.currentX = world.x;
  drag.currentY = world.y;
  drag.moved ||= Math.hypot(world.x - drag.startX, world.y - drag.startY) >= 12;
  event.preventDefault();
}

function finishCommandDrag(event) {
  const drag = state.commandDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const angle = commandAngle(drag);
  const destinations = formationDestinations(drag.startX, drag.startY, angle);
  if (destinations.length > 0) {
    setAllyControlMode(state.battle, "hold");
    issueMoveOrder(state.battle, destinations);
    syncControlModeButton();
  }
  cancelCommandDrag(event);
  event.preventDefault();
}

function cancelCommandDrag(event) {
  if (event?.pointerId != null) canvas.releasePointerCapture?.(event.pointerId);
  state.commandDrag = null;
}

function commandAngle(drag) {
  if (drag.moved) return Math.atan2(drag.currentY - drag.startY, drag.currentX - drag.startX);
  const center = selectedUnitsCenter();
  if (center) return Math.atan2(drag.startY - center.y, drag.startX - center.x);
  return 0;
}

function selectedUnitsCenter() {
  const units = selectedLivingAllies();
  if (units.length === 0) return null;
  return {
    x: units.reduce((sum, unit) => sum + unit.x, 0) / units.length,
    y: units.reduce((sum, unit) => sum + unit.y, 0) / units.length,
  };
}

function formationDestinations(centerX, centerY, angle) {
  const units = selectedLivingAllies();
  if (units.length === 0) return [];
  const forward = { x: Math.cos(angle), y: Math.sin(angle) };
  const lateral = { x: -Math.sin(angle), y: Math.cos(angle) };
  const roleGroups = groupSelectedFormations(units);
  if (state.formationStyle === "square") {
    return squareFormationDestinations(centerX, centerY, angle, forward, lateral, roleGroups);
  }
  return lineFormationDestinations(centerX, centerY, angle, forward, lateral, roleGroups);
}

function lineFormationDestinations(centerX, centerY, angle, forward, lateral, roleGroups) {
  const destinations = [];

  for (const role of ["frontline", "rearGuard"]) {
    const formations = roleGroups.get(role);
    if (!formations?.length) continue;
    const roleOffset = role === "frontline" ? 0 : -FORMATION_ROLE_GAP;
    const blockWidths = formations.map(formation =>
      Math.max(FORMATION_UNIT_SPACING, (formation.units.length - 1) * FORMATION_UNIT_SPACING)
    );
    const totalWidth = blockWidths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, formations.length - 1) * FORMATION_BLOCK_GAP;
    let cursor = -totalWidth / 2;
    formations.forEach((formation, formationIndex) => {
      const blockWidth = blockWidths[formationIndex];
      const blockCenter = cursor + blockWidth / 2;
      const unitStart = -((formation.units.length - 1) * FORMATION_UNIT_SPACING) / 2;
      formation.units.forEach((unit, unitIndex) => {
        const unitOffset = blockCenter + unitStart + unitIndex * FORMATION_UNIT_SPACING;
        destinations.push({
          unitId: unit.id,
          x: centerX + lateral.x * unitOffset + forward.x * roleOffset,
          y: centerY + lateral.y * unitOffset + forward.y * roleOffset,
          angle,
          role: unit.role,
          formationId: unit.formationId,
        });
      });
      cursor += blockWidth + FORMATION_BLOCK_GAP;
    });
  }
  return destinations;
}

function squareFormationDestinations(centerX, centerY, angle, forward, lateral, roleGroups) {
  const destinations = [];
  let rowCursor = 0;
  for (const role of ["frontline", "rearGuard"]) {
    const formations = roleGroups.get(role);
    if (!formations?.length) continue;
    const rows = Math.ceil(formations.length / FORMATION_SQUARE_COLUMNS);
    formations.forEach((formation, formationIndex) => {
      const column = formationIndex % FORMATION_SQUARE_COLUMNS;
      const row = Math.floor(formationIndex / FORMATION_SQUARE_COLUMNS);
      const columnsInRow = Math.min(
        FORMATION_SQUARE_COLUMNS,
        formations.length - row * FORMATION_SQUARE_COLUMNS
      );
      const formationOffset = centeredGridOffset(
        column,
        rowCursor + row,
        columnsInRow,
        FORMATION_BLOCK_GAP,
        FORMATION_ROLE_GAP
      );
      pushFormationUnitDestinations(
        destinations,
        formation,
        centerX,
        centerY,
        angle,
        forward,
        lateral,
        formationOffset
      );
    });
    rowCursor += rows + 1;
  }
  return destinations;
}

function pushFormationUnitDestinations(
  destinations,
  formation,
  centerX,
  centerY,
  angle,
  forward,
  lateral,
  formationOffset
) {
  const columns = Math.min(FORMATION_SQUARE_COLUMNS, formation.units.length);
  formation.units.forEach((unit, unitIndex) => {
    const column = unitIndex % columns;
    const row = Math.floor(unitIndex / columns);
    const unitOffset = centeredGridOffset(
      column,
      row,
      columns,
      FORMATION_UNIT_SPACING,
      FORMATION_UNIT_SPACING
    );
    const lateralOffset = formationOffset.lateral + unitOffset.lateral;
    const forwardOffset = formationOffset.forward + unitOffset.forward;
    destinations.push({
      unitId: unit.id,
      x: centerX + lateral.x * lateralOffset + forward.x * forwardOffset,
      y: centerY + lateral.y * lateralOffset + forward.y * forwardOffset,
      angle,
      role: unit.role,
      formationId: unit.formationId,
    });
  });
}

function centeredGridOffset(column, row, columns, lateralSpacing, forwardSpacing) {
  return {
    lateral: (column - (columns - 1) / 2) * lateralSpacing,
    forward: -row * forwardSpacing,
  };
}

function groupSelectedFormations(units) {
  const roleGroups = new Map();
  for (const unit of units) {
    if (!roleGroups.has(unit.role)) roleGroups.set(unit.role, new Map());
    const formations = roleGroups.get(unit.role);
    if (!formations.has(unit.formationId)) {
      formations.set(unit.formationId, {
        id: unit.formationId,
        units: [],
      });
    }
    formations.get(unit.formationId).units.push(unit);
  }
  const ordered = new Map();
  for (const role of ["frontline", "rearGuard"]) {
    const formations = roleGroups.get(role);
    if (!formations) continue;
    ordered.set(role, [...formations.values()].sort((a, b) => a.id.localeCompare(b.id)));
  }
  return ordered;
}

function selectedLivingAllies() {
  return state.battle.units.filter(unit =>
    unit.team === "ally" &&
    unit.alive &&
    state.selectedUnitIds.has(unit.id)
  );
}

function startMapSelection(event) {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    !state.started ||
    state.battle?.winner ||
    !battleResult.hidden
  ) return;
  const point = canvasPoint(event);
  state.selectionDrag = {
    pointerId: event.pointerId,
    startX: point.x,
    startY: point.y,
    currentX: point.x,
    currentY: point.y,
    startClientX: event.clientX,
    startClientY: event.clientY,
    currentClientX: event.clientX,
    currentClientY: event.clientY,
    additive: event.shiftKey,
    moved: false,
  };
  clearEdgeScroll();
  canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updateMapSelection(event) {
  const drag = state.selectionDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = canvasPoint(event);
  drag.currentX = point.x;
  drag.currentY = point.y;
  drag.currentClientX = event.clientX;
  drag.currentClientY = event.clientY;
  drag.moved ||= Math.hypot(point.x - drag.startX, point.y - drag.startY) >= 6;
  if (drag.moved) updateSelectionBox(drag);
}

function finishMapSelection(event) {
  const drag = state.selectionDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = canvasPoint(event);
  drag.currentX = point.x;
  drag.currentY = point.y;
  drag.currentClientX = event.clientX;
  drag.currentClientY = event.clientY;
  if (drag.moved) {
    const bounds = normalizedBounds(drag.startX, drag.startY, drag.currentX, drag.currentY);
    const clientBounds = normalizedBounds(
      drag.startClientX,
      drag.startClientY,
      drag.currentClientX,
      drag.currentClientY
    );
    const ids = [
      ...alliedUnitsInScreenBounds(bounds).map(unit => unit.id),
      ...unitCardsInClientBounds(clientBounds),
    ];
    selectUnitIds(ids, drag.additive);
  } else {
    const unit = alliedUnitAtScreenPoint(point.x, point.y);
    selectUnitIds(unit ? [unit.id] : [], drag.additive);
  }
  cancelMapSelection(event);
}

function cancelMapSelection(event) {
  if (event?.pointerId != null) canvas.releasePointerCapture?.(event.pointerId);
  state.selectionDrag = null;
  selectionBox.hidden = true;
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function screenToWorld(screenX, screenY) {
  return {
    x: state.camera.centerX + (screenX - canvas.clientWidth / 2) / state.camera.scale,
    y: state.camera.centerY + (screenY - canvas.clientHeight / 2) / state.camera.scale,
  };
}

function worldToScreen(worldX, worldY) {
  return {
    x: (worldX - state.camera.centerX) * state.camera.scale + canvas.clientWidth / 2,
    y: (worldY - state.camera.centerY) * state.camera.scale + canvas.clientHeight / 2,
  };
}

function alliedUnitAtScreenPoint(screenX, screenY) {
  const world = screenToWorld(screenX, screenY);
  let selected = null;
  let bestDistance = UNIT_HALF_SIZE;
  for (const unit of state.battle.units) {
    if (!unit.alive || unit.team !== "ally") continue;
    const distance = Math.hypot(unit.x - world.x, unit.y - world.y);
    if (distance <= bestDistance) {
      selected = unit;
      bestDistance = distance;
    }
  }
  return selected;
}

function alliedUnitsInScreenBounds(bounds) {
  return state.battle.units.filter(unit => {
    if (!unit.alive || unit.team !== "ally") return false;
    const point = worldToScreen(unit.x, unit.y);
    return (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    );
  });
}

function normalizedBounds(x1, y1, x2, y2) {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

function updateSelectionBox(drag) {
  const bounds = normalizedBounds(drag.startX, drag.startY, drag.currentX, drag.currentY);
  selectionBox.hidden = false;
  selectionBox.style.left = `${bounds.left}px`;
  selectionBox.style.top = `${bounds.top}px`;
  selectionBox.style.width = `${bounds.right - bounds.left}px`;
  selectionBox.style.height = `${bounds.bottom - bounds.top}px`;
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
    formationStyle: state.formationStyle,
    elapsed: state.battle?.elapsed ?? 0,
    winner: state.battle?.winner ?? null,
    camera: state.camera ? {
      centerX: Math.round(state.camera.centerX),
      centerY: Math.round(state.camera.centerY),
      scale: Number(state.camera.scale.toFixed(3)),
    } : null,
    counts: state.battle ? teamCounts(state.battle) : null,
    shells: state.battle?.shells.map(shell => ({
      id: shell.id,
      type: shell.type,
      x: Math.round(shell.x),
      y: Math.round(shell.y),
      progress: Number((shell.progress ?? 0).toFixed(3)),
    })) ?? [],
    explosions: state.battle?.explosions?.map(explosion => ({
      id: explosion.id,
      age: Number(explosion.age.toFixed(3)),
      frame: Math.floor(explosion.age / state.battle.rules.explosionFrameDuration),
    })) ?? [],
    units: state.battle?.units.map(unit => ({
      id: unit.id,
      team: unit.team,
      type: unit.type,
      role: unit.role,
      formationId: unit.formationId,
      x: Math.round(unit.x),
      y: Math.round(unit.y),
      hp: unit.hp,
      alive: unit.alive,
      state: unit.state,
      facing: unit.facing,
      command: unit.command?.type ?? "",
    })) ?? [],
  };
  window.__RTS_DEBUG__ = debugState;
  canvas.dataset.ready = String(debugState.ready);
  canvas.dataset.started = String(debugState.started);
  canvas.dataset.formationStyle = debugState.formationStyle;
  canvas.dataset.elapsed = debugState.elapsed.toFixed(2);
  canvas.dataset.winner = debugState.winner ?? "";
  canvas.dataset.shells = String(debugState.shells.length);
  canvas.dataset.artilleryUnits = String(
    debugState.units.filter(unit => unit.type === "artillery" && unit.alive).length
  );
  const artilleryShells = debugState.shells.filter(shell => shell.type === "artillery");
  canvas.dataset.artilleryShells = String(artilleryShells.length);
  canvas.dataset.artilleryProgress = String(artilleryShells[0]?.progress ?? "");
  canvas.dataset.selectedUnits = [...state.selectedUnitIds].join(",");
  canvas.dataset.selectedCount = String(state.selectedUnitIds.size);
  canvas.dataset.explosions = String(debugState.explosions.length);
  canvas.dataset.explosionFrame = String(debugState.explosions[0]?.frame ?? "");
  canvas.dataset.minimumHp = String(
    debugState.units.reduce((minimum, unit) => Math.min(minimum, unit.hp), 100)
  );
  canvas.dataset.unitStates = [...new Set(debugState.units.map(unit => unit.state))].join(",");
  canvas.dataset.moveCommands = String(
    debugState.units.filter(unit => unit.command === "move").length
  );
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
