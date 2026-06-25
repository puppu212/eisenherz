import {
  clearFireTarget,
  clearMoveOrders,
  createBattle,
  issueMoveOrder,
  issueFireTarget,
  setAllyControlMode,
  teamCounts,
  updateBattle,
} from "./simulation.js?v=10";
import {
  CAMERA_LIMITS,
  cameraTransform,
  clampCamera,
  createCamera,
  edgeDirection,
  moveCamera,
  zoomCameraAt,
} from "./camera.js";
import {
  buildFormationDestinations,
} from "./formation.js";
import {
  FLOW_EVENT,
  FLOW_SCREEN,
  createGameFlow,
  transitionGameFlow,
} from "./game-flow.js";
import {
  MAX_INVASION_UNITS,
  STRATEGY_UNIT_CATALOG,
  areStrategySpotsLinked as areSpotsLinked,
  calculatePlayerIncome,
  canHireStrategyUnit,
  canInvadeStrategyTarget,
  collectPlayerIncome,
  createInvasionOperation,
  createStrategyState,
  getStrategySpot,
  hireStrategyUnit as hireUnit,
  invasionSourceSpotsForTarget,
  isStrategyUnitActionAvailable,
  resolveStrategyBattle,
  selectedStrategyUnits as getSelectedStrategyUnits,
} from "./strategy.js?v=7";

const canvas = document.getElementById("battlefield");
const ctx = canvas.getContext("2d");
const loading = document.getElementById("loading");
const loadingMessage = document.getElementById("loading-message");
const titleScreen = document.getElementById("title-screen");
const titleDifficultyButtons = [...document.querySelectorAll(".title-difficulty")];
const scenarioScreen = document.getElementById("scenario-screen");
const scenarioStartButton = document.getElementById("scenario-start");
const scenarioList = document.getElementById("scenario-list");
const scenarioTitle = document.getElementById("scenario-title");
const scenarioDescription = document.getElementById("scenario-description");
const scenarioFaction = document.getElementById("scenario-faction");
const scenarioObjective = document.getElementById("scenario-objective");
const scenarioDifficulty = document.getElementById("scenario-difficulty");
const scenarioLoading = document.getElementById("scenario-loading");
const scenarioLoadingImage = document.getElementById("scenario-loading-image");
const allyCount = document.getElementById("ally-count");
const enemyCount = document.getElementById("enemy-count");
const allyLabel = document.getElementById("ally-label");
const enemyLabel = document.getElementById("enemy-label");
const battleStatus = document.querySelector(".battle-status");
const battleMessage = document.getElementById("battle-message");
const pauseButton = document.getElementById("toggle-pause");
const headerBackButton = document.getElementById("header-back");
const headerHelpButton = document.getElementById("header-help");
const controlHoldButton = document.getElementById("set-control-hold");
const controlAutoButton = document.getElementById("set-control-auto");
const formationLineButton = document.getElementById("set-formation-line");
const formationSquareButton = document.getElementById("set-formation-square");
const formationDenseButton = document.getElementById("set-formation-dense");
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
const screenTransition = document.getElementById("screen-transition");
const showControlsButton = document.getElementById("show-controls");
const closeControlsButton = document.getElementById("close-controls");
const controlsDialog = document.getElementById("controls-dialog");
const controlsTitle = document.getElementById("controls-title");
const controlsList = document.getElementById("controls-list");
const commanderPanel = document.querySelector(".commander-panel");
const unitStatusPanel = document.querySelector(".unit-status-panel");
const formationPanel = document.getElementById("formation-panel");
const selectionBox = document.getElementById("selection-box");
const panelSelectionBox = document.getElementById("panel-selection-box");
const strategyPanel = document.getElementById("strategy-panel");
const strategyTurn = document.getElementById("strategy-turn");
const strategyPhase = document.getElementById("strategy-phase");
const strategyIncome = document.getElementById("strategy-income");
const strategyFunds = document.getElementById("strategy-funds");
const strategySource = document.getElementById("strategy-source");
const strategyTarget = document.getElementById("strategy-target");
const strategyInvadeButton = document.getElementById("strategy-invade");
const strategyMessage = document.getElementById("strategy-message");
const strategySelectedForces = document.getElementById("strategy-selected-forces");
const strategySpotPanels = document.getElementById("strategy-spot-panels");
const factionPanel = document.getElementById("faction-panel");
const factionEmpty = document.getElementById("faction-empty");
const factionEmptyTitle = document.getElementById("faction-empty-title");
const factionEmptyMessage = document.getElementById("faction-empty-message");
const factionList = document.getElementById("faction-list");
const factionDetail = document.getElementById("faction-detail");
const factionPortrait = document.getElementById("faction-portrait");
const factionName = document.getElementById("faction-name");
const factionCommander = document.getElementById("faction-commander");
const factionDescription = document.getElementById("faction-description");
const factionTerritories = document.getElementById("faction-territories");
const factionStatus = document.getElementById("faction-status");
const chooseFactionButton = document.getElementById("choose-faction");
const factionConfirmDialog = document.getElementById("faction-confirm-dialog");
const factionConfirmSummary = document.getElementById("faction-confirm-summary");
const confirmFactionButton = document.getElementById("confirm-faction");
const cancelFactionButton = document.getElementById("cancel-faction");
const strategyExitDialog = document.getElementById("strategy-exit-dialog");
const confirmStrategyExitButton = document.getElementById("confirm-strategy-exit");
const cancelStrategyExitButton = document.getElementById("cancel-strategy-exit");
const endTurnDialog = document.getElementById("end-turn-dialog");
const confirmEndTurnButton = document.getElementById("confirm-end-turn");
const cancelEndTurnButton = document.getElementById("cancel-end-turn");
const invasionDialog = document.getElementById("invasion-dialog");
const invasionTitle = document.getElementById("invasion-title");
const invasionSummary = document.getElementById("invasion-summary");
const invasionActions = invasionDialog.querySelector(".invasion-actions");
const confirmInvasionButton = document.getElementById("confirm-invasion");
const cancelInvasionButton = document.getElementById("cancel-invasion");
const strategyWarningDialog = document.getElementById("strategy-warning-dialog");
const strategyWarningMessage = document.getElementById("strategy-warning-message");
const battleBriefing = document.getElementById("battle-briefing");
const battleBriefingSummary = document.getElementById("battle-briefing-summary");
const beginBattleButton = document.getElementById("begin-battle");
const legendHelp = document.getElementById("legend-help");

const ROLE_LABELS = {
  frontline: "FRONTLINE",
  rearGuard: "REAR GUARD",
};
const TYPE_LABELS = {
  tank: "TANK UNIT",
  artillery: "ARTILLERY UNIT",
};
const OWNER_LABELS = {
  player: "OWN",
  enemy: "ENEMY",
  neutral: "NEUTRAL",
};
const CONTROL_GUIDES = Object.freeze({
  strategy: Object.freeze({
    title: "STRATEGY ORDERS",
    items: Object.freeze([
      ["SELECT", "拠点を左クリックで選択 / Escで解除"],
      ["TARGET", "隣接する敵または中立拠点を右クリックで侵攻先に指定"],
      ["SORTIE", "出撃するユニットを出撃編成へドラッグ&ドロップ"],
      ["HIRE", "自領地の拠点パネルから戦車または砲兵を雇用"],
      ["END TURN", "ヘッダーのEND TURNでターン終了"],
      ["CAMERA", "画面端へカーソルを移動"],
      ["ZOOM", "ホイール / ピンチ"],
    ]),
  }),
  battle: Object.freeze({
    title: "BATTLE ORDERS",
    items: Object.freeze([
      ["SELECT", "味方ユニットまたはユニット一覧を左クリック / Escで解除"],
      ["BOX SELECT", "マップまたはユニット一覧を左ドラッグ"],
      ["FIRE TARGET", "空地を左クリックで全軍射撃指定 / ダブルクリックで解除"],
      ["MOVE", "右クリックで移動 / 右ドラッグで向き指定"],
      ["FACING", "Ctrl + 左ドラッグでも向き指定"],
      ["CAMERA", "カーソルを画面端へ移動"],
      ["ZOOM", "ホイール / ピンチ"],
      ["PAUSE", "SPACEキー / ヘッダーのPAUSE"],
    ]),
  }),
});
const DEFAULT_FACTION = Object.freeze({
  id: "deutschland",
  name: "Deutschland",
  commander: "Elise",
  description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  portrait: "./assets/character/char1.webp",
});
const SCENARIOS = Object.freeze([
  {
    id: "demo",
    number: "01",
    title: "DEMO 01",
    year: "1938",
    region: "EUROPE",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    faction: "EISENHERZ",
    objective: "ALL TERRITORIES",
    unlocked: true,
  },
  {
    id: "counterstrike",
    number: "02",
    title: "DEMO 02",
    year: "1939",
    region: "EASTERN FRONT",
    unlocked: false,
  },
  {
    id: "ironwall",
    number: "03",
    title: "DEMO 03",
    year: "1940",
    region: "CENTRAL EUROPE",
    unlocked: false,
  },
]);
const ASSET_URLS = {
  ally: "./assets/unit/ger1.webp",
  allyArtillery: "./assets/unit/ger2.webp",
  enemy: "./assets/unit/sov1.webp",
  shell: "./assets/effect/tank_gun.webp",
  artilleryShell: "./assets/effect/grenades.webp",
};
const STRATEGY_ASSET_URLS = {
  world: "./assets/world/world.webp",
  Berlin: "./assets/spot/Berlin.webp",
  spot: "./assets/spot/spot.webp",
  city: "./assets/spot/city.webp",
  port: "./assets/spot/port.webp",
  flag1: "./assets/flag/flag1.webp",
  flag6: "./assets/flag/flag6.webp?v=2",
};
const SCENARIO_LOADING_ART = Object.freeze([
  { url: "./assets/load/load02.webp", position: "center" },
  { url: "./assets/load/load03.webp", position: "center" },
  { url: "./assets/load/load04.webp", position: "center" },
  { url: "./assets/load/load5.webp", position: "center" },
]);
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
const SPOT_SIZE = 72;
const SPOT_HIT_RADIUS = 48;
const STRATEGY_FLAG_SIZE = 24;
const DEFAULT_SPOT_SCALE_BY_IMAGE = Object.freeze({
  spot: 0.5,
  city: 0.82,
  port: 0.82,
  Berlin: 0.9,
});
const STRATEGY_FACTION_MARKER_COLORS = Object.freeze({
  deutschland: "#db0814",
  poland: "#EF3B85",
});
const STRATEGY_SPOT_EFFECT = Object.freeze({ x: -12, y: -8, scale: 1.14, alpha: 1 });
const STRATEGY_SPOT_EFFECT_SLIDE_MS = 260;
const STRATEGY_CAMERA_SCALE = 1.8;
const STRATEGY_EDGE_SPEED = 780;
const SCREEN_TRANSITION_FADE_MS = 220;
const SCREEN_TRANSITION_HOLD_MS = 520;
const DIAGONAL_CUT_COVER_MS = 900;
const DIAGONAL_CUT_HOLD_MS = 260;
const DIAGONAL_CUT_REVEAL_MS = 360;
const SCENARIO_LOADING_HOLD_MS = 1200;
const BATTLE_HUD_INTERVAL_MS = 100;
const STRATEGY_WARNING_MS = 1400;
const INVASION_DIALOG_FRONT_Z_INDEX = 70;
const STRATEGY_MESSAGE_SELECT_TARGET = "侵攻先にする敵領地を右クリックしてください";
const STRATEGY_MESSAGE_SELECT_SOURCE = "隣接する自領地を選択してください";
const STRATEGY_MESSAGE_DRAG_UNITS = "出撃するユニットを出撃編成へドラッグ&ドロップしてください";
const state = {
  flow: createGameFlow(),
  mode: "strategy",
  selectedScenarioId: SCENARIOS[0].id,
  selectedFactionId: null,
  map: null,
  mapLayer: null,
  images: {},
  strategyImages: {},
  strategyData: null,
  strategy: null,
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
  strategyPanelSelectionDrag: null,
  strategySortiePanel: null,
  strategyFactionPanels: new Map(),
  commandDrag: null,
  strategyForceDrag: null,
  hudPanelDrag: null,
  suppressPanelClick: false,
  activeOperation: null,
  pendingOperation: null,
  strategyWarningTimeout: null,
  resolvedBattleOperation: false,
  strategyCleared: false,
  transitioning: false,
  nextHudPanelZIndex: 3,
  lastBattleHudUpdate: 0,
  strategyRenderKey: null,
  strategyPointer: null,
  hoveredStrategySpotId: null,
  strategyEffectTime: 0,
  strategyEffectKey: "",
  strategyEffectStartedAt: 0,
  strategyTintedSpotImages: new WeakMap(),
  lastScenarioLoadingArtIndex: -1,
};
let controlsReturnButton = showControlsButton;

boot().catch(error => {
  console.error(error);
  loadingMessage.textContent = `起動エラー: ${error.message}`;
  loading.classList.add("error");
});

