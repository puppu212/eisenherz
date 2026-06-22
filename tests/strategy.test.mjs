import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  areStrategySpotsLinked,
  createInvasionOperation,
  createStrategyState,
  hireStrategyUnit,
  resolveStrategyBattle,
} from "../src/strategy.js";

async function createTestStrategy() {
  const data = JSON.parse(await readFile(new URL("../assets/spot/strategy.json", import.meta.url)));
  return createStrategyState(data);
}

test("strategy state builds the initial formations and route graph", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const target = strategy.spots.find(spot => spot.id === "spot2");

  assert.equal(source.units.length, 24);
  assert.equal(source.units.filter(unit => unit.type === "artillery").length, 8);
  assert.equal(target.units.length, 24);
  assert.equal(areStrategySpotsLinked(strategy, source.id, target.id), true);
});

test("hiring spends funds and adds a unit to an owned spot", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const unit = hireStrategyUnit(strategy, source.id, "artillery");

  assert.equal(strategy.funds.player, 540);
  assert.equal(source.units.length, 25);
  assert.equal(unit.type, "artillery");
  assert.equal(strategy.selectedSourceId, source.id);
});

test("an invasion operation contains only selected living units", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  strategy.selectedSourceId = source.id;
  strategy.selectedTargetId = "spot2";
  source.units[1].alive = false;
  strategy.selectedUnitIds.add(source.units[0].id);
  strategy.selectedUnitIds.add(source.units[1].id);

  const operation = createInvasionOperation(strategy);
  assert.deepEqual(operation.unitIds, [source.units[0].id]);
  assert.equal(operation.alliedUnits.length, 1);
  assert.equal(operation.enemyUnits.length, 24);
});

test("victory transfers surviving deployed units to the captured spot", async () => {
  const strategy = await createTestStrategy();
  const source = strategy.spots.find(spot => spot.id === "spot1");
  const target = strategy.spots.find(spot => spot.id === "spot2");
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
  assert.deepEqual(target.units.map(unit => unit.id), [operation.unitIds[0]]);
  assert.equal(source.units.length, 22);
  assert.equal(strategy.selectedSourceId, target.id);
});
