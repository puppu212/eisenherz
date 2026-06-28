import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  areStrategySpotsLinked,
  calculatePlayerIncome,
  canHireStrategyUnit,
  collectPlayerIncome,
  createInvasionOperation,
  createStrategyState,
  hireStrategyUnit,
  isStrategyUnitActionAvailable,
  resolveStrategyBattle,
} from "../src/strategy.js";

async function createTestStrategy() {
  const data = JSON.parse(await readFile(new URL("../assets/spot/strategy.json", import.meta.url)));
  return createStrategyState(data);
}

test("strategy state builds the initial formations and route graph", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const secondSource = strategy.spots.find(spot => spot.id === "spot2");
  const target = strategy.spots.find(spot => spot.id === "spot4");

  assert.equal(source.units.length, 24);
  assert.equal(source.units.filter(unit => unit.type === "artillery").length, 8);
  assert.equal(
    [...new Set(source.units.filter(unit => unit.type === "tank").map(unit => unit.formationId))].length,
    2
  );
  assert.equal(
    [...new Set(source.units.filter(unit => unit.type === "artillery").map(unit => unit.formationId))].length,
    1
  );
  assert.equal(secondSource.owner, "player");
  assert.equal(secondSource.units.length, 24);
  assert.equal(target.owner, "enemy");
  assert.equal(target.units.length, 24);
  assert.equal(areStrategySpotsLinked(strategy, source.id, target.id), true);
  assert.equal(source.economy, 1000);
  assert.equal(strategy.funds.player, 10000);
});

test("legacy player ownership is normalized to the default faction", () => {
  const strategy = createStrategyState({
    width: 100,
    height: 100,
    spots: [{ id: "legacy", name: "LEGACY", x: 50, y: 50, owner: "player", units: [] }],
    links: [],
  });

  assert.equal(strategy.spots[0].factionId, "deutschland");
  assert.equal(strategy.spots[0].owner, "player");
  assert.equal(strategy.spots[0].economy, 1000);
});

test("player income is the total economy of owned spots", async () => {
  const strategy = await createTestStrategy();

  assert.equal(calculatePlayerIncome(strategy), 2000);

  strategy.spots.find(spot => spot.id === "spot4").owner = "player";
  assert.equal(calculatePlayerIncome(strategy), 3000);

  const income = collectPlayerIncome(strategy);
  assert.equal(income, 3000);
  assert.equal(strategy.funds.player, 13000);
});

test("hiring spends funds and adds a unit to an owned spot", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const unit = hireStrategyUnit(strategy, source.id, "artillery");

  assert.equal(strategy.funds.player, 9820);
  assert.equal(source.units.length, 25);
  assert.equal(unit.type, "artillery");
  assert.notEqual(unit.formationId, source.units.find(candidate =>
    candidate.type === "artillery" && candidate.id !== unit.id
  ).formationId);
  assert.equal(source.units.filter(candidate => candidate.formationId === unit.formationId).length, 1);
  assert.equal(unit.availableTurn, strategy.turn + 1);
  assert.equal(isStrategyUnitActionAvailable(strategy, unit), false);
  assert.equal(strategy.selectedSourceId, source.id);
});

test("hiring fills open formations of the same unit type before creating one", async () => {
  const strategy = await createTestStrategy();
  strategy.funds.player = 2000;
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const tankFormationId = source.units.find(unit => unit.type === "tank").formationId;
  const artilleryFormationId = source.units.find(unit => unit.type === "artillery").formationId;
  source.units.splice(source.units.findIndex(unit => unit.formationId === tankFormationId), 1);
  source.units.splice(source.units.findIndex(unit => unit.formationId === artilleryFormationId), 1);

  const tank = hireStrategyUnit(strategy, source.id, "tank");
  const artillery = hireStrategyUnit(strategy, source.id, "artillery");

  assert.equal(tank.formationId, tankFormationId);
  assert.equal(artillery.formationId, artilleryFormationId);
  assert.equal(source.units.filter(unit => unit.formationId === tankFormationId).length, 8);
  assert.equal(source.units.filter(unit => unit.formationId === artilleryFormationId).length, 8);
});

