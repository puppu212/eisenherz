import assert from "node:assert/strict";
import test from "node:test";
import {
  createBattle,
  facingFromDirection,
  movementMultiplierAt,
  teamCounts,
  updateBattle,
} from "../src/simulation.js";

test("all unit types use the same horizontal facing rule", () => {
  assert.equal(facingFromDirection(10), "right");
  assert.equal(facingFromDirection(-10), "left");
  assert.equal(facingFromDirection(0), "left");
  assert.equal(facingFromDirection(0.01), "left");
});

test("teams start far apart in the lower-left and upper-right", () => {
  const battle = createBattle({ width: 3200, height: 3200 });
  const allies = battle.units.filter(unit => unit.team === "ally");
  const enemies = battle.units.filter(unit => unit.team === "enemy");
  assert.ok(allies.every(unit => unit.x < 1600 && unit.y > 1600));
  assert.ok(enemies.every(unit => unit.x > 1600 && unit.y < 1600));
  assert.ok(Math.hypot(enemies[1].x - allies[1].x, enemies[1].y - allies[1].y) > 1500);
});

test("default combat uses long range and fast shells", () => {
  const battle = createBattle();
  assert.equal(battle.rules.attackRange, 420);
  assert.equal(battle.rules.shellSpeed, 1000);
});

test("red water terrain reduces movement speed to fifty percent", () => {
  const terrainMovement = {
    width: 10,
    height: 10,
    tileSize: 100,
    cells: new Float32Array(100).fill(0.5),
  };
  const normal = createBattle({
    width: 1000,
    height: 1000,
    rules: { attackRange: 0, tankSpeed: 100 },
  });
  const water = createBattle({
    width: 1000,
    height: 1000,
    terrainMovement,
    rules: { attackRange: 0, tankSpeed: 100 },
  });
  const normalUnit = normal.units.find(unit => unit.id === "ally-2");
  const waterUnit = water.units.find(unit => unit.id === "ally-2");
  const normalStart = { x: normalUnit.x, y: normalUnit.y };
  const waterStart = { x: waterUnit.x, y: waterUnit.y };

  assert.equal(movementMultiplierAt(water, waterUnit.x, waterUnit.y), 0.5);
  updateBattle(normal, 0.05);
  updateBattle(water, 0.05);

  const normalTravel = Math.hypot(normalUnit.x - normalStart.x, normalUnit.y - normalStart.y);
  const waterTravel = Math.hypot(waterUnit.x - waterStart.x, waterUnit.y - waterStart.y);
  assert.ok(Math.abs(waterTravel / normalTravel - 0.5) < 0.001);
});

test("destroyed units create a timed explosion that finishes after victory", () => {
  const battle = createBattle({
    width: 800,
    height: 600,
    rules: {
      attackRange: 1000,
      fireInterval: 0.01,
      shellSpeed: 5000,
      shellDamage: 100,
    },
  });

  for (let step = 0; step < 600 && !battle.winner; step += 1) {
    updateBattle(battle, 1 / 60);
  }
  assert.ok(battle.explosions.length > 0);
  assert.ok(battle.winner);
  const finalTime = battle.elapsed;

  for (let step = 0; step < 120; step += 1) updateBattle(battle, 1 / 60);
  assert.equal(battle.explosions.length, 0);
  assert.equal(battle.elapsed, finalTime);
});

test("shells spawn outside the enlarged unit center", () => {
  const battle = createBattle({
    width: 800,
    height: 600,
    rules: { attackRange: 1000, fireInterval: 100, muzzleOffset: 58 },
  });
  const ally = battle.units.find(unit => unit.id === "ally-2");
  for (let step = 0; step < 20; step += 1) updateBattle(battle, 1 / 60);
  const shell = battle.shells.find(item => item.team === "ally");
  assert.ok(shell);
  assert.ok(Math.hypot(shell.x - ally.x, shell.y - ally.y) >= 57.9);
});

test("both teams approach and automatically exchange fire", () => {
  const battle = createBattle({
    width: 1200,
    height: 800,
    rules: {
      tankSpeed: 120,
      attackRange: 220,
      fireInterval: 0.25,
      shellSpeed: 900,
      shellDamage: 25,
    },
  });
  const initialAllyX = battle.units.find(unit => unit.id === "ally-1").x;

  for (let step = 0; step < 3000 && !battle.winner; step += 1) {
    updateBattle(battle, 1 / 60);
  }

  const movedAlly = battle.units.find(unit => unit.id === "ally-1");
  assert.ok(movedAlly.x > initialAllyX);
  assert.equal(movedAlly.facing, "right");
  assert.equal(battle.units.find(unit => unit.id === "enemy-1").facing, "left");
  assert.ok(battle.units.some(unit => unit.hp < unit.maxHp));
  assert.ok(battle.winner);
  const counts = teamCounts(battle);
  assert.ok(counts.ally === 0 || counts.enemy === 0);
});

test("units stop advancing when their target enters attack range", () => {
  const battle = createBattle({
    width: 1000,
    height: 600,
    rules: { tankSpeed: 100, attackRange: 200, fireInterval: 100 },
  });
  const ally = battle.units.find(unit => unit.id === "ally-2");

  for (let step = 0; step < 600; step += 1) updateBattle(battle, 1 / 60);

  const enemy = battle.units.find(unit => unit.id === ally.targetId);
  assert.ok(enemy);
  assert.ok(
    Math.hypot(enemy.x - ally.x, enemy.y - ally.y) <=
    battle.rules.attackRange + battle.rules.rangeTolerance + 0.01
  );
  assert.equal(ally.state, "attacking");
});
