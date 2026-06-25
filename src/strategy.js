export const STRATEGY_UNIT_CATALOG = Object.freeze({
  tank: Object.freeze({ type: "tank", role: "frontline", cost: 120, label: "TANK" }),
  artillery: Object.freeze({ type: "artillery", role: "rearGuard", cost: 180, label: "ARTILLERY" }),
});

export const DEFAULT_SPOT_ECONOMY = 1000;
export const STRATEGY_FORMATION_UNIT_LIMIT = 8;
export const STRATEGY_SPOT_FORMATION_LIMIT = 12;
export const MAX_INVASION_UNITS = 24;

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

export function createStrategyState(data, playerFactionId = "deutschland") {
  const funds = data.funds ?? { player: 10000, enemy: 0, neutral: 0 };
  return {
    width: data.width,
    height: data.height,
    playerFactionId,
    funds: { player: 0, enemy: 0, neutral: 0, ...funds },
    spots: data.spots.map((spot, index) => {
      const normalizedSpot = {
        ...spot,
        economy: spot.economy ?? DEFAULT_SPOT_ECONOMY,
        factionId: spot.factionId ?? (spot.owner === "player" ? playerFactionId : null),
        owner: strategyOwnerForFaction(spot, playerFactionId),
      };
      return {
        ...normalizedSpot,
        units: createSpotUnits(normalizedSpot, index),
      };
    }),
    links: data.links.map(link => ({ type: "route", ...link })),
    turn: 1,
    phase: "player",
    selectedSpotId: null,
    selectedSourceId: null,
    selectedTargetId: null,
    selectedUnitIds: new Set(),
    openSpotPanels: new Map(),
    nextUnitId: 1,
    message: "侵攻先にする敵領地を右クリックしてください",
  };
}

export function calculatePlayerIncome(strategy) {
  return strategy.spots
    .filter(spot => spot.owner === "player")
    .reduce((total, spot) => total + (spot.economy ?? DEFAULT_SPOT_ECONOMY), 0);
}

export function collectPlayerIncome(strategy) {
  const income = calculatePlayerIncome(strategy);
  strategy.funds.player += income;
  return income;
}