test("hiring creates a new formation only when all matching formations are full", async () => {
  const strategy = createStrategyState({
    width: 100,
    height: 100,
    funds: { player: 1000 },
    spots: [{
      id: "full-tanks",
      name: "FULL TANKS",
      x: 50,
      y: 50,
      owner: "player",
      units: Array.from({ length: 8 }, (_, index) => ({
        type: "tank",
        formationIndex: 0,
        availableTurn: 1,
      })),
    }],
    links: [],
  });
  const spot = strategy.spots[0];

  const unit = hireStrategyUnit(strategy, spot.id, "tank");

  assert.notEqual(unit.formationId, spot.units[0].formationId);
  assert.equal(new Set(spot.units.map(candidate => candidate.formationId)).size, 2);
});

test("a spot cannot hire once it has twelve full formations", () => {
  const units = [];
  for (let formationIndex = 0; formationIndex < 12; formationIndex += 1) {
    for (let unitIndex = 0; unitIndex < 8; unitIndex += 1) {
      units.push({
        type: formationIndex < 6 ? "tank" : "artillery",
        formationIndex,
        availableTurn: 1,
      });
    }
  }
  const strategy = createStrategyState({
    width: 100,
    height: 100,
    funds: { player: 1000 },
    spots: [{ id: "capped", name: "CAPPED", x: 50, y: 50, owner: "player", units }],
    links: [],
  });

  assert.equal(canHireStrategyUnit(strategy, "capped", "tank"), false);
  assert.equal(hireStrategyUnit(strategy, "capped", "tank"), null);
  assert.equal(strategy.spots[0].units.length, 96);
  assert.equal(strategy.funds.player, 1000);
});

test("newly hired units cannot join an invasion until the next turn", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const target = strategy.spots.find(spot => spot.id === "spot4");
  const unit = hireStrategyUnit(strategy, source.id, "tank");
  strategy.selectedTargetId = target.id;
  strategy.selectedUnitIds.add(unit.id);

  assert.equal(createInvasionOperation(strategy), null);

  strategy.turn += 1;
  const operation = createInvasionOperation(strategy);
  assert.deepEqual(operation.unitIds, [unit.id]);
});

test("an invasion operation contains only selected living units", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const target = strategy.spots.find(spot => spot.id === "spot4");
  strategy.selectedSourceId = source.id;
  strategy.selectedTargetId = target.id;
  source.units[1].alive = false;
  strategy.selectedUnitIds.add(source.units[0].id);
  strategy.selectedUnitIds.add(source.units[1].id);

  const operation = createInvasionOperation(strategy);
  assert.deepEqual(operation.unitIds, [source.units[0].id]);
  assert.equal(operation.alliedUnits.length, 1);
  assert.equal(operation.enemyUnits.length, 24);
});

test("an invasion operation can gather units from every adjacent player spot", () => {
  const strategy = createStrategyState({
    width: 100,
    height: 100,
    spots: [
      { id: "west", name: "WEST", x: 20, y: 50, owner: "player", units: [{ type: "tank" }] },
      { id: "east", name: "EAST", x: 80, y: 50, owner: "player", units: [{ type: "artillery" }] },
      { id: "target", name: "TARGET", x: 50, y: 50, owner: "enemy", units: [] },
    ],
    links: [
      { from: "west", to: "target" },
      { from: "east", to: "target" },
    ],
  });
  const west = strategy.spots.find(spot => spot.id === "west");
  const east = strategy.spots.find(spot => spot.id === "east");
  strategy.selectedTargetId = "target";
  strategy.selectedUnitIds.add(west.units[0].id);
  strategy.selectedUnitIds.add(east.units[0].id);

  const operation = createInvasionOperation(strategy);

  assert.deepEqual(operation.sourceIds, ["west", "east"]);
  assert.deepEqual(operation.unitIds, [west.units[0].id, east.units[0].id]);
  assert.deepEqual(operation.unitOrigins, {
    [west.units[0].id]: "west",
    [east.units[0].id]: "east",
  });
});