async function boot() {
  const [map, images, explosionFrames, strategyData, strategyImages] = await Promise.all([
    fetchJson("./assets/map/map1.json"),
    loadImages(ASSET_URLS),
    loadExplosionFrames(),
    fetchJson("./assets/spot/strategy.json?v=3"),
    loadImages(STRATEGY_ASSET_URLS),
  ]);

  state.map = map;
  state.images = images;
  state.strategyImages = strategyImages;
  state.strategyData = strategyData;
  state.strategy = createStrategyState(strategyData);
  state.explosionFrames = explosionFrames;
  state.terrainMovement = createTerrainMovement(map);
  state.mapLayer = await buildMapLayer(map);
  state.camera = createStrategyCamera();
  zoomLevel.textContent = `${Math.round(state.camera.scale * 100)}%`;
  resetBattle({ waitForStart: true });
  scheduleViewportSync();
  window.visualViewport?.addEventListener("resize", syncViewportSize);
  window.visualViewport?.addEventListener("scroll", syncViewportSize);
  window.addEventListener("resize", syncViewportSize);
  window.addEventListener("orientationchange", syncViewportSize);
  document.addEventListener("fullscreenchange", scheduleViewportSync);
  window.addEventListener("pointermove", updateEdgeScroll);
  window.addEventListener("pointerout", stopEdgeScrollOutsideWindow);
  window.addEventListener("blur", clearEdgeScroll);
  window.addEventListener("click", blurClickedButton);
  pauseButton.addEventListener("click", togglePause);
  headerBackButton.addEventListener("click", handleHeaderBack);
  headerHelpButton.addEventListener("click", showHeaderControls);
  controlHoldButton.addEventListener("pointerdown", stopPanelDragFromControlButton);
  controlAutoButton.addEventListener("pointerdown", stopPanelDragFromControlButton);
  formationLineButton.addEventListener("pointerdown", stopPanelDragFromControlButton);
  formationSquareButton.addEventListener("pointerdown", stopPanelDragFromControlButton);
  formationDenseButton.addEventListener("pointerdown", stopPanelDragFromControlButton);
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
  formationDenseButton.addEventListener("click", event => {
    event.stopPropagation();
    setFormationStyle("dense");
  });
  resultRestartButton.addEventListener("click", () => {
    if (state.strategyCleared) {
      runScreenTransition(returnToScenarioScreen);
      return;
    }
    if (state.activeOperation) {
      transitionToStrategyMode();
    } else {
      transitionToBattleReset();
    }
  });
  startButton.addEventListener("click", startBattle);
  strategyInvadeButton?.addEventListener("click", invadeSelectedSpot);
  strategyPanel.addEventListener("pointerdown", startHudPanelDrag);
  strategySpotPanels.addEventListener("click", handleStrategySpotPanelClick);
  strategySpotPanels.addEventListener("contextmenu", handleStrategySpotPanelContextMenu);
  strategySpotPanels.addEventListener("pointerdown", startStrategyPanelSelection);
  strategySpotPanels.addEventListener("pointerdown", startHudPanelDrag);
  strategySelectedForces.addEventListener("pointerdown", startStrategyForceDrag);
  window.addEventListener("pointermove", updateStrategyPanelSelection);
  window.addEventListener("pointerup", finishStrategyPanelSelection);
  window.addEventListener("pointercancel", cancelStrategyPanelSelection);
  window.addEventListener("pointermove", updateStrategyForceDrag);
  window.addEventListener("pointerup", finishStrategyForceDrag);
  window.addEventListener("pointercancel", cancelStrategyForceDrag);
  invasionDialog.addEventListener("pointerdown", startHudPanelDrag);
  confirmInvasionButton.addEventListener("click", confirmPendingInvasion);
  cancelInvasionButton.addEventListener("click", handleInvasionSecondaryAction);
  beginBattleButton.addEventListener("click", beginBriefedBattle);
  showControlsButton.addEventListener("click", showControls);
  closeControlsButton.addEventListener("click", hideControls);
  for (const button of titleDifficultyButtons) {
    button.addEventListener("click", () => openScenarioScreen(button.dataset.difficulty));
  }
  scenarioList.addEventListener("click", event => {
    const button = event.target.closest("[data-scenario-id]");
    if (!button || button.disabled) return;
    selectScenario(button.dataset.scenarioId);
  });
  scenarioStartButton.addEventListener("click", startSelectedScenario);
  factionList.addEventListener("click", handleFactionListClick);
  chooseFactionButton.addEventListener("click", openFactionConfirmation);
  confirmFactionButton.addEventListener("click", confirmFactionSelection);
  cancelFactionButton.addEventListener("click", cancelFactionSelection);
  confirmStrategyExitButton.addEventListener("click", confirmStrategyExit);
  cancelStrategyExitButton.addEventListener("click", cancelStrategyExit);
  confirmEndTurnButton.addEventListener("click", confirmEndTurn);
  cancelEndTurnButton.addEventListener("click", cancelEndTurn);
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
  window.addEventListener("contextmenu", handleScreenBack, { capture: true });
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  canvas.addEventListener("pointerdown", startCommandDrag);
  canvas.addEventListener("pointermove", updateCommandDrag);
  canvas.addEventListener("pointerup", finishCommandDrag);
  canvas.addEventListener("pointercancel", cancelCommandDrag);
  canvas.addEventListener("pointerdown", startMapSelection);
  canvas.addEventListener("pointermove", trackStrategyHover);
  canvas.addEventListener("pointerleave", clearStrategyHover);
  canvas.addEventListener("pointermove", updateMapSelection);
  canvas.addEventListener("pointerup", finishMapSelection);
  canvas.addEventListener("pointercancel", cancelMapSelection);
  canvas.addEventListener("dblclick", clearMapFireTarget);
  canvas.addEventListener("wheel", zoomWithWheel, { passive: false });
  canvas.addEventListener("gesturestart", startGestureZoom, { passive: false });
  canvas.addEventListener("gesturechange", changeGestureZoom, { passive: false });
  canvas.addEventListener("gestureend", endGestureZoom);
  loading.hidden = true;
  preloadScenarioLoadingArt();
  renderScenarioSelection();
  enterStrategyMode();
  showTitleScreen();
  state.lastTime = performance.now();
  requestAnimationFrame(frame);
}

function renderScenarioSelection() {
  scenarioList.replaceChildren(...SCENARIOS.map(scenario => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.scenarioId = scenario.id;
    button.disabled = !scenario.unlocked;
    button.innerHTML = `<span class="scenario-number">${scenario.number}</span><span><b>${scenario.title}</b><small>${scenario.year} · ${scenario.region}</small></span>`;
    return button;
  }));
  selectScenario(state.selectedScenarioId);
}

