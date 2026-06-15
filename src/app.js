import { createBattle, teamCounts, updateBattle } from "./simulation.js?v=7";
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
const showControlsButton = document.getElementById("show-controls");
const closeControlsButton = document.getElementById("close-controls");
const controlsDialog = document.getElementById("controls-dialog");
const commanderPanel = document.querySelector(".commander-panel");
const formationPanel = document.getElementById("formation-panel");
const selectionBox = document.getElementById("selection-box");

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
  unitCards: new Map(),
  formationButtons: new Map(),
  selectionDrag: null,
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
  showControlsButton.addEventListener("click", showControls);
  closeControlsButton.addEventListener("click", hideControls);
  commanderPanel.addEventListener("click", handlePanelSelection);
  window.addEventListener("keydown", handleKeyboard);
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
  battleResult.hidden = true;
  controlsDialog.hidden = true;
  selectionBox.hidden = true;
  startScreen.hidden = state.started;
  buildFormationPanel();
  syncPauseButton();
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

function handleKeyboard(event) {
  if (!controlsDialog.hidden) {
    if (event.code === "Escape") {
      event.preventDefault();
      hideControls();
    }
    return;
  }
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
    "button, input, select, textarea, a, [role='button'], .commander-panel"
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
  const unitButton = event.target.closest("[data-select-unit]");
  const formationButton = event.target.closest("[data-select-formation]");
  const roleButton = event.target.closest("[data-select-role]");
  const allButton = event.target.closest("[data-select-scope='all']");
  if (unitButton) {
    selectUnitIds([unitButton.dataset.selectUnit], event.shiftKey);
  } else if (formationButton) {
    selectBy(unit => unit.formationId === formationButton.dataset.selectFormation, event.shiftKey);
  } else if (roleButton) {
    selectBy(unit => unit.role === roleButton.dataset.selectRole, event.shiftKey);
  } else if (allButton) {
    selectBy(() => true, event.shiftKey);
  }
}

function selectBy(predicate, additive = false) {
  const ids = state.battle.units
    .filter(unit => unit.team === "ally" && unit.alive && predicate(unit))
    .map(unit => unit.id);
  selectUnitIds(ids, additive);
}

function selectUnitIds(ids, additive = false) {
  const eligible = new Set(
    state.battle.units
      .filter(unit => unit.team === "ally" && unit.alive)
      .map(unit => unit.id)
  );
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

function startMapSelection(event) {
  if (
    event.button !== 0 ||
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
  drag.moved ||= Math.hypot(point.x - drag.startX, point.y - drag.startY) >= 6;
  if (drag.moved) updateSelectionBox(drag);
}

function finishMapSelection(event) {
  const drag = state.selectionDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = canvasPoint(event);
  drag.currentX = point.x;
  drag.currentY = point.y;
  if (drag.moved) {
    const bounds = normalizedBounds(drag.startX, drag.startY, drag.currentX, drag.currentY);
    const ids = alliedUnitsInScreenBounds(bounds).map(unit => unit.id);
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
    })) ?? [],
  };
  window.__RTS_DEBUG__ = debugState;
  canvas.dataset.ready = String(debugState.ready);
  canvas.dataset.started = String(debugState.started);
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
