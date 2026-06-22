export const STRATEGY_UNIT_CATALOG = Object.freeze({
  tank: Object.freeze({ type: "tank", role: "frontline", cost: 120, label: "TANK" }),
  artillery: Object.freeze({ type: "artillery", role: "rearGuard", cost: 180, label: "ARTILLERY" }),
});

const INITIAL_PLAYER_FORMATIONS = Object.freeze([
  { type: "tank", count: 4 },
  { type: "tank", count: 4 },
  { type: "tank", count: 4 },
  { type: "tank", count: 4 },
  { type: "artillery", count: 4 },
  { type: "artillery", count: 4 },
]);

const INITIAL_ENEMY_FORMATIONS = Object.freeze([
  { type: "tank", count: 4 },
  { type: "tank", count: 4 },
  { type: "tank", count: 4 },
  { type: "tank", count: 4 },
  { type: "tank", count: 4 },
  { type: "tank", count: 4 },
]);

export function createStrategyState(data) {
  const funds = data.funds ?? { player: 720, enemy: 0, neutral: 0 };
  return {
    width: data.width,
    height: data.height,
    funds: { player: 0, enemy: 0, neutral: 0, ...funds },
    spots: data.spots.map((spot, index) => ({
      ...spot,
      units: createSpotUnits(spot, index),
    })),
    links: data.links.map(link => ({ type: "route", ...link })),
    turn: 1,
    phase: "player",
    selectedSpotId: null,
    selectedSourceId: null,
    selectedTargetId: null,
    selectedUnitIds: new Set(),
    openSpotPanels: new Map(),
    nextUnitId: 1,
    message: "自領地を選択してください",
  };
}

export function getStrategySpot(strategy, id) {
  return strategy.spots.find(spot => spot.id === id) ?? null;
}

export function areStrategySpotsLinked(strategy, firstId, secondId) {
  return strategy.links.some(link =>
    (link.from === firstId && link.to === secondId) ||
    (link.from === secondId && link.to === firstId)
  );
}

export function canInvadeStrategyTarget(strategy, source, target) {
  return Boolean(
    source?.owner === "player" &&
    target &&
    target.owner !== "player" &&
    areStrategySpotsLinked(strategy, source.id, target.id)
  );
}

export function selectedStrategyUnits(strategy) {
  const source = getStrategySpot(strategy, strategy.selectedSourceId);
  if (!source) return [];
  return source.units.filter(unit => unit.alive && strategy.selectedUnitIds.has(unit.id));
}

export function createInvasionOperation(strategy, targetId = strategy.selectedTargetId) {
  const source = getStrategySpot(strategy, strategy.selectedSourceId);
  const target = getStrategySpot(strategy, targetId);
  const alliedUnits = selectedStrategyUnits(strategy);
  if (!canInvadeStrategyTarget(strategy, source, target) || alliedUnits.length === 0) return null;

  return {
    sourceId: source.id,
    targetId: target.id,
    unitIds: alliedUnits.map(unit => unit.id),
    alliedUnits: alliedUnits.map(cloneStrategyUnitForBattle),
    enemyUnits: target.units.filter(unit => unit.alive).map(cloneStrategyUnitForBattle),
  };
}

export function hireStrategyUnit(strategy, spotId, unitType) {
  const spot = getStrategySpot(strategy, spotId);
  const catalog = STRATEGY_UNIT_CATALOG[unitType];
  if (!spot || spot.owner !== "player" || !catalog) return null;
  if (strategy.funds.player < catalog.cost) return null;

  strategy.funds.player -= catalog.cost;
  const unitNumber = strategy.nextUnitId++;
  const unit = {
    id: `${spot.id}-hired-${catalog.type}-${unitNumber}`,
    team: "ally",
    type: catalog.type,
    role: catalog.role,
    spotId: spot.id,
    formationId: `${spot.id}-hired-${catalog.type}`,
    hp: 1,
    maxHp: 1,
    alive: true,
  };
  spot.units.push(unit);
  strategy.message = `${spot.name}で${catalog.label}を雇用しました`;
  strategy.selectedSpotId = spot.id;
  strategy.selectedSourceId = spot.id;
  return unit;
}

export function resolveStrategyBattle(strategy, operation, battleUnits, winner) {
  const source = getStrategySpot(strategy, operation.sourceId);
  const target = getStrategySpot(strategy, operation.targetId);
  if (!source || !target) return false;

  const deployedIds = new Set(operation.unitIds);
  const survivingAllyIds = new Set(
    battleUnits
      .filter(unit => unit.team === "ally" && unit.alive)
      .map(unit => unit.id)
  );
  const deployedUnits = source.units.filter(unit => deployedIds.has(unit.id));
  source.units = source.units.filter(unit => !deployedIds.has(unit.id));

  if (winner === "ally") {
    target.owner = "player";
    target.units = deployedUnits
      .filter(unit => survivingAllyIds.has(unit.id))
      .map(unit => ({
        ...unit,
        spotId: target.id,
        formationId: unit.formationId.replace(source.id, target.id),
      }));
    strategy.selectedSpotId = target.id;
    strategy.selectedSourceId = target.id;
    strategy.message = `${target.name}を占領しました`;
  } else {
    strategy.selectedSpotId = source.id;
    strategy.message = `${target.name}への侵攻は失敗しました`;
  }

  strategy.selectedTargetId = null;
  strategy.selectedUnitIds.clear();
  return true;
}

function createSpotUnits(spot, index) {
  if (Array.isArray(spot.units)) {
    return spot.units.map((unit, unitIndex) => createStrategyUnit({
      type: unit.type,
      owner: spot.owner,
      spotId: spot.id,
      formationIndex: unit.formationIndex ?? unitIndex,
      unitIndex,
    }));
  }
  const formations = spot.owner === "player"
    ? INITIAL_PLAYER_FORMATIONS
    : INITIAL_ENEMY_FORMATIONS;
  const formationOffset = spot.owner === "player" ? 0 : index;
  return formations.flatMap((formation, formationIndex) =>
    createFormation(spot, formation, formationOffset + formationIndex)
  );
}

function createFormation(spot, formation, formationIndex) {
  return Array.from({ length: formation.count }, (_, unitIndex) => createStrategyUnit({
    type: formation.type,
    owner: spot.owner,
    spotId: spot.id,
    formationIndex,
    unitIndex,
  }));
}

function createStrategyUnit({ type, owner, spotId, formationIndex, unitIndex }) {
  const catalog = STRATEGY_UNIT_CATALOG[type] ?? STRATEGY_UNIT_CATALOG.tank;
  return {
    id: `${spotId}-${catalog.type}-${formationIndex}-${unitIndex + 1}`,
    team: owner === "player" ? "ally" : "enemy",
    type: catalog.type,
    role: catalog.role,
    spotId,
    formationId: `${spotId}-${catalog.type}-${formationIndex}`,
    hp: 1,
    maxHp: 1,
    alive: true,
  };
}

function cloneStrategyUnitForBattle(unit) {
  return {
    id: unit.id,
    team: unit.team,
    type: unit.type,
    role: unit.role,
    formationId: unit.formationId,
    spotId: unit.spotId,
  };
}