function strategyOwnerForFaction(spot, playerFactionId) {
  if (spot.factionId) return spot.factionId === playerFactionId ? "player" : "enemy";
  return spot.owner ?? "neutral";
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

export function selectedStrategyUnits(strategy, targetId = strategy.selectedTargetId) {
  const target = getStrategySpot(strategy, targetId);
  const sourceSpots = target
    ? invasionSourceSpotsForTarget(strategy, target)
    : [getStrategySpot(strategy, strategy.selectedSourceId)].filter(Boolean);
  return sourceSpots
    .flatMap(spot => spot.units)
    .filter(unit =>
      strategy.selectedUnitIds.has(unit.id) &&
      isStrategyUnitActionAvailable(strategy, unit)
    )
    .slice(0, MAX_INVASION_UNITS);
}

export function isStrategyUnitActionAvailable(strategy, unit) {
  return Boolean(unit?.alive && (unit.availableTurn ?? 1) <= strategy.turn);
}

export function createInvasionOperation(strategy, targetId = strategy.selectedTargetId) {
  const target = getStrategySpot(strategy, targetId);
  if (!target || target.owner === "player") return null;
  const alliedUnits = selectedStrategyUnits(strategy, target.id);
  if (alliedUnits.length === 0) return null;

  const unitOrigins = {};
  for (const unit of alliedUnits) unitOrigins[unit.id] = unit.spotId;
  const sourceIds = [...new Set(alliedUnits.map(unit => unit.spotId))];

  return {
    sourceId: sourceIds[0] ?? null,
    sourceIds,
    targetId: target.id,
    unitIds: alliedUnits.map(unit => unit.id),
    unitOrigins,
    alliedUnits: alliedUnits.map(cloneStrategyUnitForBattle),
    enemyUnits: target.units.filter(unit => unit.alive).map(cloneStrategyUnitForBattle),
  };
}

export function hireStrategyUnit(strategy, spotId, unitType) {
  const spot = getStrategySpot(strategy, spotId);
  const catalog = STRATEGY_UNIT_CATALOG[unitType];
  if (!spot || spot.owner !== "player" || !catalog) return null;
  if (strategy.funds.player < catalog.cost) return null;
  if (!canHireStrategyUnit(strategy, spotId, unitType)) return null;

  strategy.funds.player -= catalog.cost;
  const unitNumber = strategy.nextUnitId++;
  const formationId = findOpenStrategyFormationId(spot, catalog.type)
    ?? createHiredStrategyFormationId(spot, catalog.type, unitNumber);
  const unit = {
    id: `${spot.id}-hired-${catalog.type}-${unitNumber}`,
    team: "ally",
    type: catalog.type,
    role: catalog.role,
    spotId: spot.id,
    formationId,
    hp: 1,
    maxHp: 1,
    alive: true,
    availableTurn: strategy.turn + 1,
  };
  spot.units.push(unit);
  strategy.message = `${spot.name}で${catalog.label}を雇用しました`;
  strategy.selectedSpotId = spot.id;
  strategy.selectedSourceId = spot.id;
  return unit;
}

export function canHireStrategyUnit(strategy, spotId, unitType) {
  const spot = getStrategySpot(strategy, spotId);
  const catalog = STRATEGY_UNIT_CATALOG[unitType];
  if (!spot || spot.owner !== "player" || !catalog) return false;
  return Boolean(
    findOpenStrategyFormationId(spot, catalog.type) ||
    countStrategyFormations(spot) < STRATEGY_SPOT_FORMATION_LIMIT
  );
}

export function resolveStrategyBattle(strategy, operation, battleUnits, winner) {
  const target = getStrategySpot(strategy, operation.targetId);
  if (!target) return false;

  const deployedIds = new Set(operation.unitIds);
  const survivingAllyIds = new Set(
    battleUnits
      .filter(unit => unit.team === "ally" && unit.alive)
      .map(unit => unit.id)
  );
  const deployedUnits = [];
  const sourceIds = operation.sourceIds ?? [operation.sourceId].filter(Boolean);
  for (const sourceId of sourceIds) {
    const source = getStrategySpot(strategy, sourceId);
    if (!source) continue;
    const sourceDeployed = source.units
      .filter(unit => deployedIds.has(unit.id))
      .map(unit => ({ ...unit, availableTurn: strategy.turn + 1 }));
    deployedUnits.push(...sourceDeployed);
    source.units = source.units.filter(unit => !deployedIds.has(unit.id));
  }

  if (winner === "ally") {
    target.owner = "player";
    target.factionId = strategy.playerFactionId;
    target.units = deployedUnits
      .filter(unit => survivingAllyIds.has(unit.id))
      .map(unit => ({
        ...unit,
        spotId: target.id,
        formationId: unit.formationId.replace(unit.spotId, target.id),
      }));
    strategy.selectedSpotId = target.id;
    strategy.selectedSourceId = target.id;
    strategy.message = `${target.name}を占領しました`;
  } else {
    strategy.selectedSpotId = sourceIds[0] ?? null;
    strategy.message = `${target.name}への侵攻は失敗しました`;
  }

  strategy.selectedTargetId = null;
  strategy.selectedUnitIds.clear();
  return true;
}

export function invasionSourceSpotsForTarget(strategy, target) {
  if (!target || target.owner === "player") return [];
  return strategy.spots.filter(spot => canInvadeStrategyTarget(strategy, spot, target));
}

function createSpotUnits(spot, index) {
  if (Array.isArray(spot.units)) {
    return spot.units.map((unit, unitIndex) => createStrategyUnit({
      type: unit.type,
      owner: spot.owner,
      spotId: spot.id,
      formationIndex: unit.formationIndex ?? unitIndex,
      unitIndex,
      availableTurn: unit.availableTurn,
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

function createStrategyUnit({ type, owner, spotId, formationIndex, unitIndex, availableTurn = 1 }) {
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
    availableTurn,
  };
}

function findOpenStrategyFormationId(spot, unitType) {
  for (const units of groupSpotUnitsByFormation(spot).values()) {
    if (units[0]?.type === unitType && units.length < STRATEGY_FORMATION_UNIT_LIMIT) {
      return units[0].formationId;
    }
  }
  return null;
}

function countStrategyFormations(spot) {
  return groupSpotUnitsByFormation(spot).size;
}

function groupSpotUnitsByFormation(spot) {
  const formations = new Map();
  for (const unit of spot.units ?? []) {
    if (!formations.has(unit.formationId)) formations.set(unit.formationId, []);
    formations.get(unit.formationId).push(unit);
  }
  return formations;
}

function createHiredStrategyFormationId(spot, unitType, unitNumber) {
  return `${spot.id}-hired-${unitType}-${unitNumber}`;
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