function selectScenario(scenarioId) {
  const scenario = SCENARIOS.find(candidate => candidate.id === scenarioId && candidate.unlocked)
    ?? SCENARIOS.find(candidate => candidate.unlocked);
  if (!scenario) return;
  state.selectedScenarioId = scenario.id;
  for (const button of scenarioList.querySelectorAll("[data-scenario-id]")) {
    const selected = button.dataset.scenarioId === scenario.id;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  scenarioTitle.textContent = scenario.title;
  scenarioDescription.textContent = scenario.description;
  scenarioFaction.textContent = scenario.faction;
  scenarioObjective.textContent = scenario.objective;
}

function showTitleScreen() {
  const event = state.flow.screen === FLOW_SCREEN.BOOT
    ? FLOW_EVENT.BOOT_READY
    : FLOW_EVENT.BACK;
  updateGameFlow(event);
}

function handleScreenBack(event) {
  event.preventDefault();
  if (![FLOW_SCREEN.SCENARIO, FLOW_SCREEN.FACTION].includes(state.flow.screen)) return;
  if (state.transitioning) return;
  if (!factionConfirmDialog.hidden) {
    cancelFactionSelection();
    return;
  }
  if (!strategyExitDialog.hidden) {
    cancelStrategyExit();
    return;
  }
  handleHeaderBack();
}

function handleHeaderBack() {
  if (state.transitioning) return;
  if (state.flow.screen === FLOW_SCREEN.SCENARIO) {
    runScreenTransition(showTitleScreen);
  } else if (state.flow.screen === FLOW_SCREEN.FACTION) {
    runScreenTransition(returnFromFactionSelection);
  } else if (state.flow.screen === FLOW_SCREEN.STRATEGY) {
    strategyExitDialog.hidden = false;
    confirmStrategyExitButton.focus();
  }
}

function returnFromFactionSelection() {
  resetScenarioSessionState();
  updateGameFlow(FLOW_EVENT.BACK);
}

function confirmStrategyExit() {
  strategyExitDialog.hidden = true;
  runScreenTransition(returnToScenarioScreen);
}

function cancelStrategyExit() {
  strategyExitDialog.hidden = true;
  headerBackButton.focus();
}

function returnToScenarioScreen() {
  resetScenarioSessionState();
  updateGameFlow(FLOW_EVENT.RETURN_SCENARIOS);
}

function resetScenarioSessionState() {
  state.selectedFactionId = null;
  state.strategyCleared = false;
  state.mode = "strategy";
  state.formationStyle = "line";
  state.gestureScale = null;
  state.nextHudPanelZIndex = 3;
  state.lastBattleHudUpdate = 0;
  clearEdgeScroll();
  resetStrategyState();
  resetBattle({ waitForStart: true });
  startScreen.hidden = true;
  commanderPanel.hidden = true;
  unitStatusPanel.hidden = true;
  strategyPanel.hidden = false;
  strategySpotPanels.hidden = false;
  factionPanel.hidden = true;
}

function openScenarioScreen(difficulty = "easy") {
  if (state.flow.screen !== FLOW_SCREEN.TITLE || state.transitioning) return;
  const difficultyDisplay = {
    easy: { label: "EASY" },
    normal: { label: "NORMAL" },
    hard: { label: "HARD" },
  }[difficulty] ?? { label: "EASY" };
  scenarioDifficulty.textContent = difficultyDisplay.label;
  runScreenTransition(() => updateGameFlow(FLOW_EVENT.CHOOSE_DIFFICULTY, { difficulty }));
}

function startSelectedScenario() {
  if (state.flow.screen !== FLOW_SCREEN.SCENARIO || state.transitioning) return;
  runIllustratedScreenTransition({
    revealAction: () => {
      state.selectedFactionId = null;
      updateGameFlow(FLOW_EVENT.START_SCENARIO, { scenarioId: state.selectedScenarioId });
      enterFactionSelectionMode();
    },
  });
}

function factionById(id) {
  return state.strategyData.factions?.find(faction => faction.id === id)
    ?? (id === DEFAULT_FACTION.id ? DEFAULT_FACTION : null);
}

function isFactionSelectable(faction) {
  return faction?.selectable !== false;
}

function renderFactionList() {
  const factions = state.strategyData.factions ?? [DEFAULT_FACTION];
  const fragment = document.createDocumentFragment();
  for (const faction of factions) {
    const selectable = isFactionSelectable(faction);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "faction-list-item";
    button.dataset.factionId = faction.id;
    button.disabled = !selectable;
    button.classList.toggle("is-selected", state.selectedFactionId === faction.id);

    const flag = document.createElement("img");
    flag.src = STRATEGY_ASSET_URLS[faction.flag] ?? STRATEGY_ASSET_URLS.flag1;
    flag.alt = "";

    const label = document.createElement("span");
    label.textContent = faction.name;

    const status = document.createElement("small");
    status.textContent = selectable ? "選択可能" : "選択不可";

    button.append(flag, label, status);
    fragment.append(button);
  }
  factionList.replaceChildren(fragment);
}

function handleFactionListClick(event) {
  const button = event.target.closest("[data-faction-id]");
  if (!button || button.disabled) return;
  const factionId = button.dataset.factionId;
  const spot = state.strategy.spots.find(candidate => candidate.factionId === factionId);
  if (spot) {
    selectFactionFromSpot(spot);
    return;
  }
  selectFactionById(factionId);
}

function selectFactionById(factionId, spotId = null) {
  const faction = factionById(factionId);
  if (!faction) return;
  const selectable = isFactionSelectable(faction);
  state.selectedFactionId = selectable ? faction.id : null;
  state.strategy.selectedSpotId = spotId;
  factionEmpty.hidden = true;
  factionDetail.hidden = false;
  factionPortrait.src = faction.portrait;
  factionPortrait.alt = `${faction.name} commander`;
  factionName.textContent = faction.name;
  factionCommander.textContent = `COMMANDER · ${faction.commander}`;
  factionDescription.textContent = selectable
    ? faction.description
    : "この勢力は選択できません。";
  factionTerritories.textContent = String(
    state.strategy.spots.filter(candidate => candidate.factionId === faction.id).length
  );
  factionStatus.textContent = selectable ? "PLAYABLE" : "UNAVAILABLE";
  chooseFactionButton.disabled = !selectable;
  renderFactionList();
  state.strategyRenderKey = null;
}

function selectFactionFromSpot(spot) {
  const faction = factionById(spot.factionId);
  if (!faction) {
    state.selectedFactionId = null;
    state.strategy.selectedSpotId = spot.id;
    factionEmptyTitle.textContent = "選択できない領地";
    factionEmptyMessage.textContent = "この領地には選択可能な勢力がありません。旗のある領地を選択してください。";
    factionEmpty.hidden = false;
    factionDetail.hidden = true;
    chooseFactionButton.disabled = true;
    renderFactionList();
    state.strategyRenderKey = null;
    return;
  }
  selectFactionById(faction.id, spot.id);
}

function openFactionConfirmation() {
  const faction = factionById(state.selectedFactionId);
  if (!faction || !isFactionSelectable(faction) || state.transitioning) return;
  factionConfirmSummary.textContent = `${faction.name}でシナリオを開始します。`;
  factionConfirmDialog.hidden = false;
  confirmFactionButton.focus();
}

function confirmFactionSelection() {
  const faction = factionById(state.selectedFactionId);
  if (!faction || !isFactionSelectable(faction) || state.transitioning) return;
  factionConfirmDialog.hidden = true;
  runScenarioLoadingTransition();
}

function cancelFactionSelection() {
  factionConfirmDialog.hidden = true;
  chooseFactionButton.focus();
}

function preloadScenarioLoadingArt() {
  for (const art of SCENARIO_LOADING_ART) {
    const image = new Image();
    image.src = art.url;
  }
}

function selectScenarioLoadingArt() {
  const availableIndexes = SCENARIO_LOADING_ART
    .map((_, index) => index)
    .filter(index => index !== state.lastScenarioLoadingArtIndex);
  const index = availableIndexes[Math.floor(Math.random() * availableIndexes.length)] ?? 0;
  state.lastScenarioLoadingArtIndex = index;
  return SCENARIO_LOADING_ART[index];
}

async function runScenarioLoadingTransition() {
  if (state.transitioning || state.flow.screen !== FLOW_SCREEN.FACTION) return;
  runIllustratedScreenTransition({
    revealAction: () => updateGameFlow(FLOW_EVENT.CHOOSE_FACTION, { factionId: state.selectedFactionId }),
    completeAction: () => {
      resetStrategyState();
      enterStrategyMode();
      updateGameFlow(FLOW_EVENT.FINISH_LOADING);
    },
  });
}

async function runIllustratedScreenTransition({ revealAction, completeAction = () => {} }) {
  if (state.transitioning) return;
  state.transitioning = true;
  const art = selectScenarioLoadingArt();
  scenarioLoadingImage.src = art.url;
  scenarioLoading.style.setProperty("--loading-art-position", art.position);
  const variantClass = "is-diagonal-cut";

  try {
    await scenarioLoadingImage.decode().catch(() => {});
    screenTransition.hidden = false;
    await nextAnimationFrame();
    screenTransition.classList.add("is-visible");
    await delay(SCREEN_TRANSITION_FADE_MS);

    await revealAction();
    scenarioLoading.hidden = false;
    await nextAnimationFrame();
    screenTransition.classList.remove("is-visible");
    await delay(SCREEN_TRANSITION_FADE_MS);
    await delay(SCENARIO_LOADING_HOLD_MS);

    screenTransition.classList.add(variantClass);
    screenTransition.hidden = false;
    await nextAnimationFrame();
    screenTransition.classList.add("is-visible");
    await delay(DIAGONAL_CUT_COVER_MS);
    scenarioLoading.hidden = true;
    await completeAction();
    state.lastTime = performance.now();

    await nextAnimationFrame();
    screenTransition.classList.remove("is-visible");
    await delay(DIAGONAL_CUT_REVEAL_MS);
  } finally {
    scenarioLoading.hidden = true;
    screenTransition.classList.remove("is-visible");
    screenTransition.classList.remove(variantClass);
    screenTransition.hidden = true;
    state.transitioning = false;
  }
}

function updateGameFlow(event, payload = {}) {
  state.flow = transitionGameFlow(state.flow, event, payload);
  syncFlowScreen();
}

function syncFlowScreen() {
  const { screen } = state.flow;
  titleScreen.hidden = screen !== FLOW_SCREEN.TITLE;
  scenarioScreen.hidden = screen !== FLOW_SCREEN.SCENARIO;
  scenarioLoading.hidden = screen !== FLOW_SCREEN.LOADING;
  factionPanel.hidden = screen !== FLOW_SCREEN.FACTION;
  battleStatus.hidden = screen === FLOW_SCREEN.FACTION;
  headerBackButton.hidden = screen !== FLOW_SCREEN.STRATEGY;
  headerHelpButton.hidden = ![FLOW_SCREEN.STRATEGY, FLOW_SCREEN.BATTLE].includes(screen);
  pauseButton.hidden = screen === FLOW_SCREEN.FACTION;
  document.body.classList.toggle(
    "is-front-screen",
    [FLOW_SCREEN.TITLE, FLOW_SCREEN.SCENARIO, FLOW_SCREEN.LOADING].includes(screen)
  );
  if ([FLOW_SCREEN.TITLE, FLOW_SCREEN.SCENARIO, FLOW_SCREEN.FACTION, FLOW_SCREEN.LOADING, FLOW_SCREEN.CLEAR].includes(screen)) {
    pauseButton.disabled = true;
  }
}

function resetStrategyState() {
  closeStrategyTransientUi();
  state.strategy = createStrategyState(state.strategyData, state.selectedFactionId ?? "deutschland");
  state.camera = createStrategyCamera();
  state.activeOperation = null;
  state.pendingOperation = null;
  state.resolvedBattleOperation = false;
  state.strategyCleared = false;
  state.strategyRenderKey = null;
}

function closeStrategyTransientUi() {
  if (!state.strategy) return;
  cancelStrategyPanelSelection();
  cancelStrategyForceDrag();
  for (const panel of state.strategy.openSpotPanels.values()) panel.remove();
  state.strategy.openSpotPanels.clear();
  closeStrategyFactionInfoPanels();
  closeStrategySortiePanel();
  invasionDialog.hidden = true;
  strategyWarningDialog.hidden = true;
  clearStrategyWarningTimeout();
  battleBriefing.hidden = true;
  factionConfirmDialog.hidden = true;
  strategyExitDialog.hidden = true;
  endTurnDialog.hidden = true;
}

function createStrategyCamera() {
  return createCamera(state.strategy.width, state.strategy.height, {
    scale: STRATEGY_CAMERA_SCALE,
  });
}

function createBattleCamera() {
  return createCamera(
    state.map.width * state.map.tileSize,
    state.map.height * state.map.tileSize,
    { scale: initialCameraScale() }
  );
}

function enterStrategyMode() {
  closeStrategyTransientUi();
  state.mode = "strategy";
  state.started = true;
  state.paused = false;
  state.activeOperation = null;
  state.pendingOperation = null;
  state.resolvedBattleOperation = false;
  invasionDialog.hidden = true;
  battleBriefing.hidden = true;
  state.camera = createStrategyCamera();
  clampCamera(state.camera, canvas.clientWidth, canvas.clientHeight);
  startScreen.hidden = true;
  battleResult.hidden = true;
  controlsDialog.hidden = true;
  selectionBox.hidden = true;
  panelSelectionBox.hidden = true;
  commanderPanel.hidden = true;
  unitStatusPanel.hidden = true;
  strategyPanel.hidden = false;
  factionPanel.hidden = true;
  strategySpotPanels.hidden = false;
  allyLabel.textContent = "OWN";
  enemyLabel.textContent = "NEUTRAL";
  pauseButton.textContent = "END TURN";
  pauseButton.disabled = false;
  pauseButton.classList.remove("is-active");
  pauseButton.setAttribute("aria-pressed", "false");
  renderControlsGuide("strategy");
  legendHelp.textContent = "拠点クリック: 選択 / 画面端: スクロール";
  updateStrategyHud();
  updateStrategySpotPanel();
}

function enterFactionSelectionMode() {
  closeStrategyTransientUi();
  state.mode = "faction-select";
  state.started = false;
  state.paused = false;
  state.strategy.selectedSpotId = null;
  state.camera = createStrategyCamera();
  clampCamera(state.camera, canvas.clientWidth, canvas.clientHeight);
  commanderPanel.hidden = true;
  unitStatusPanel.hidden = true;
  strategyPanel.hidden = true;
  strategySpotPanels.hidden = true;
  factionPanel.hidden = false;
  renderFactionList();
  factionEmpty.hidden = false;
  factionEmptyTitle.textContent = "勢力を選択";
  factionEmptyMessage.textContent = "右の一覧、またはマップ上の旗がある領地から勢力を選んでください。";
  factionDetail.hidden = true;
  chooseFactionButton.disabled = true;
  factionConfirmDialog.hidden = true;
  strategyExitDialog.hidden = true;
  pauseButton.disabled = true;
  battleMessage.textContent = "SELECT FACTION";
  allyCount.textContent = "—";
  enemyCount.textContent = "—";
  allyLabel.textContent = "FACTION";
  enemyLabel.textContent = "TERRITORY";
  legendHelp.textContent = "一覧クリック / 領地クリック: 勢力を選択 / 画面端: スクロール";
  state.strategyRenderKey = null;
}

function enterBattleMode(options = {}) {
  state.mode = "battle";
  state.activeOperation = options.operation ?? null;
  state.resolvedBattleOperation = false;
  state.camera = createBattleCamera();
  clampCamera(state.camera, canvas.clientWidth, canvas.clientHeight);
  commanderPanel.hidden = false;
  unitStatusPanel.hidden = false;
  strategyPanel.hidden = true;
  strategySpotPanels.hidden = true;
  allyLabel.textContent = "ALLIES";
  enemyLabel.textContent = "ENEMIES";
  renderControlsGuide("battle");
  legendHelp.textContent = "空地左クリック: 射撃指定 / 左ドラッグ: 選択 / ホイール: 拡大縮小";
  resetBattle({
    waitForStart: options.waitForStart ?? false,
    showBriefing: options.showBriefing ?? false,
    operation: state.activeOperation,
  });
}

function transitionToBattleMode(options = {}) {
  const showBriefing = options.showBriefing ?? state.mode === "strategy";
  const isStrategyBattleTransition = state.mode === "strategy";
  if (isStrategyBattleTransition) hideStrategyHudForBattleTransition();
  runScreenTransition(() => {
    updateGameFlow(FLOW_EVENT.START_BATTLE);
    enterBattleMode({
      ...options,
      waitForStart: showBriefing ? true : options.waitForStart,
      showBriefing,
    });
  }, isStrategyBattleTransition ? {
    ...diagonalCutTransitionOptions(),
  } : {});
}

function hideStrategyHudForBattleTransition() {
  closeStrategyTransientUi();
  commanderPanel.hidden = true;
  unitStatusPanel.hidden = true;
  strategyPanel.hidden = true;
  strategySpotPanels.hidden = true;
  factionPanel.hidden = true;
  selectionBox.hidden = true;
  panelSelectionBox.hidden = true;
}

function transitionToStrategyMode() {
  runScreenTransition(() => {
    updateGameFlow(FLOW_EVENT.FINISH_BATTLE);
    clearStrategySelection();
    enterStrategyMode();
  });
}

function transitionToBattleReset() {
  runScreenTransition(() => resetBattle());
}

function resetBattle(options = {}) {
  if (!state.map) return;
  const operation = options.operation ?? null;
  state.battle = createBattle({
    width: state.map.width * state.map.tileSize,
    height: state.map.height * state.map.tileSize,
    terrainMovement: state.terrainMovement,
    alliedUnits: operation?.alliedUnits,
    enemyUnits: operation?.enemyUnits,
  });
  state.battle.explosions ??= [];
  state.started = !options.waitForStart;
  state.paused = false;
  state.selectedUnitIds.clear();
  state.selectionDrag = null;
  state.panelSelectionDrag = null;
  state.externalPanelSelectionDrag = null;
  state.strategyPanelSelectionDrag = null;
  state.commandDrag = null;
  state.hudPanelDrag = null;
  state.suppressPanelClick = false;
  battleResult.hidden = true;
  controlsDialog.hidden = true;
  selectionBox.hidden = true;
  panelSelectionBox.hidden = true;
  startScreen.hidden = state.started || options.showBriefing;
  battleBriefing.hidden = !options.showBriefing;
  if (options.showBriefing) {
    const source = strategySpot(operation?.sourceId);
    const target = strategySpot(operation?.targetId);
    const counts = teamCounts(state.battle);
    battleBriefingSummary.textContent = source && target
      ? `${source.name} → ${target.name}　味方 ${counts.ally} / 敵 ${counts.enemy}`
      : `味方 ${counts.ally} / 敵 ${counts.enemy}`;
    requestAnimationFrame(() => beginBattleButton.focus());
  }
  buildFormationPanel();
  syncPauseButton();
  syncControlModeButton();
  syncFormationStyleButton();
  battleMessage.textContent = state.started ? "ENGAGED" : "READY";
  updateHud();
}

function startBattle() {
  if (state.mode !== "battle" || state.started || state.transitioning || !controlsDialog.hidden) return;
  runScreenTransition(() => {
    state.started = true;
    state.lastTime = performance.now();
    startScreen.hidden = true;
    syncPauseButton();
    battleMessage.textContent = "ENGAGED";
    updateHud();
  });
}

function beginBriefedBattle() {
  if (state.mode !== "battle" || state.started || battleBriefing.hidden || state.transitioning) return;
  state.started = true;
  state.lastTime = performance.now();
  battleBriefing.hidden = true;
  syncPauseButton();
  battleMessage.textContent = "ENGAGED";
  updateHud();
  canvas.focus?.();
}

function diagonalCutTransitionOptions() {
  return {
    variant: "diagonal-cut",
    fadeMs: DIAGONAL_CUT_COVER_MS,
    holdMs: DIAGONAL_CUT_HOLD_MS,
    revealMs: DIAGONAL_CUT_REVEAL_MS,
  };
}

async function runScreenTransition(action, options = {}) {
  if (state.transitioning) return;
  state.transitioning = true;
  const variantClass = options.variant ? `is-${options.variant}` : "";
  if (variantClass) screenTransition.classList.add(variantClass);
  screenTransition.hidden = false;

  await nextAnimationFrame();
  screenTransition.classList.add("is-visible");
  await delay(options.fadeMs ?? SCREEN_TRANSITION_FADE_MS);
  await delay(options.holdMs ?? SCREEN_TRANSITION_HOLD_MS);

  try {
    await action();
    state.lastTime = performance.now();
  } finally {
    await nextAnimationFrame();
    screenTransition.classList.remove("is-visible");
    await delay(options.revealMs ?? options.fadeMs ?? SCREEN_TRANSITION_FADE_MS);
    if (variantClass) screenTransition.classList.remove(variantClass);
    screenTransition.hidden = true;
    state.transitioning = false;
  }
}

function delay(duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}

function nextAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function showHeaderControls() {
  showControls(headerHelpButton);
}

function showControls(returnButton = showControlsButton) {
  controlsReturnButton = returnButton;
  renderControlsGuide(state.mode === "strategy" ? "strategy" : "battle");
  controlsDialog.hidden = false;
  closeControlsButton.focus();
}

function hideControls() {
  controlsDialog.hidden = true;
  if (!controlsReturnButton?.hidden) {
    controlsReturnButton.focus();
  } else {
    canvas.focus?.();
  }
}

function renderControlsGuide(mode) {
  const guide = CONTROL_GUIDES[mode] ?? CONTROL_GUIDES.battle;
  controlsTitle.textContent = guide.title;
  controlsList.replaceChildren(...guide.items.map(([term, description]) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = description;
    row.append(dt, dd);
    return row;
  }));
}

function togglePause() {
  if (state.transitioning) return;
  if (state.mode === "strategy") {
    openEndTurnDialog();
    return;
  }
  if (!state.started || state.battle?.winner) return;
  state.paused = !state.paused;
  syncPauseButton();
  battleMessage.textContent = state.paused ? "PAUSED" : battleLabel();
}

function openEndTurnDialog() {
  if (state.strategy.phase !== "player") return;
  endTurnDialog.hidden = false;
  confirmEndTurnButton.focus();
}

function confirmEndTurn() {
  endTurnDialog.hidden = true;
  endStrategyTurn();
}

function cancelEndTurn() {
  endTurnDialog.hidden = true;
  pauseButton.focus();
}

function syncPauseButton() {
  pauseButton.textContent = state.paused ? "RESUME" : "PAUSE";
  pauseButton.disabled = !state.started || Boolean(state.battle?.winner);
  pauseButton.classList.toggle("is-active", state.paused);
  pauseButton.setAttribute("aria-pressed", String(state.paused));
}

function setControlMode(mode) {
  if (!state.battle) return;
  clearMoveOrders(state.battle);
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
  state.formationStyle = ["line", "square", "dense"].includes(style) ? style : "line";
  formationLineButton.blur();
  formationSquareButton.blur();
  formationDenseButton.blur();
  syncFormationStyleButton();
}

function syncFormationStyleButton() {
  const isLine = state.formationStyle === "line";
  const isSquare = state.formationStyle === "square";
  const isDense = state.formationStyle === "dense";
  formationLineButton.classList.toggle("is-active", isLine);
  formationSquareButton.classList.toggle("is-active", isSquare);
  formationDenseButton.classList.toggle("is-active", isDense);
  formationLineButton.setAttribute("aria-pressed", String(isLine));
  formationSquareButton.setAttribute("aria-pressed", String(isSquare));
  formationDenseButton.setAttribute("aria-pressed", String(isDense));
}