test("victory moves surviving units from multiple source spots into the target", () => {
  const strategy = createStrategyState({
    width: 100,
    height: 100,
    spots: [
      { id: "west", name: "WEST", x: 20, y: 50, owner: "player", units: [{ type: "tank" }] },
      { id: "east", name: "EAST", x: 80, y: 50, owner: "player", units: [{ type: "artillery" }] },
      { id: "target", name: "TARGET", x: 50, y: 50, owner: "enemy", units: [] },
    ],
    links: [
      { from: "west", to: "target" },
      { from: "east", to: "target" },
    ],
  });
  const west = strategy.spots.find(spot => spot.id === "west");
  const east = strategy.spots.find(spot => spot.id === "east");
  const target = strategy.spots.find(spot => spot.id === "target");
  strategy.selectedTargetId = target.id;
  strategy.selectedUnitIds.add(west.units[0].id);
  strategy.selectedUnitIds.add(east.units[0].id);
  const operation = createInvasionOperation(strategy);

  resolveStrategyBattle(strategy, operation, [
    { ...operation.alliedUnits[0], alive: true },
    { ...operation.alliedUnits[1], alive: true },
  ], "ally");

  assert.equal(west.units.length, 0);
  assert.equal(east.units.length, 0);
  assert.deepEqual(target.units.map(unit => unit.id), operation.unitIds);
  assert.ok(target.units.every(unit => unit.spotId === target.id));
});

test("an invasion operation is capped at twenty-four allied units", () => {
  const strategy = createStrategyState({
    width: 100,
    height: 100,
    spots: [
      {
        id: "source",
        name: "SOURCE",
        x: 20,
        y: 50,
        owner: "player",
        units: Array.from({ length: 30 }, (_, index) => ({
          type: index % 5 === 0 ? "artillery" : "tank",
          formationIndex: Math.floor(index / 4),
        })),
      },
      { id: "target", name: "TARGET", x: 50, y: 50, owner: "enemy", units: [] },
    ],
    links: [{ from: "source", to: "target" }],
  });
  strategy.selectedTargetId = "target";
  for (const unit of strategy.spots[0].units) strategy.selectedUnitIds.add(unit.id);

  const operation = createInvasionOperation(strategy);

  assert.equal(operation.unitIds.length, 24);
  assert.equal(operation.alliedUnits.length, 24);
});

test("an invasion operation excludes units that already acted this turn", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const target = strategy.spots.find(spot => spot.id === "spot4");
  source.units[0].availableTurn = strategy.turn + 1;
  strategy.selectedSourceId = source.id;
  strategy.selectedTargetId = target.id;
  strategy.selectedUnitIds.add(source.units[0].id);
  strategy.selectedUnitIds.add(source.units[1].id);

  const operation = createInvasionOperation(strategy);
  assert.deepEqual(operation.unitIds, [source.units[1].id]);
});

test("victory transfers surviving deployed units to the captured spot", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const target = strategy.spots.find(spot => spot.id === "spot4");
  strategy.selectedSourceId = source.id;
  strategy.selectedTargetId = target.id;
  strategy.selectedUnitIds.add(source.units[0].id);
  strategy.selectedUnitIds.add(source.units[1].id);
  const operation = createInvasionOperation(strategy);

  resolveStrategyBattle(strategy, operation, [
    { ...operation.alliedUnits[0], alive: true },
    { ...operation.alliedUnits[1], alive: false },
  ], "ally");

  assert.equal(target.owner, "player");
  assert.equal(target.factionId, strategy.playerFactionId);
  assert.deepEqual(target.units.map(unit => unit.id), [operation.unitIds[0]]);
  assert.equal(source.units.length, 22);
  assert.equal(strategy.selectedSourceId, target.id);
});

test("surviving deployed units cannot invade again until the next turn", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const target = strategy.spots.find(spot => spot.id === "spot4");
  const nextTarget = strategy.spots.find(spot => spot.id === "spot3");
  strategy.selectedSourceId = source.id;
  strategy.selectedTargetId = target.id;
  strategy.selectedUnitIds.add(source.units[0].id);
  const operation = createInvasionOperation(strategy);

  resolveStrategyBattle(strategy, operation, [
    { ...operation.alliedUnits[0], alive: true },
  ], "ally");

  const survivingUnit = target.units[0];
  assert.equal(survivingUnit.availableTurn, strategy.turn + 1);
  assert.equal(isStrategyUnitActionAvailable(strategy, survivingUnit), false);

  strategy.selectedTargetId = nextTarget.id;
  strategy.selectedUnitIds.add(survivingUnit.id);
  assert.equal(createInvasionOperation(strategy), null);

  strategy.turn += 1;
  const nextOperation = createInvasionOperation(strategy);
  assert.deepEqual(nextOperation.unitIds, [survivingUnit.id]);
});