function handleKeyboard(event) {
  if (state.transitioning) {
    if (["Enter", "Space", "Escape"].includes(event.code)) event.preventDefault();
    return;
  }
  if (!titleScreen.hidden) {
    if (event.code === "Enter" && !event.repeat) {
      event.preventDefault();
      openScenarioScreen();
    }
    return;
  }
  if (!scenarioScreen.hidden) {
    if (event.code === "Enter" && !event.repeat) {
      event.preventDefault();
      startSelectedScenario();
    } else if (event.code === "Escape") {
      event.preventDefault();
      runScreenTransition(showTitleScreen);
    }
    return;
  }
  if (!controlsDialog.hidden) {
    if (event.code === "Escape") {
      event.preventDefault();
      hideControls();
    }
    return;
  }
  if (!factionConfirmDialog.hidden) {
    if (event.code === "Enter" && !event.repeat) {
      event.preventDefault();
      confirmFactionSelection();
    } else if (event.code === "Escape") {
      event.preventDefault();
      cancelFactionSelection();
    }
    return;
  }
  if (!strategyExitDialog.hidden) {
    if (event.code === "Enter" && !event.repeat) {
      event.preventDefault();
      confirmStrategyExit();
    } else if (event.code === "Escape") {
      event.preventDefault();
      cancelStrategyExit();
    }
    return;
  }
  if (!endTurnDialog.hidden) {
    if (event.code === "Enter" && !event.repeat) {
      event.preventDefault();
      confirmEndTurn();
    } else if (event.code === "Escape") {
      event.preventDefault();
      cancelEndTurn();
    }
    return;
  }
  if (state.flow.screen === FLOW_SCREEN.FACTION) {
    if (event.code === "Enter" && !event.repeat && state.selectedFactionId) {
      event.preventDefault();
      openFactionConfirmation();
    } else if (event.code === "Escape") {
      event.preventDefault();
      handleHeaderBack();
    }
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
  }
  if (!battleBriefing.hidden) {
    if (event.code === "Enter" && !event.repeat) {
      event.preventDefault();
      beginBriefedBattle();
    }
    return;
  }
  if (!invasionDialog.hidden) {
    if (event.code === "Enter" && !event.repeat) {
      event.preventDefault();
      if (state.pendingOperation) {
        confirmPendingInvasion();
      } else if (state.strategy.selectedTargetId && selectedStrategyUnits().length > 0) {
        beginInvasion();
      } else {
        dismissStrategyTargetSelectionDialog();
      }
    } else if (event.code === "Escape") {
      event.preventDefault();
      cancelPendingInvasion();
    }
    return;
  }
  if (
    state.mode === "strategy" &&
    event.code === "Enter" &&
    !event.repeat &&
    state.strategy.selectedTargetId &&
    selectedStrategyUnits().length > 0
  ) {
    event.preventDefault();
    beginInvasion();
    return;
  }
  if (event.code === "Escape") {
    if (event.target.matches?.("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    if (state.mode === "strategy") {
      clearStrategySelection();
    } else {
      selectUnitIds([]);
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
  if (state.mode === "battle" && state.started && !state.paused) updateBattle(state.battle, delta);
  updateCamera(delta);
  syncStrategyHover();
  if (isStrategyMapMode()) {
    state.strategyEffectTime = now;
    syncStrategyEffectAnimation();
  }
  if (state.mode === "battle" && now - state.lastBattleHudUpdate >= BATTLE_HUD_INTERVAL_MS) {
    updateHud();
    state.lastBattleHudUpdate = now;
  }
  render();
  requestAnimationFrame(frame);
}

function render() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (isStrategyMapMode()) {
    const renderKey = strategyRenderKey(width, height);
    if (renderKey === state.strategyRenderKey) return;
    state.strategyRenderKey = renderKey;
  } else {
    state.strategyRenderKey = null;
  }
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const camera = cameraTransform(state.camera, width, height);
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);
  ctx.imageSmoothingEnabled = false;
  if (isStrategyMapMode()) {
    drawStrategyMap();
  } else {
    ctx.drawImage(state.mapLayer, 0, 0);
    drawBattle();
    drawActiveMoveGhosts();
    drawFireTargetMarker();
    drawCommandPreview();
  }
  ctx.restore();
}

function strategyRenderKey(width, height) {
  const owners = state.strategy.spots.map(spot => spot.owner).join(",");
  const effectFrame = isStrategySpotEffectAnimating()
    ? Math.floor(strategySpotEffectProgress() * 10)
    : 0;
  return [
    width,
    height,
    state.camera.centerX,
    state.camera.centerY,
    state.camera.scale,
    state.strategy.selectedSpotId,
    state.selectedFactionId,
    state.hoveredStrategySpotId,
    owners,
    state.strategyEffectKey,
    effectFrame,
  ].join("|");
}

function syncStrategyEffectAnimation() {
  const nextKey = strategyEffectKey();
  if (nextKey === state.strategyEffectKey) return;
  state.strategyEffectKey = nextKey;
  state.strategyEffectStartedAt = state.strategyEffectTime;
}

function strategyEffectKey() {
  const hoveredFactionId = hoveredStrategyFactionId();
  if (hoveredFactionId) return `hover:${hoveredFactionId}`;
  if (state.strategy.selectedTargetId) return `source:${state.strategy.selectedTargetId}`;
  const selectedId = state.strategy.selectedSpotId;
  if (!selectedId) return "";
  const selected = strategySpot(selectedId);
  return selected ? `selected:${selected.id}:${selected.factionId}` : "";
}

function isStrategySpotEffectAnimating() {
  return Boolean(state.strategyEffectKey) && strategySpotEffectProgress() < 1;
}

function strategySpotEffectProgress() {
  const elapsed = Math.max(0, state.strategyEffectTime - state.strategyEffectStartedAt);
  return Math.min(1, elapsed / STRATEGY_SPOT_EFFECT_SLIDE_MS);
}

function drawStrategyMap() {
  ctx.drawImage(state.strategyImages.world, 0, 0, state.strategy.width, state.strategy.height);
  drawStrategyLinks();
  for (const spot of state.strategy.spots) drawStrategySpot(spot);
}

function drawStrategyLinks() {
  for (const link of state.strategy.links) {
    const from = strategySpot(link.from);
    const to = strategySpot(link.to);
    if (!from || !to) continue;
    ctx.save();
    ctx.strokeStyle = link.type === "retreat" ? "#db0814" : "#ffffff";
    ctx.lineWidth = link.type === "retreat" ? 5 : 7;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawStrategySpot(spot) {
  const image = state.strategyImages[spot.image] ?? state.strategyImages.spot;
  const hoveredFactionId = hoveredStrategyFactionId();
  const isHoveredFaction = Boolean(hoveredFactionId && spot.factionId === hoveredFactionId);
  const isSelected = !hoveredFactionId && (
    state.mode === "faction-select"
      ? Boolean(state.selectedFactionId && spot.factionId === state.selectedFactionId)
      : spot.id === state.strategy.selectedSpotId
  );
  const spotScale = strategySpotScale(spot);
  const size = SPOT_SIZE * spotScale;
  const isAttackSourceCandidate = isStrategyAttackSourceCandidate(spot);

  ctx.save();
  if (isAttackSourceCandidate) {
    drawStrategySpotEffect(image, spot, size, "source");
  } else if (isHoveredFaction) {
    drawStrategySpotEffect(image, spot, size, "hover");
  } else if (isSelected) {
    drawStrategySpotEffect(image, spot, size, "selected");
  }

  ctx.drawImage(
    image,
    spot.x - size / 2,
    spot.y - size / 2,
    size,
    size
  );

  const factionFlag = factionById(spot.factionId)?.flag;
  const flagImage = state.strategyImages[factionFlag];
  if (flagImage) {
    ctx.drawImage(
      flagImage,
      spot.x + size / 2 - STRATEGY_FLAG_SIZE / 2,
      spot.y - size / 2 - STRATEGY_FLAG_SIZE / 2,
      STRATEGY_FLAG_SIZE,
      STRATEGY_FLAG_SIZE
    );
  }

  ctx.restore();
}

function drawStrategySpotEffect(image, spot, size, effectName) {
  const effect = STRATEGY_SPOT_EFFECT;
  const color = strategyFactionMarkerColor(spot.factionId);
  const progress = easeOutCubic(strategySpotEffectProgress());
  const layerScale = 1.04 + (effect.scale - 1.04) * progress;
  const layerSize = size * layerScale;
  const x = spot.x - layerSize / 2 + effect.x * progress;
  const y = spot.y - layerSize / 2 + effect.y * progress;
  const tintedImage = strategyTintedSpotImage(image, color);

  ctx.save();
  ctx.globalAlpha = effect.alpha;
  ctx.drawImage(tintedImage, x, y, layerSize, layerSize);
  ctx.restore();

  ctx.save();
  ctx.filter = `drop-shadow(0 8px 12px ${colorWithAlpha("#000000", 0.38)})`;
  ctx.globalAlpha = effectName === "hover" ? 0.12 : 0.2;
  ctx.drawImage(image, spot.x - size / 2, spot.y - size / 2, size, size);
  ctx.restore();
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function strategyTintedSpotImage(image, color) {
  let tintedByColor = state.strategyTintedSpotImages.get(image);
  if (!tintedByColor) {
    tintedByColor = new Map();
    state.strategyTintedSpotImages.set(image, tintedByColor);
  }
  const cached = tintedByColor.get(color);
  if (cached) return cached;
  const tinted = document.createElement("canvas");
  tinted.width = image.naturalWidth || image.width;
  tinted.height = image.naturalHeight || image.height;
  const tintedContext = tinted.getContext("2d");
  tintedContext.drawImage(image, 0, 0, tinted.width, tinted.height);
  tintedContext.globalCompositeOperation = "source-in";
  tintedContext.fillStyle = color;
  tintedContext.fillRect(0, 0, tinted.width, tinted.height);
  tintedByColor.set(color, tinted);
  return tinted;
}

function strategySpotScale(spot) {
  return spot.scale ?? DEFAULT_SPOT_SCALE_BY_IMAGE[spot.image] ?? 1;
}

function hoveredStrategyFactionId() {
  return strategySpot(state.hoveredStrategySpotId)?.factionId ?? null;
}

function strategyFactionMarkerColor(factionId) {
  return STRATEGY_FACTION_MARKER_COLORS[factionId] ?? "#ffffff";
}

function colorWithAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function isStrategyAttackSourceCandidate(spot) {
  const target = strategySpot(state.strategy?.selectedTargetId);
  return Boolean(target && canInvadeTarget(spot, target));
}

function isStrategyMapMode() {
  return state.mode === "strategy" || state.mode === "faction-select";
}

function trackStrategyHover(event) {
  if (!isStrategyMapMode()) return;
  state.strategyPointer = canvasPoint(event);
}

function clearStrategyHover() {
  state.strategyPointer = null;
  if (state.hoveredStrategySpotId === null) return;
  state.hoveredStrategySpotId = null;
  canvas.classList.remove("is-territory-hover");
  state.strategyRenderKey = null;
}

function syncStrategyHover() {
  if (!isStrategyMapMode() || !state.strategyPointer) {
    if (!isStrategyMapMode()) clearStrategyHover();
    return;
  }
  const world = screenToWorld(state.strategyPointer.x, state.strategyPointer.y);
  const hoveredSpotId = strategySpotAt(world.x, world.y)?.id ?? null;
  if (hoveredSpotId === state.hoveredStrategySpotId) return;
  state.hoveredStrategySpotId = hoveredSpotId;
  canvas.classList.toggle("is-territory-hover", Boolean(hoveredSpotId));
  state.strategyRenderKey = null;
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
  const destinations = selectedFormationDestinations(drag.startX, drag.startY, angle);
  if (destinations.length === 0) return;

  ctx.save();
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

function drawFireTargetMarker() {
  const target = state.battle.fireTarget;
  if (!target) return;
  const radius = 42;

  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(target.x, target.y, radius + 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = "#db0814";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
  ctx.moveTo(target.x - radius - 18, target.y);
  ctx.lineTo(target.x - 10, target.y);
  ctx.moveTo(target.x + 10, target.y);
  ctx.lineTo(target.x + radius + 18, target.y);
  ctx.moveTo(target.x, target.y - radius - 18);
  ctx.lineTo(target.x, target.y - 10);
  ctx.moveTo(target.x, target.y + 10);
  ctx.lineTo(target.x, target.y + radius + 18);
  ctx.stroke();
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
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const normalX = Math.cos(angle + Math.PI / 2);
  const normalY = Math.sin(angle + Math.PI / 2);
  const headLength = lineWidth === 15 ? 42 : 34;
  const headWidth = lineWidth === 15 ? 34 : 24;
  const shaftHalfWidth = lineWidth / 2;
  const neckX = endX - directionX * headLength;
  const neckY = endY - directionY * headLength;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(startX + normalX * shaftHalfWidth, startY + normalY * shaftHalfWidth);
  ctx.lineTo(neckX + normalX * shaftHalfWidth, neckY + normalY * shaftHalfWidth);
  ctx.lineTo(neckX + normalX * headWidth, neckY + normalY * headWidth);
  ctx.lineTo(endX, endY);
  ctx.lineTo(neckX - normalX * headWidth, neckY - normalY * headWidth);
  ctx.lineTo(neckX - normalX * shaftHalfWidth, neckY - normalY * shaftHalfWidth);
  ctx.lineTo(startX - normalX * shaftHalfWidth, startY - normalY * shaftHalfWidth);
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
  drawUnitTypeIcon(unit, unit.x - HP_BAR_WIDTH / 2 - 18, unit.y - 78, 16);
  ctx.fillStyle = "#000000";
  ctx.fillRect(unit.x - HP_BAR_WIDTH / 2 - 2, unit.y - 74, HP_BAR_WIDTH + 4, 12);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(unit.x - HP_BAR_WIDTH / 2 - 1.5, unit.y - 73.5, HP_BAR_WIDTH + 3, 11);
  ctx.fillStyle = unit.team === "ally" ? "#ffffff" : "#db0814";
  ctx.fillRect(unit.x - HP_BAR_WIDTH / 2 + 2, unit.y - 70, (HP_BAR_WIDTH - 4) * hpRatio, 4);
}

function drawUnitTypeIcon(unit, x, y, size) {
  const teamColor = unit.team === "ally" ? "#ffffff" : "#db0814";
  const centerX = x + size / 2;
  const centerY = y + size / 2;

  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
  ctx.fillStyle = teamColor;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = unit.team === "ally" ? "#000000" : "#ffffff";
  ctx.lineWidth = 2;

  if (unit.type === "artillery") {
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4.5, 0, Math.PI * 2);
    ctx.moveTo(centerX - 7, centerY);
    ctx.lineTo(centerX + 7, centerY);
    ctx.moveTo(centerX, centerY - 7);
    ctx.lineTo(centerX, centerY + 7);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 6);
    ctx.lineTo(centerX + 6, centerY + 5);
    ctx.lineTo(centerX - 6, centerY + 5);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
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
  const viewportHeight = currentViewportHeight();
  document.documentElement.style.setProperty("--app-height", `${viewportHeight}px`);
  resizeCanvas();
}

function scheduleViewportSync() {
  syncViewportSize();
  requestAnimationFrame(syncViewportSize);
  setTimeout(syncViewportSize, 100);
  setTimeout(syncViewportSize, 300);
}

function currentViewportHeight() {
  return Math.max(
    document.documentElement.clientHeight,
    window.innerHeight,
    Math.round(window.visualViewport?.height ?? 0)
  );
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio));
  canvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio));
  state.strategyRenderKey = null;
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
  if (
    !isStrategyMapMode() &&
    (!state.started || state.battle?.winner)
  ) return;
  if (!state.camera || (!state.edgeScroll.x && !state.edgeScroll.y)) return;
  moveCamera(
    state.camera,
    state.edgeScroll.x,
    state.edgeScroll.y,
    delta,
    canvas.clientWidth,
    canvas.clientHeight,
    { edgeSpeed: isStrategyMapMode() ? STRATEGY_EDGE_SPEED : undefined }
  );
}

function zoomWithWheel(event) {
  if (isStrategyMapMode()) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const factor = Math.exp(-event.deltaY * 0.0015);
  zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
}

function startGestureZoom(event) {
  if (isStrategyMapMode()) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  state.gestureScale = state.camera.scale;
}

function changeGestureZoom(event) {
  if (isStrategyMapMode()) {
    event.preventDefault();
    return;
  }
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
  if (state.mode === "strategy") {
    updateStrategyHud();
    return;
  }
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
}

function updateBattleResult(counts) {
  const winner = state.battle.winner;
  if (!winner) {
    battleResult.hidden = true;
    return;
  }
  resolveBattleOperation(winner);

  resultTitle.textContent = winner === "ally"
    ? "ALLIED VICTORY"
    : winner === "enemy"
      ? "DEFEAT"
      : "DRAW";
  resultTitle.classList.toggle("is-defeat", winner === "enemy");
  resultAllies.textContent = counts.ally;
  resultEnemies.textContent = counts.enemy;
  resultTime.textContent = formatBattleTime(state.battle.elapsed);
  resultRestartButton.textContent = state.activeOperation ? "RETURN STRATEGY" : "RESTART BATTLE";
  battleResult.hidden = false;
}

function resolveBattleOperation(winner) {
  const operation = state.activeOperation;
  if (!operation || state.resolvedBattleOperation) return;
  state.resolvedBattleOperation = true;
  resolveStrategyBattle(state.strategy, operation, state.battle.units, winner);
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

function updateStrategySpotPanel() {
  updateStrategySpotPanels();
}

function updateStrategySpotPanels() {
  if (state.mode !== "strategy") return;
  for (const [spotId, panel] of state.strategy.openSpotPanels) {
    const spot = strategySpot(spotId);
    if (!spot) {
      panel.remove();
      state.strategy.openSpotPanels.delete(spotId);
      continue;
    }
    renderStrategySpotPanel(panel, spot);
  }
  for (const [factionId, panel] of state.strategyFactionPanels) {
    const faction = factionById(factionId);
    const spot = state.strategy.spots.find(candidate => candidate.factionId === factionId);
    if (!faction || !spot) {
      panel.remove();
      state.strategyFactionPanels.delete(factionId);
      continue;
    }
    renderStrategyFactionInfoPanel(panel, faction, spot);
  }
  syncStrategySortiePanel();
}

function openStrategySpotPanel(spot) {
  let panel = state.strategy.openSpotPanels.get(spot.id);
  const isNewPanel = !panel;
  if (!panel) {
    panel = createStrategySpotPanelElement(spot);
    state.strategy.openSpotPanels.set(spot.id, panel);
    strategySpotPanels.append(panel);
  }
  renderStrategySpotPanel(panel, spot);
  if (isNewPanel) placeNewStrategySpotPanel(panel, spot);
  bringHudPanelToFront(panel);
  return panel;
}

function openStrategyFactionInfoPanel(spot) {
  const faction = factionById(spot.factionId);
  if (!faction) return null;
  let panel = state.strategyFactionPanels.get(faction.id);
  const isNewPanel = !panel;
  if (!panel) {
    panel = createStrategyFactionInfoPanelElement(faction);
    state.strategyFactionPanels.set(faction.id, panel);
    strategySpotPanels.append(panel);
  }
  renderStrategyFactionInfoPanel(panel, faction, spot);
  if (isNewPanel) placeNewStrategyFactionPanel(panel, spot);
  bringHudPanelToFront(panel);
  return panel;
}

function createStrategyFactionInfoPanelElement(faction) {
  const panel = document.createElement("aside");
  panel.className = "strategy-faction-info-panel hud-panel";
  panel.dataset.factionId = faction.id;
  panel.setAttribute("aria-label", `${faction.name} faction information`);
  return panel;
}

function placeNewStrategyFactionPanel(panel, spot) {
  const canvasRect = canvas.getBoundingClientRect();
  const flagScreen = worldToScreen(...strategyFlagCenter(spot));
  const panelRect = panel.getBoundingClientRect();
  const gap = 14;
  const left = canvasRect.left + flagScreen.x + gap;
  const top = canvasRect.top + flagScreen.y - panelRect.height / 2;
  placeHudPanel(panel, left, top);
}

function renderStrategyFactionInfoPanel(panel, faction, spot) {
  const factionSpots = state.strategy.spots.filter(candidate => candidate.factionId === faction.id);
  const units = factionSpots.flatMap(candidate => candidate.units).filter(unit => unit.alive);
  const economy = factionSpots.reduce((sum, candidate) => sum + (candidate.economy ?? 0), 0);
  panel.replaceChildren(
    buildStrategyFactionInfoHeader(faction),
    buildStrategyFactionInfoMedia(faction),
    buildStrategyFactionInfoSummary(faction, factionSpots, units, economy),
    buildStrategyFactionInfoDescription(faction, spot)
  );
}

function buildStrategyFactionInfoHeader(faction) {
  const header = document.createElement("header");
  header.className = "unit-status-heading strategy-faction-info-heading";

  const title = document.createElement("h2");
  title.textContent = faction.name;

  const mode = document.createElement("p");
  mode.textContent = "FACTION";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "strategy-panel-close";
  close.dataset.closeFactionPanel = faction.id;
  close.setAttribute("aria-label", `${faction.name}を閉じる`);
  close.textContent = "X";

  header.append(title, mode, close);
  return header;
}

function buildStrategyFactionInfoMedia(faction) {
  const media = document.createElement("div");
  media.className = "strategy-faction-media";

  const portrait = document.createElement("img");
  portrait.className = "strategy-faction-portrait";
  portrait.src = faction.portrait ?? DEFAULT_FACTION.portrait;
  portrait.alt = `${faction.commander ?? faction.name} commander`;

  const flag = document.createElement("img");
  flag.className = "strategy-faction-flag";
  flag.src = STRATEGY_ASSET_URLS[faction.flag] ?? STRATEGY_ASSET_URLS.flag1;
  flag.alt = `${faction.name} flag`;

  const text = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "panel-kicker";
  kicker.textContent = "COMMANDER";
  const commander = document.createElement("strong");
  commander.textContent = formatCommanderName(faction.commander ?? "Unknown");
  text.append(kicker, commander);

  media.append(portrait, flag, text);
  return media;
}

function formatCommanderName(name) {
  return name.toLocaleLowerCase().replace(/^\p{L}/u, letter => letter.toLocaleUpperCase());
}

function buildStrategyFactionInfoSummary(faction, factionSpots, units, economy) {
  const summary = document.createElement("dl");
  summary.className = "strategy-spot-summary strategy-faction-summary";
  const owner = faction.id === state.strategy.playerFactionId ? "player" : "enemy";
  summary.innerHTML = `
    <div><dt>STATUS</dt><dd>${OWNER_LABELS[owner] ?? owner.toUpperCase()}</dd></div>
    <div><dt>AREAS</dt><dd>${factionSpots.length}</dd></div>
    <div><dt>UNITS</dt><dd>${units.length}</dd></div>
    <div><dt>ECONOMY</dt><dd>${economy}</dd></div>
  `;
  return summary;
}

function buildStrategyFactionInfoDescription(faction, spot) {
  const description = document.createElement("p");
  description.className = "strategy-faction-description";
  description.textContent = `${faction.description ?? ""} / ${spot.name}`;
  return description;
}

function closeStrategyFactionInfoPanel(factionId) {
  const panel = state.strategyFactionPanels.get(factionId);
  panel?.remove();
  state.strategyFactionPanels.delete(factionId);
}

function closeStrategyFactionInfoPanels() {
  for (const panel of state.strategyFactionPanels.values()) panel.remove();
  state.strategyFactionPanels.clear();
}

function createStrategySpotPanelElement(spot) {
  const panel = document.createElement("aside");
  panel.className = "strategy-spot-panel hud-panel";
  panel.dataset.spotId = spot.id;
  panel.setAttribute("aria-label", `${spot.name} unit information`);
  return panel;
}

function placeNewStrategySpotPanel(panel, spot) {
  const canvasRect = canvas.getBoundingClientRect();
  const spotScreen = worldToScreen(spot.x, spot.y);
  const panelRect = panel.getBoundingClientRect();
  const spotRadius = SPOT_HIT_RADIUS * strategySpotScale(spot) * state.camera.scale;
  const gap = 12;
  const left = canvasRect.left + spotScreen.x - panelRect.width / 2;
  const top = canvasRect.top + spotScreen.y - spotRadius - panelRect.height - gap;
  placeHudPanel(panel, left, top);
}

function syncStrategySortiePanel() {
  const target = strategySpot(state.strategy.selectedTargetId);
  if (!target) {
    closeStrategySortiePanel();
    return;
  }
  const targetPanel = state.strategy.openSpotPanels.get(target.id);
  if (!targetPanel) {
    closeStrategySortiePanel();
    return;
  }
  const panel = ensureStrategySortiePanel(target);
  renderStrategySortiePanel(panel, target);
}

function ensureStrategySortiePanel(target) {
  if (!state.strategySortiePanel) {
    const panel = document.createElement("aside");
    panel.className = "strategy-sortie-panel hud-panel";
    panel.setAttribute("aria-label", "出撃ユニット編成");
    state.strategySortiePanel = panel;
    strategySpotPanels.append(panel);
  }
  state.strategySortiePanel.dataset.targetId = target.id;
  return state.strategySortiePanel;
}

function closeStrategySortiePanel() {
  state.strategySortiePanel?.remove();
  state.strategySortiePanel = null;
}

function placeStrategySortiePanel(panel, targetPanel) {
  const gap = 10;
  const targetRect = targetPanel.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  placeHudPanel(panel, targetRect.left - panelRect.width - gap, targetRect.top);
}

function renderStrategySortiePanel(panel, target) {
  const selectedUnits = selectedStrategyUnits();
  const operation = createInvasionOperation(state.strategy, target.id);
  panel.classList.toggle("is-empty", selectedUnits.length === 0);
  panel.replaceChildren(
    buildStrategySortieHeader(target, operation),
    buildStrategySortieSummary(target, selectedUnits, operation),
    buildStrategySortieUnits(selectedUnits),
    buildStrategySortieFooter(target, operation)
  );
}

function buildStrategySortieHeader(target, operation) {
  const header = document.createElement("header");
  header.className = "unit-status-heading strategy-sortie-heading";

  const title = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "panel-kicker";
  kicker.textContent = "SORTIE";
  const heading = document.createElement("h2");
  heading.textContent = "出撃編成";
  title.append(kicker, heading);

  const launch = document.createElement("button");
  launch.type = "button";
  launch.className = "strategy-sortie-launch";
  launch.dataset.sortieLaunch = target.id;
  launch.disabled = !operation;
  launch.textContent = "出撃";

  header.append(title, launch);
  return header;
}

function buildStrategySortieSummary(target, selectedUnits, operation) {
  const summary = document.createElement("dl");
  summary.className = "strategy-spot-summary strategy-sortie-summary";
  const sourceSpots = selectedStrategySourceSpots();
  const sourceLabel = sourceSpots.length === 0
    ? "未選択"
    : sourceSpots.length === 1
      ? sourceSpots[0].name
      : `${sourceSpots.length} AREAS`;
  summary.innerHTML = `
    <div><dt>FROM</dt><dd>${sourceLabel}</dd></div>
    <div><dt>TARGET</dt><dd>${target.name}</dd></div>
    <div><dt>UNITS</dt><dd>${selectedUnits.length} / ${MAX_INVASION_UNITS}</dd></div>
    <div><dt>ENEMY</dt><dd>${operation?.enemyUnits.length ?? target.units.filter(unit => unit.alive).length}</dd></div>
  `;
  return summary;
}

function buildStrategySortieUnits(selectedUnits) {
  const body = document.createElement("div");
  body.className = "formation-panel strategy-units-panel strategy-sortie-units";
  if (selectedUnits.length === 0) {
    const empty = document.createElement("p");
    empty.className = "strategy-empty-units";
    empty.textContent = "ここに出撃ユニットをドラッグ";
    body.append(empty);
    return body;
  }

  const roleGroups = new Map();
  for (const unit of selectedUnits) {
    if (!roleGroups.has(unit.role)) roleGroups.set(unit.role, []);
    roleGroups.get(unit.role).push(unit);
  }

  for (const role of ["frontline", "rearGuard"]) {
    const units = roleGroups.get(role);
    if (!units?.length) continue;

    const roleGroup = document.createElement("section");
    roleGroup.className = "role-group";
    roleGroup.dataset.role = role;

    const heading = document.createElement("h3");
    heading.className = "role-heading";
    heading.innerHTML = `<span>${ROLE_LABELS[role]}</span><b>${units.length}</b>`;
    roleGroup.append(heading);

    const row = document.createElement("div");
    row.className = "formation-row";

    const label = document.createElement("div");
    label.className = "strategy-formation-label";
    label.textContent = "SORTIE";

    const unitList = document.createElement("div");
    unitList.className = "formation-units";
    for (const unit of units) {
      unitList.append(createStrategySortieUnitCard(unit));
    }

    row.append(label, unitList);
    roleGroup.append(row);
    body.append(roleGroup);
  }
  return body;
}

function createStrategySortieUnitCard(unit) {
  const card = createStrategyUnitCard(unit, false);
  card.classList.add("strategy-sortie-unit-card");
  card.dataset.sortieRemoveUnit = unit.id;
  card.title = "クリックで出撃編成から外す";
  return card;
}

function buildStrategySortieFooter(target, operation) {
  const footer = document.createElement("footer");
  footer.className = "strategy-sortie-footer";

  const clear = document.createElement("button");
  clear.type = "button";
  clear.dataset.sortieClear = target.id;
  clear.disabled = selectedStrategyUnits().length === 0;
  clear.textContent = "CLEAR";

  const note = document.createElement("p");
  note.textContent = operation
    ? "出撃ボタンで確認へ"
    : state.strategy.selectedSourceId
      ? "ユニットをここへドラッグ&ドロップ"
      : "隣接自領地を選択";

  footer.append(clear, note);
  return footer;
}

function renderStrategySpotPanel(panel, spot) {
  const isOwnSpot = spot.owner === "player";
  panel.dataset.owner = spot.owner;
  panel.classList.toggle("is-own-spot", isOwnSpot);
  panel.classList.toggle("is-enemy-spot", spot.owner === "enemy");
  panel.classList.toggle("is-neutral-spot", spot.owner === "neutral");
  panel.classList.toggle("is-target-spot", !isOwnSpot);
  panel.replaceChildren(
    buildStrategySpotPanelHeader(spot, isOwnSpot),
    buildStrategySpotSummary(spot, isOwnSpot),
    buildStrategyHireActions(spot, isOwnSpot),
    buildStrategySpotUnits(spot),
    buildStrategyPanelSelectionBox()
  );
}

function buildStrategySpotPanelHeader(spot, isOwnSpot) {
  const header = document.createElement("header");
  header.className = "unit-status-heading";

  const title = document.createElement("h2");
  title.textContent = spot.name;

  const mode = document.createElement("p");
  mode.textContent = isOwnSpot ? "HIRE / SELECT" : "INTEL";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "strategy-panel-close";
  close.dataset.closeSpotPanel = spot.id;
  close.setAttribute("aria-label", `${spot.name}を閉じる`);
  close.textContent = "X";

  header.append(title, mode, close);
  return header;
}

function buildStrategySpotSummary(spot, isOwnSpot) {
  const summary = document.createElement("dl");
  summary.className = "strategy-spot-summary";
  summary.innerHTML = `
    <div>
      <dt>OWNER</dt>
      <dd>${OWNER_LABELS[spot.owner] ?? spot.owner.toUpperCase()}</dd>
    </div>
    <div>
      <dt>ECONOMY</dt>
      <dd>${String(spot.economy)}</dd>
    </div>
    <div>
      <dt>FUNDS</dt>
      <dd>${isOwnSpot ? String(state.strategy.funds.player) : "-"}</dd>
    </div>
  `;
  return summary;
}

function buildStrategyHireActions(spot, isOwnSpot) {
  const actions = document.createElement("div");
  actions.className = "strategy-hire-actions";
  actions.hidden = !isOwnSpot;
  if (!isOwnSpot) return actions;

  const fragment = document.createDocumentFragment();
  for (const unitType of ["tank", "artillery"]) {
    const catalog = STRATEGY_UNIT_CATALOG[unitType];
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.hireUnit = unitType;
    button.dataset.spotId = spot.id;
    button.disabled = state.strategy.funds.player < catalog.cost ||
      !canHireStrategyUnit(state.strategy, spot.id, unitType);

    const image = document.createElement("img");
    image.src = unitImageSrc({ team: "ally", type: catalog.type });
    image.alt = "";

    const label = document.createElement("span");
    label.textContent = catalog.label;

    const cost = document.createElement("b");
    cost.textContent = String(catalog.cost);

    button.append(image, label, cost);
    fragment.append(button);
  }
  actions.append(fragment);
  return actions;
}

function buildStrategySpotUnits(spot) {
  const units = spot.units;
  const isOwnSpot = spot.owner === "player";
  const availableUnitIds = units
    .filter(unit => canSelectStrategyUnit(unit))
    .map(unit => unit.id);
  const roleGroups = new Map();
  for (const unit of units) {
    if (!roleGroups.has(unit.role)) roleGroups.set(unit.role, new Map());
    const formations = roleGroups.get(unit.role);
    if (!formations.has(unit.formationId)) formations.set(unit.formationId, []);
    formations.get(unit.formationId).push(unit);
  }

  const fragment = document.createDocumentFragment();
  if (isOwnSpot && units.some(unit => unit.alive)) {
    fragment.append(buildStrategyUnitSelectionActions(spot, availableUnitIds));
  }
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

    for (const unitsInFormation of formations.values()) {
      const row = document.createElement("div");
      row.className = "formation-row";

      const label = document.createElement(isOwnSpot ? "button" : "div");
      label.className = isOwnSpot ? "formation-select strategy-formation-label" : "strategy-formation-label";
      if (isOwnSpot) {
        label.type = "button";
        label.dataset.strategyFormation = unitsInFormation[0].formationId;
        label.dataset.spotId = spot.id;
        const ids = unitsInFormation
          .filter(unit => canSelectStrategyUnit(unit))
          .map(unit => unit.id);
        label.classList.toggle("is-selected", isEntireStrategyGroupSelected(ids));
        label.disabled = ids.length === 0;
      }
      label.textContent = TYPE_LABELS[unitsInFormation[0].type] ?? "FORMATION";

      const unitList = document.createElement("div");
      unitList.className = "formation-units";
      for (const unit of unitsInFormation) {
        unitList.append(createStrategyUnitCard(unit, isOwnSpot));
      }
      row.append(label, unitList);
      roleGroup.append(row);
    }
    fragment.append(roleGroup);
  }

  if (fragment.childNodes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "strategy-empty-units";
    empty.textContent = "NO UNITS";
    fragment.append(empty);
  }
  const panel = document.createElement("div");
  panel.className = "formation-panel strategy-units-panel";
  panel.append(fragment);
  return panel;
}

function buildStrategyUnitSelectionActions(spot, availableUnitIds) {
  const actions = document.createElement("div");
  actions.className = "strategy-unit-actions";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.dataset.strategySelectScope = "all";
  allButton.dataset.spotId = spot.id;
  allButton.classList.toggle("is-selected", isEntireStrategyGroupSelected(availableUnitIds));
  allButton.disabled = availableUnitIds.length === 0;
  allButton.textContent = "ALL UNITS";

  const count = document.createElement("b");
  count.textContent = String(availableUnitIds.length);

  actions.append(allButton, count);
  return actions;
}

function buildStrategyPanelSelectionBox() {
  const selectionBox = document.createElement("div");
  selectionBox.className = "panel-selection-box strategy-panel-selection-box";
  selectionBox.hidden = true;
  return selectionBox;
}

function createStrategyUnitCard(unit, selectable) {
  const card = document.createElement(selectable ? "button" : "div");
  card.className = "unit-card strategy-unit-card";
  const canSelect = selectable && canSelectStrategyUnit(unit);
  if (selectable) {
    card.type = "button";
    card.dataset.strategyUnit = unit.id;
    card.dataset.spotId = unit.spotId;
    card.disabled = !canSelect;
    card.setAttribute(
      "aria-label",
      canSelect
        ? `${TYPE_LABELS[unit.type] ?? "UNIT"}を作戦部隊に選択`
        : `${TYPE_LABELS[unit.type] ?? "UNIT"}は次のターンまで出撃できません`
    );
    if (!canSelect) card.title = "次のターンまで出撃できません";
  }
  card.classList.toggle("is-selected", state.strategy.selectedUnitIds.has(unit.id));
  card.classList.toggle("is-destroyed", !unit.alive);
  card.classList.toggle("is-waiting", unit.alive && !isStrategyUnitActionAvailable(state.strategy, unit));

  const image = document.createElement("img");
  image.src = unitImageSrc(unit);
  image.alt = "";

  const hp = document.createElement("span");
  hp.className = "unit-card-hp";
  const hpFill = document.createElement("i");
  hpFill.style.width = `${Math.max(0, (unit.hp / unit.maxHp) * 100)}%`;
  hp.append(hpFill);

  card.append(image, hp);
  if (unit.alive && !isStrategyUnitActionAvailable(state.strategy, unit)) {
    const wait = document.createElement("span");
    wait.className = "unit-card-wait";
    wait.textContent = "WAIT";
    card.append(wait);
  }
  return card;
}

function canSelectStrategyUnit(unit) {
  const spot = strategySpot(unit.spotId);
  return Boolean(
    spot &&
    canSelectStrategySpotUnits(spot) &&
    isStrategyUnitActionAvailable(state.strategy, unit)
  );
}

function unitImageSrc(unit) {
  if (unit.team === "enemy") return ASSET_URLS.enemy;
  return unit.type === "artillery" ? ASSET_URLS.allyArtillery : ASSET_URLS.ally;
}

function hireStrategyUnit(event) {
  const button = event.target.closest("[data-hire-unit]");
  if (!button) return;
  const unit = hireUnit(state.strategy, button.dataset.spotId, button.dataset.hireUnit);
  if (!unit) return;
  updateStrategyHud();
  updateStrategySpotPanels();
}

function handleStrategySpotPanelClick(event) {
  if (state.suppressPanelClick) return;
  const factionPanel = event.target.closest(".strategy-faction-info-panel");
  if (factionPanel) bringHudPanelToFront(factionPanel);

  const closeFactionButton = event.target.closest("[data-close-faction-panel]");
  if (closeFactionButton) {
    closeStrategyFactionInfoPanel(closeFactionButton.dataset.closeFactionPanel);
    return;
  }

  const panel = event.target.closest(".strategy-spot-panel");
  if (panel) bringHudPanelToFront(panel);

  const sortiePanel = event.target.closest(".strategy-sortie-panel");
  if (sortiePanel) {
    bringHudPanelToFront(sortiePanel);
    handleStrategySortiePanelClick(event);
    return;
  }

  const closeButton = event.target.closest("[data-close-spot-panel]");
  if (closeButton) {
    closeStrategySpotPanel(closeButton.dataset.closeSpotPanel);
    return;
  }

  const hireButton = event.target.closest("[data-hire-unit]");
  if (hireButton) {
    hireStrategyUnit(event);
    return;
  }

  const formationButton = event.target.closest("[data-strategy-formation]");
  if (formationButton) {
    if (state.strategy.selectedTargetId) {
      state.strategy.message = STRATEGY_MESSAGE_DRAG_UNITS;
      updateStrategyHud();
      return;
    }
    toggleStrategyFormationSelection(
      formationButton.dataset.spotId,
      formationButton.dataset.strategyFormation
    );
    return;
  }

  const selectScopeButton = event.target.closest("[data-strategy-select-scope='all']");
  if (selectScopeButton) {
    if (state.strategy.selectedTargetId) {
      state.strategy.message = STRATEGY_MESSAGE_DRAG_UNITS;
      updateStrategyHud();
      return;
    }
    toggleStrategySelectionBy(
      selectScopeButton.dataset.spotId,
      () => true,
      Boolean(state.strategy.selectedTargetId)
    );
    return;
  }

  const button = event.target.closest("[data-strategy-unit]");
  if (!button) return;
  if (state.strategy.selectedTargetId) {
    state.strategy.message = STRATEGY_MESSAGE_DRAG_UNITS;
    updateStrategyHud();
    return;
  }
  handleStrategyUnitSelection(button, true);
}

function handleStrategySortiePanelClick(event) {
  const launchButton = event.target.closest("[data-sortie-launch]");
  if (launchButton) {
    beginInvasion(launchButton.dataset.sortieLaunch);
    return;
  }

  const removeButton = event.target.closest("[data-sortie-remove-unit]");
  if (removeButton) {
    state.strategy.selectedUnitIds.delete(removeButton.dataset.sortieRemoveUnit);
    state.strategy.message = strategySelectionMessage();
    updateStrategyHud();
    updateStrategySpotPanels();
    return;
  }

  const clearButton = event.target.closest("[data-sortie-clear]");
  if (clearButton) {
    state.strategy.selectedUnitIds.clear();
    state.strategy.message = strategySelectionMessage();
    updateStrategyHud();
    updateStrategySpotPanels();
  }
}

function handleStrategySpotPanelContextMenu(event) {
  const factionPanel = event.target.closest(".strategy-faction-info-panel");
  if (factionPanel) {
    event.preventDefault();
    closeStrategyFactionInfoPanel(factionPanel.dataset.factionId);
    return;
  }

  const panel = event.target.closest(".strategy-spot-panel");
  if (!panel) return;
  event.preventDefault();
  bringHudPanelToFront(panel);
  const spot = strategySpot(panel.dataset.spotId);
  if (state.mode === "strategy" && spot?.owner !== "player") {
    selectStrategyAttackTarget(spot);
    return;
  }
  closeStrategySpotPanel(panel.dataset.spotId);
}

function closeStrategySpotPanel(spotId) {
  const panel = state.strategy.openSpotPanels.get(spotId);
  if (panel) panel.remove();
  state.strategy.openSpotPanels.delete(spotId);
  const closesTargetPanel = state.strategy.selectedTargetId === spotId;
  if (state.strategy.selectedSpotId === spotId) state.strategy.selectedSpotId = null;
  if (state.strategy.selectedSourceId === spotId) {
    state.strategy.selectedSourceId = null;
  }
  removeSelectedStrategyUnitsFromSpot(spotId);
  if (closesTargetPanel) {
    state.strategy.selectedTargetId = null;
    state.strategy.selectedUnitIds.clear();
    state.pendingOperation = null;
    invasionDialog.hidden = true;
    state.strategyRenderKey = null;
  }
  state.strategy.message = state.strategy.selectedTargetId
    ? strategySelectionMessage()
    : STRATEGY_MESSAGE_SELECT_TARGET;
  updateStrategyHud();
  updateStrategySpotPanels();
}

function handleStrategyUnitSelection(button, additive = true) {
  const spot = strategySpot(button.dataset.spotId);
  if (!spot || spot.owner !== "player") return;
  const unit = spot.units.find(candidate => candidate.id === button.dataset.strategyUnit);
  if (!unit || !canSelectStrategyUnit(unit)) return;

  toggleStrategyUnitSelection(spot.id, [unit.id], additive);
}

function toggleStrategySelectionBy(spotId, predicate, additive = true) {
  const spot = strategySpot(spotId);
  if (!spot || !canSelectStrategySpotUnits(spot)) return;
  const ids = spot.units
    .filter(unit => canSelectStrategyUnit(unit) && predicate(unit))
    .map(unit => unit.id);
  toggleStrategyUnitSelection(spot.id, ids, additive);
}

function toggleStrategyFormationSelection(spotId, formationId) {
  const spot = strategySpot(spotId);
  if (!spot || !canSelectStrategySpotUnits(spot)) return;
  if (!state.strategy.selectedTargetId && state.strategy.selectedSourceId !== spot.id) {
    state.strategy.selectedUnitIds.clear();
    state.strategy.selectedSourceId = spot.id;
  }
  state.strategy.selectedSourceId = spot.id;

  const ids = spot.units
    .filter(unit => canSelectStrategyUnit(unit) && unit.formationId === formationId)
    .map(unit => unit.id);
  if (ids.length === 0) return;

  if (isEntireStrategyGroupSelected(ids)) {
    for (const id of ids) state.strategy.selectedUnitIds.delete(id);
  } else {
    addStrategyUnitIdsWithinLimit(ids);
  }

  state.strategy.selectedSpotId = spot.id;
  state.strategy.message = strategySelectionMessage();
  updateStrategyHud();
  updateStrategySpotPanels();
}

function toggleStrategyUnitSelection(spotId, ids, additive = true) {
  const spot = strategySpot(spotId);
  if (!spot || !canSelectStrategySpotUnits(spot)) return;
  if (!state.strategy.selectedTargetId && state.strategy.selectedSourceId !== spot.id) {
    state.strategy.selectedUnitIds.clear();
    state.strategy.selectedSourceId = spot.id;
  }
  state.strategy.selectedSourceId = spot.id;

  const eligible = new Set(spot.units.filter(unit => canSelectStrategyUnit(unit)).map(unit => unit.id));
  const nextIds = ids.filter(id => eligible.has(id));
  if (!additive && isEntireStrategyGroupSelected(nextIds)) {
    state.strategy.selectedUnitIds.clear();
    state.strategy.message = state.strategy.selectedTargetId
      ? STRATEGY_MESSAGE_DRAG_UNITS
      : STRATEGY_MESSAGE_SELECT_TARGET;
    updateStrategyHud();
    updateStrategySpotPanels();
    return;
  }

  if (!additive) state.strategy.selectedUnitIds.clear();
  for (const unitId of nextIds) {
    if (additive && state.strategy.selectedUnitIds.has(unitId)) {
      state.strategy.selectedUnitIds.delete(unitId);
    } else {
      addStrategyUnitIdsWithinLimit([unitId]);
    }
  }
  state.strategy.selectedSpotId = spot.id;
  state.strategy.message = strategySelectionMessage();
  updateStrategyHud();
  updateStrategySpotPanels();
}

function isEntireStrategyGroupSelected(ids) {
  return ids.length > 0 && ids.every(id => state.strategy.selectedUnitIds.has(id));
}

function selectStrategyUnitIds(spotId, ids, additive = false) {
  const spot = strategySpot(spotId);
  if (!spot || !canSelectStrategySpotUnits(spot)) return;
  if (!state.strategy.selectedTargetId && state.strategy.selectedSourceId !== spot.id) {
    state.strategy.selectedUnitIds.clear();
    state.strategy.selectedSourceId = spot.id;
  }
  state.strategy.selectedSourceId = spot.id;
  const eligible = new Set(spot.units.filter(unit => canSelectStrategyUnit(unit)).map(unit => unit.id));
  const nextIds = ids.filter(id => eligible.has(id));
  if (!additive) state.strategy.selectedUnitIds.clear();
  for (const id of nextIds) {
    if (additive && state.strategy.selectedUnitIds.has(id)) {
      state.strategy.selectedUnitIds.delete(id);
    } else {
      addStrategyUnitIdsWithinLimit([id]);
    }
  }
  state.strategy.selectedSpotId = spot.id;
  state.strategy.message = strategySelectionMessage();
  updateStrategyHud();
  updateStrategySpotPanels();
}

function canSelectStrategySpotUnits(spot) {
  if (!spot || spot.owner !== "player") return false;
  const target = strategySpot(state.strategy.selectedTargetId);
  if (!target) return true;
  return canInvadeTarget(spot, target);
}

function addStrategyUnitIdsWithinLimit(ids) {
  for (const id of ids) {
    if (state.strategy.selectedUnitIds.has(id)) continue;
    if (state.strategy.selectedUnitIds.size >= MAX_INVASION_UNITS) {
      state.strategy.message = `一度の戦闘に参加できる部隊は${MAX_INVASION_UNITS}部隊までです`;
      break;
    }
    state.strategy.selectedUnitIds.add(id);
  }
}

function removeSelectedStrategyUnitsFromSpot(spotId) {
  const spot = strategySpot(spotId);
  if (!spot) return;
  const ids = new Set(spot.units.map(unit => unit.id));
  for (const id of ids) state.strategy.selectedUnitIds.delete(id);
}

function strategySelectionMessage() {
  if (state.strategy.selectedUnitIds.size >= MAX_INVASION_UNITS) {
    return `最大${MAX_INVASION_UNITS}部隊を選択中です。出撃ボタンで確認`;
  }
  if (state.strategy.selectedUnitIds.size > 0) {
    return state.strategy.selectedTargetId
      ? "出撃編成パネルの出撃ボタンで確認します"
      : STRATEGY_MESSAGE_SELECT_TARGET;
  }
  if (!state.strategy.selectedTargetId) return STRATEGY_MESSAGE_SELECT_TARGET;
  return state.strategy.selectedSourceId
    ? STRATEGY_MESSAGE_DRAG_UNITS
    : STRATEGY_MESSAGE_SELECT_SOURCE;
}

function selectedStrategyUnits() {
  return getSelectedStrategyUnits(state.strategy);
}

function syncStrategySelectedForces() {
  const selectedUnits = selectedStrategyUnits();
  strategySelectedForces.hidden = selectedUnits.length === 0;
  if (selectedUnits.length === 0) {
    strategySelectedForces.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();
  const label = document.createElement("span");
  label.textContent = "SELECTED";
  fragment.append(label);
  for (const unit of selectedUnits.slice(0, 8)) {
    const image = document.createElement("img");
    image.src = unitImageSrc(unit);
    image.alt = "";
    fragment.append(image);
  }
  const count = document.createElement("b");
  count.textContent = String(selectedUnits.length);
  fragment.append(count);
  strategySelectedForces.replaceChildren(fragment);
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

function startStrategyPanelSelection(event) {
  if (event.button !== 0 || state.mode !== "strategy") return;
  if (event.target.closest("[data-hire-unit], [data-close-spot-panel], [data-sortie-launch], [data-sortie-remove-unit], [data-sortie-clear]")) return;
  const panel = event.target.closest(".strategy-spot-panel");
  const unitsPanel = event.target.closest(".strategy-units-panel");
  if (!panel || !unitsPanel) return;
  const spot = strategySpot(panel.dataset.spotId);
  if (!spot || !canSelectStrategySpotUnits(spot)) return;
  const allButton = event.target.closest("[data-strategy-select-scope='all']");
  if (allButton) {
    const ids = spot.units.filter(unit => canSelectStrategyUnit(unit)).map(unit => unit.id);
    if (ids.length === 0) return;
    startStrategyForceDrag(event, panel, {
      type: "all",
      spotId: spot.id,
      unitIds: ids,
    });
    return;
  }
  const formationButton = event.target.closest("[data-strategy-formation]");
  if (formationButton) {
    const units = spot.units.filter(unit =>
      canSelectStrategyUnit(unit) &&
      unit.formationId === formationButton.dataset.strategyFormation
    );
    if (units.length > 0) {
      startStrategyForceDrag(event, panel, {
        type: "formation",
        spotId: spot.id,
        formationId: formationButton.dataset.strategyFormation,
        unitIds: units.map(unit => unit.id),
      });
    }
    return;
  }
  const unitButton = event.target.closest("[data-strategy-unit]");
  if (unitButton) {
    startStrategyForceDrag(event, panel, {
      type: "unit",
      spotId: spot.id,
      unitId: unitButton.dataset.strategyUnit,
      unitIds: [unitButton.dataset.strategyUnit],
    });
    return;
  }
  if (state.strategy.selectedTargetId) {
    state.strategy.message = STRATEGY_MESSAGE_DRAG_UNITS;
    updateStrategyHud();
    return;
  }
  const selectionBox = panel.querySelector(".strategy-panel-selection-box");
  state.strategyPanelSelectionDrag = {
    pointerId: event.pointerId,
    panel,
    spotId: spot.id,
    selectionBox,
    unitId: unitButton?.dataset.strategyUnit ?? null,
    startClientX: event.clientX,
    startClientY: event.clientY,
    currentClientX: event.clientX,
    currentClientY: event.clientY,
    additive: true,
    moved: false,
  };
  bringHudPanelToFront(panel);
  clearEdgeScroll();
  panel.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updateStrategyPanelSelection(event) {
  const drag = state.strategyPanelSelectionDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.currentClientX = event.clientX;
  drag.currentClientY = event.clientY;
  drag.moved ||= Math.hypot(
    event.clientX - drag.startClientX,
    event.clientY - drag.startClientY
  ) >= 5;
  if (drag.moved) updateStrategyPanelSelectionBox(drag);
  event.preventDefault();
}

function finishStrategyPanelSelection(event) {
  const drag = state.strategyPanelSelectionDrag;
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
    selectStrategyUnitIds(
      drag.spotId,
      strategyUnitCardsInClientBounds(drag.panel, bounds),
      drag.additive
    );
  } else {
    selectStrategyUnitIds(drag.spotId, drag.unitId ? [drag.unitId] : [], drag.additive);
  }
  state.suppressPanelClick = true;
  setTimeout(() => {
    state.suppressPanelClick = false;
  }, 0);
  event.preventDefault();
  cancelStrategyPanelSelection(event);
}

function cancelStrategyPanelSelection(event) {
  const drag = state.strategyPanelSelectionDrag;
  if (!drag) return;
  if (event?.pointerId != null) drag.panel.releasePointerCapture?.(event.pointerId);
  drag.selectionBox.hidden = true;
  state.strategyPanelSelectionDrag = null;
}

function updateStrategyPanelSelectionBox(drag) {
  const panelRect = drag.panel.getBoundingClientRect();
  const bounds = normalizedBounds(
    drag.startClientX - panelRect.left,
    drag.startClientY - panelRect.top,
    drag.currentClientX - panelRect.left,
    drag.currentClientY - panelRect.top
  );
  drag.selectionBox.hidden = false;
  drag.selectionBox.style.left = `${bounds.left}px`;
  drag.selectionBox.style.top = `${bounds.top}px`;
  drag.selectionBox.style.width = `${bounds.right - bounds.left}px`;
  drag.selectionBox.style.height = `${bounds.bottom - bounds.top}px`;
}

function strategyUnitCardsInClientBounds(panel, bounds) {
  const ids = [];
  for (const card of panel.querySelectorAll("[data-strategy-unit]")) {
    if (card.disabled) continue;
    const rect = card.getBoundingClientRect();
    if (
      rect.right >= bounds.left &&
      rect.left <= bounds.right &&
      rect.bottom >= bounds.top &&
      rect.top <= bounds.bottom
    ) {
      ids.push(card.dataset.strategyUnit);
    }
  }
  return ids;
}

function startHudPanelDrag(event) {
  if (event.button !== 0) return;
  if (event.target.closest?.("button")) return;
  const panel = event.currentTarget;
  const strategySpotPanel = event.target.closest?.(".strategy-spot-panel");
  const strategySortiePanel = event.target.closest?.(".strategy-sortie-panel");
  const strategyFactionPanel = event.target.closest?.(".strategy-faction-info-panel");
  let captureElement = panel;
  if (strategySpotPanel || strategySortiePanel || strategyFactionPanel) {
    const isSelectionSurface = event.target.closest?.(
      ".strategy-units-panel, .strategy-hire-actions"
    );
    if (isSelectionSurface) return;
    captureElement = event.currentTarget;
  }
  const dragPanel = strategySpotPanel ?? strategySortiePanel ?? strategyFactionPanel ?? panel;
  state.hudPanelDrag = {
    pointerId: event.pointerId,
    panel: dragPanel,
    captureElement,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startLeft: dragPanel.getBoundingClientRect().left,
    startTop: dragPanel.getBoundingClientRect().top,
    moved: false,
  };
  bringHudPanelToFront(dragPanel);
  captureElement.setPointerCapture?.(event.pointerId);
  event.preventDefault();
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
  if (event?.pointerId != null) drag.captureElement?.releasePointerCapture?.(event.pointerId);
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
  panel.style.transform = "none";
}

function bringHudPanelToFront(panel) {
  const currentZIndex = Number.parseInt(getComputedStyle(panel).zIndex, 10);
  const panelZIndex = Number.isFinite(currentZIndex) ? currentZIndex : 0;
  state.nextHudPanelZIndex = Math.max(state.nextHudPanelZIndex, panelZIndex);
  state.nextHudPanelZIndex += 1;
  panel.style.zIndex = String(state.nextHudPanelZIndex);
}

function showInvasionDialog() {
  state.nextHudPanelZIndex = Math.max(state.nextHudPanelZIndex, INVASION_DIALOG_FRONT_Z_INDEX);
  bringHudPanelToFront(invasionDialog);
  invasionDialog.hidden = false;
}

function startExternalPanelSelection(event) {
  if (
    state.mode !== "battle" ||
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
    state.mode !== "battle" ||
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
  const destinations = selectedFormationDestinations(drag.startX, drag.startY, angle);
  if (destinations.length > 0) {
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

function selectedFormationDestinations(centerX, centerY, angle) {
  const units = selectedLivingAllies();
  return buildFormationDestinations({
    centerX,
    centerY,
    angle,
    units,
    style: state.formationStyle,
  });
}

function selectedLivingAllies() {
  return state.battle.units.filter(unit =>
    unit.team === "ally" &&
    unit.alive &&
    state.selectedUnitIds.has(unit.id)
  );
}

function startStrategyForceDrag(event, captureElement = strategySelectedForces, clickToggle = null) {
  if (event.button !== 0 || state.mode !== "strategy" || state.strategy.phase !== "player") return;
  const units = selectedStrategyUnits();
  if (units.length === 0 && !clickToggle) return;
  state.strategyForceDrag = {
    pointerId: event.pointerId,
    captureElement,
    clickToggle,
    previousSelectedUnitIds: new Set(state.strategy.selectedUnitIds),
    startClientX: event.clientX,
    startClientY: event.clientY,
    currentClientX: event.clientX,
    currentClientY: event.clientY,
    ghost: null,
    moved: false,
  };
  captureElement.setPointerCapture?.(event.pointerId);
  strategySelectedForces.classList.add("is-dragging");
  for (const unit of units) {
    const card = document.querySelector(`[data-strategy-unit="${CSS.escape(unit.id)}"]`);
    card?.classList.add("is-dragging");
  }
  clearEdgeScroll();
  event.preventDefault();
}

function updateStrategyForceDrag(event) {
  const drag = state.strategyForceDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.currentClientX = event.clientX;
  drag.currentClientY = event.clientY;
  drag.moved ||= Math.hypot(
    event.clientX - drag.startClientX,
    event.clientY - drag.startClientY
  ) >= 4;
  if (drag.moved) prepareStrategyForceDragSelection(drag);
  if (drag.moved && !drag.ghost) {
    drag.ghost = createStrategyDragGhost(selectedStrategyUnits());
    document.body.append(drag.ghost);
  }
  const sortiePanel = strategySortieDropPanelAt(event);
  if (drag.ghost) {
    drag.ghost.classList.toggle("is-valid", Boolean(sortiePanel));
    drag.ghost.style.transform = `translate3d(${event.clientX + 18}px, ${event.clientY + 18}px, 0)`;
  }
  for (const panel of state.strategy.openSpotPanels.values()) {
    panel.classList.remove("is-drop-hover");
  }
  state.strategySortiePanel?.classList.toggle("is-drop-hover", Boolean(sortiePanel));
  event.preventDefault();
}

function prepareStrategyForceDragSelection(drag) {
  if (drag.selectionPrepared || !drag.clickToggle) return;
  const unitIds = drag.clickToggle.unitIds ?? [];
  if (unitIds.length === 0) return;
  const additive = drag.clickToggle.type !== "all";
  selectStrategyUnitIds(drag.clickToggle.spotId, unitIds, additive);
  drag.selectionPrepared = true;
}

function createStrategyDragGhost(units) {
  const ghost = document.createElement("div");
  ghost.className = "strategy-drag-ghost";
  ghost.setAttribute("aria-hidden", "true");

  for (const unit of units.slice(0, 3)) {
    const image = document.createElement("img");
    image.src = unitImageSrc(unit);
    image.alt = "";
    ghost.append(image);
  }

  const count = document.createElement("b");
  count.textContent = `×${units.length}`;
  ghost.append(count);
  return ghost;
}

function finishStrategyForceDrag(event) {
  const drag = state.strategyForceDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.moved) {
    const clickToggle = drag.clickToggle;
    cancelStrategyForceDrag(event);
    if (clickToggle) {
      state.strategy.message = STRATEGY_MESSAGE_DRAG_UNITS;
      updateStrategyHud();
    }
    suppressNextStrategyPanelClick();
    event.preventDefault();
    return;
  }
  const sortiePanel = strategySortieDropPanelAt(event);
  const previousSelectedUnitIds = drag.previousSelectedUnitIds;
  const clickToggle = drag.clickToggle;
  cancelStrategyForceDrag(event);
  suppressNextStrategyPanelClick();
  if (sortiePanel) {
    state.strategy.message = strategySelectionMessage();
    updateStrategyHud();
    updateStrategySpotPanels();
    bringHudPanelToFront(state.strategySortiePanel);
    event.preventDefault();
    return;
  }
  if (clickToggle) {
    state.strategy.selectedUnitIds = new Set(previousSelectedUnitIds);
    state.strategy.message = STRATEGY_MESSAGE_DRAG_UNITS;
    updateStrategyHud();
    updateStrategySpotPanels();
  }
  event.preventDefault();
}

function suppressNextStrategyPanelClick() {
  state.suppressPanelClick = true;
  setTimeout(() => {
    state.suppressPanelClick = false;
  }, 0);
}

function cancelStrategyForceDrag(event) {
  const drag = state.strategyForceDrag;
  if (drag && event?.pointerId != null) {
    drag.captureElement?.releasePointerCapture?.(event.pointerId);
  }
  drag?.ghost?.remove();
  state.strategyForceDrag = null;
  strategySelectedForces.classList.remove("is-dragging");
  for (const card of document.querySelectorAll(".strategy-unit-card.is-dragging")) {
    card.classList.remove("is-dragging");
  }
  for (const panel of state.strategy.openSpotPanels.values()) {
    panel.classList.remove("is-drop-hover");
  }
  state.strategySortiePanel?.classList.remove("is-drop-hover");
}

function invasionDropPanelAt(event) {
  if (state.mode !== "strategy") return null;
  if (selectedStrategyUnits().length === 0) return null;
  const panel = document
    .elementsFromPoint(event.clientX, event.clientY)
    .find(element => element.classList?.contains("strategy-spot-panel"));
  if (!panel) return null;
  const target = strategySpot(panel.dataset.spotId);
  if (!target || target.id !== state.strategy.selectedTargetId) return null;
  return createInvasionOperation(state.strategy, target?.id) ? panel : null;
}

function strategySortieDropPanelAt(event) {
  if (state.mode !== "strategy") return null;
  if (!state.strategy.selectedTargetId || selectedStrategyUnits().length === 0) return null;
  const panel = document
    .elementsFromPoint(event.clientX, event.clientY)
    .find(element => element.classList?.contains("strategy-sortie-panel"));
  return panel ?? null;
}

function beginInvasion(targetId = state.strategy.selectedTargetId) {
  const operation = createInvasionOperation(state.strategy, targetId);
  if (!operation) return;
  state.pendingOperation = operation;
  const sources = operation.sourceIds.map(sourceId => strategySpot(sourceId)).filter(Boolean);
  const target = strategySpot(operation.targetId);
  invasionTitle.textContent = `${target.name}へ侵攻しますか？`;
  const sourceLabel = sources.length === 1
    ? sources[0].name
    : `${sources.length}領地`;
  invasionActions.classList.remove("is-single");
  confirmInvasionButton.hidden = false;
  confirmInvasionButton.disabled = false;
  cancelInvasionButton.textContent = "キャンセル";
  invasionSummary.textContent = `${sourceLabel} → ${target.name}　味方 ${operation.alliedUnits.length} / 敵 ${operation.enemyUnits.length}`;
  showInvasionDialog();
  confirmInvasionButton.focus();
}

function confirmPendingInvasion() {
  const operation = state.pendingOperation;
  if (!operation || state.transitioning) return;
  state.pendingOperation = null;
  invasionDialog.hidden = true;
  transitionToBattleMode({ operation, waitForStart: true, showBriefing: true });
}

function handleInvasionSecondaryAction() {
  if (state.pendingOperation) {
    cancelPendingInvasion();
    return;
  }
  dismissStrategyTargetSelectionDialog();
}

function cancelPendingInvasion() {
  const hadPendingOperation = Boolean(state.pendingOperation);
  state.pendingOperation = null;
  invasionDialog.hidden = true;
  invasionActions.classList.remove("is-single");
  if (!hadPendingOperation) {
    state.strategy.selectedTargetId = null;
    state.strategy.selectedUnitIds.clear();
    state.strategyRenderKey = null;
    state.strategy.message = "侵攻先の選択を解除しました";
  } else {
    state.strategy.message = "侵攻を中止しました";
  }
  updateStrategyHud();
  updateStrategySpotPanels();
}

function dismissStrategyTargetSelectionDialog() {
  invasionDialog.hidden = true;
}

function startMapSelection(event) {
  if (isStrategyMapMode()) {
    startStrategySelection(event);
    return;
  }
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
    if (unit) {
      selectUnitIds([unit.id], drag.additive);
    } else {
      const world = screenToWorld(point.x, point.y);
      issueFireTarget(state.battle, world.x, world.y);
    }
  }
  cancelMapSelection(event);
}

function clearMapFireTarget(event) {
  if (
    state.mode !== "battle" ||
    !state.started ||
    state.battle?.winner ||
    !battleResult.hidden
  ) return;
  clearFireTarget(state.battle);
  event.preventDefault();
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

function startStrategySelection(event) {
  if ((event.button !== 0 && event.button !== 2) || state.strategy.phase !== "player") return;
  if (event.button === 2) event.preventDefault();
  const point = canvasPoint(event);
  const world = screenToWorld(point.x, point.y);
  const flaggedSpot = event.button === 0 ? strategyFlagAt(world.x, world.y) : null;
  if (flaggedSpot && state.mode === "strategy") {
    openStrategyFactionInfoPanel(flaggedSpot);
    event.preventDefault();
    return;
  }
  const spot = strategySpotAt(world.x, world.y);
  if (!spot) {
    if (state.mode === "strategy") clearStrategySelection();
    return;
  }
  if (state.mode === "faction-select") {
    if (event.button !== 0) return;
    selectFactionFromSpot(spot);
    event.preventDefault();
    return;
  }
  if (event.button === 2) {
    selectStrategyAttackTarget(spot);
    return;
  }
  selectStrategySpot(spot);
  event.preventDefault();
}

function strategySpot(id) {
  return getStrategySpot(state.strategy, id);
}

function strategySpotAt(x, y) {
  let selected = null;
  let bestDistance = Infinity;
  for (const spot of state.strategy.spots) {
    const distance = Math.hypot(spot.x - x, spot.y - y);
    const radius = state.mode === "faction-select"
      ? Math.max(SPOT_HIT_RADIUS * strategySpotScale(spot), 82)
      : SPOT_HIT_RADIUS * strategySpotScale(spot);
    if (distance <= radius && distance <= bestDistance) {
      selected = spot;
      bestDistance = distance;
    }
  }
  return selected;
}

function strategyFlagAt(x, y) {
  let selected = null;
  let bestDistance = Infinity;
  for (const spot of state.strategy.spots) {
    if (!factionById(spot.factionId)?.flag) continue;
    const [flagX, flagY] = strategyFlagCenter(spot);
    const size = STRATEGY_FLAG_SIZE * 1.35;
    const inBounds = Math.abs(x - flagX) <= size / 2 && Math.abs(y - flagY) <= size / 2;
    if (!inBounds) continue;
    const distance = Math.hypot(flagX - x, flagY - y);
    if (distance <= bestDistance) {
      selected = spot;
      bestDistance = distance;
    }
  }
  return selected;
}

function strategyFlagCenter(spot) {
  const size = SPOT_SIZE * strategySpotScale(spot);
  return [
    spot.x + size / 2,
    spot.y - size / 2,
  ];
}

function selectStrategySpot(spot) {
  if (state.strategy.selectedTargetId) {
    if (isStrategyAttackSourceCandidate(spot)) {
      state.strategy.selectedSpotId = spot.id;
      state.strategy.selectedSourceId = spot.id;
      openStrategySpotPanel(spot);
      state.strategy.message = strategySelectionMessage();
      updateStrategyHud();
      updateStrategySpotPanels();
      return;
    }
    showInvalidStrategySourceWarning(spot);
    return;
  }

  state.strategy.selectedSpotId = spot.id;
  openStrategySpotPanel(spot);
  if (spot.owner === "player") {
    if (state.strategy.selectedSourceId !== spot.id) {
      state.strategy.selectedUnitIds.clear();
    }
    state.strategy.selectedSourceId = spot.id;
    state.strategy.message = STRATEGY_MESSAGE_SELECT_TARGET;
    updateStrategyHud();
    updateStrategySpotPanels();
    return;
  }

  if (spot.owner !== "player") state.strategy.message = "情報表示中: 侵攻先にするには右クリック";
  updateStrategyHud();
  updateStrategySpotPanels();
}

function selectStrategyAttackTarget(spot) {
  if (!spot || spot.owner === "player") return;
  const sourceSpots = invasionSourceSpotsForTarget(state.strategy, spot);
  if (sourceSpots.length === 0) {
    for (const panel of state.strategy.openSpotPanels.values()) panel.remove();
    state.strategy.openSpotPanels.clear();
    state.strategy.selectedSpotId = null;
    state.strategy.selectedTargetId = null;
    state.pendingOperation = null;
    closeStrategySortiePanel();
    invasionDialog.hidden = true;
    state.strategy.message = "隣接する自領地がありません";
    showInvalidStrategySourceWarning(spot, "この敵領地に隣接する自領地がありません。");
    state.strategyRenderKey = null;
    updateStrategyHud();
    updateStrategySpotPanels();
    return;
  }

  closeStrategyFactionInfoPanels();
  const source = strategySpot(state.strategy.selectedSourceId);
  const nextSourceId = canInvadeTarget(source, spot) ? source.id : null;
  const targetPanel = openStrategySpotPanel(spot);
  state.strategy.selectedSpotId = spot.id;
  state.strategy.selectedTargetId = spot.id;
  state.strategy.selectedSourceId = nextSourceId;
  state.strategy.selectedUnitIds.clear();
  pruneSelectedStrategyUnitsForTarget(spot);
  state.pendingOperation = null;
  syncStrategySortiePanel();
  placeStrategySortiePanel(state.strategySortiePanel, targetPanel);
  showStrategyTargetSelectionDialog(spot, sourceSpots);
  state.strategy.message = strategySelectionMessage();
  state.strategyRenderKey = null;
  updateStrategyHud();
  updateStrategySpotPanels();
}

function showStrategyTargetSelectionDialog(target, sourceSpots) {
  state.pendingOperation = null;
  invasionActions.classList.add("is-single");
  confirmInvasionButton.hidden = true;
  confirmInvasionButton.disabled = true;
  cancelInvasionButton.textContent = "確認";
  invasionTitle.textContent = `${target.name}を侵攻先に設定`;
  invasionSummary.textContent = `次に隣接する自領地を選択してください。候補 ${sourceSpots.length}領地`;
  showInvasionDialog();
  cancelInvasionButton.focus();
}

function refreshStrategyTargetSelectionDialog() {
  if (invasionDialog.hidden || state.pendingOperation || !state.strategy.selectedTargetId) return;
  const target = strategySpot(state.strategy.selectedTargetId);
  if (!target) return;
  const sourceSpots = invasionSourceSpotsForTarget(state.strategy, target);
  const selectedCount = selectedStrategyUnits().length;
  invasionTitle.textContent = `${target.name}への出撃準備`;
  invasionSummary.textContent = !state.strategy.selectedSourceId
    ? `隣接する自領地を選択してください。候補 ${sourceSpots.length}領地`
    : selectedCount > 0
      ? `選択中 ${selectedCount} / ${MAX_INVASION_UNITS}部隊。出撃編成パネルの出撃ボタンで確認します。`
      : "出撃するユニットを出撃編成へドラッグ&ドロップしてください。";
}

function showInvalidStrategySourceWarning(spot, message = "侵攻先に隣接する自領地を選択してください。") {
  state.strategy.message = message;
  strategyWarningMessage.textContent = message;
  strategyWarningDialog.hidden = false;
  clearStrategyWarningTimeout();
  state.strategyWarningTimeout = setTimeout(() => {
    strategyWarningDialog.hidden = true;
    state.strategyWarningTimeout = null;
  }, STRATEGY_WARNING_MS);
  updateStrategyHud();
}

function clearStrategyWarningTimeout() {
  if (!state.strategyWarningTimeout) return;
  clearTimeout(state.strategyWarningTimeout);
  state.strategyWarningTimeout = null;
}

function pruneSelectedStrategyUnitsForTarget(target) {
  const eligibleSourceIds = new Set(
    invasionSourceSpotsForTarget(state.strategy, target).map(spot => spot.id)
  );
  for (const spot of state.strategy.spots) {
    if (eligibleSourceIds.has(spot.id)) continue;
    removeSelectedStrategyUnitsFromSpot(spot.id);
  }
}

function areStrategySpotsLinked(firstId, secondId) {
  return areSpotsLinked(state.strategy, firstId, secondId);
}

function invadeSelectedSpot() {
  const source = strategySpot(state.strategy.selectedSourceId);
  const target = strategySpot(state.strategy.selectedTargetId);
  if (!canInvadeTarget(source, target)) return;
  if (!areStrategySpotsLinked(source.id, target.id)) return;
  target.owner = "player";
  target.factionId = state.strategy.playerFactionId;
  target.units = [];
  state.strategy.message = `${target.name}を占領しました`;
  state.strategy.selectedSpotId = target.id;
  state.strategy.selectedSourceId = target.id;
  state.strategy.selectedTargetId = null;
  updateStrategyHud();
  updateStrategySpotPanels();
}

function canInvadeTarget(source, target) {
  return canInvadeStrategyTarget(state.strategy, source, target);
}

function clearStrategySelection() {
  if (!state.strategy) return;
  state.strategy.selectedSpotId = null;
  state.strategy.selectedSourceId = null;
  state.strategy.selectedTargetId = null;
  state.strategy.selectedUnitIds.clear();
  state.pendingOperation = null;
  invasionDialog.hidden = true;
  strategyWarningDialog.hidden = true;
  clearStrategyWarningTimeout();
  battleBriefing.hidden = true;
  state.strategyRenderKey = null;
  state.strategy.message = STRATEGY_MESSAGE_SELECT_TARGET;
  updateStrategyHud();
  updateStrategySpotPanels();
}

function endStrategyTurn() {
  if (state.strategy.phase !== "player") return;
  if (state.strategy.spots.every(spot => spot.owner === "player")) {
    showStrategyClearResult();
    return;
  }
  state.strategy.phase = "enemy";
  state.strategy.message = "敵ターン: 現在は行動なし";
  updateStrategyHud();
  setTimeout(() => {
    if (state.mode !== "strategy" || state.strategy.phase !== "enemy") return;
    state.strategy.turn += 1;
    state.strategy.phase = "player";
    const income = collectPlayerIncome(state.strategy);
    clearStrategySelection();
    state.strategy.message = `収入 +${income}: ${STRATEGY_MESSAGE_SELECT_TARGET}`;
    updateStrategyHud();
  }, 500);
}

function showStrategyClearResult() {
  updateGameFlow(FLOW_EVENT.CLEAR_SCENARIO);
  state.strategyCleared = true;
  closeStrategyTransientUi();
  battleMessage.textContent = "SCENARIO CLEAR";
  resultTitle.textContent = "SCENARIO CLEAR";
  resultTitle.classList.remove("is-defeat");
  resultAllies.textContent = String(state.strategy.spots.length);
  resultEnemies.textContent = "0";
  resultTime.textContent = `TURN ${state.strategy.turn}`;
  resultRestartButton.textContent = "RETURN SCENARIOS";
  battleResult.hidden = false;
  pauseButton.disabled = true;
  requestAnimationFrame(() => resultRestartButton.focus());
}

function updateStrategyHud() {
  if (!state.strategy) return;
  const ownCount = state.strategy.spots.filter(spot => spot.owner === "player").length;
  const neutralCount = state.strategy.spots.filter(spot => spot.owner === "neutral").length;
  const sourceSpots = selectedStrategySourceSpots();
  const target = strategySpot(state.strategy.selectedTargetId);
  allyCount.textContent = ownCount;
  enemyCount.textContent = neutralCount;
  battleMessage.textContent = state.strategy.phase === "player" ? "STRATEGY" : "ENEMY TURN";
  strategyTurn.textContent = String(state.strategy.turn);
  strategyPhase.textContent = state.strategy.phase === "player" ? "PLAYER" : "ENEMY";
  strategyIncome.textContent = String(calculatePlayerIncome(state.strategy));
  strategyFunds.textContent = String(state.strategy.funds.player);
  strategySource.textContent = sourceSpots.length === 0
    ? "NONE"
    : sourceSpots.length === 1
      ? sourceSpots[0].name
      : `${sourceSpots.length} AREAS`;
  strategyTarget.textContent = target?.name ?? "NONE";
  strategyMessage.textContent = state.strategy.message;
  if (strategyInvadeButton) strategyInvadeButton.disabled = !createInvasionOperation(state.strategy);
  syncStrategySelectedForces();
  refreshStrategyTargetSelectionDialog();
  pauseButton.disabled = state.strategy.phase !== "player";
  pauseButton.textContent = state.strategy.phase === "player" ? "END TURN" : "WAIT";
  zoomLevel.textContent = `${Math.round(state.camera.scale * 100)}%`;
}

function selectedStrategySourceSpots() {
  const selectedUnits = selectedStrategyUnits();
  if (selectedUnits.length > 0) {
    const sourceIds = [...new Set(selectedUnits.map(unit => unit.spotId))];
    return sourceIds.map(sourceId => strategySpot(sourceId)).filter(Boolean);
  }
  return [strategySpot(state.strategy.selectedSourceId)].filter(Boolean);
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
