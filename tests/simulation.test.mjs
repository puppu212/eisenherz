import assert from "node:assert/strict";
import test from "node:test";
import {
  createBattle,
  facingFromDirection,
  issueMoveOrder,
  movementMultiplierAt,
  setAllyControlMode,
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
  assert.equal(battle.rules.attackRange, 650);
  assert.equal(battle.rules.shellSpeed, 1400);
});

test("allies include two fragile long-range artillery units", () => {
  const battle = createBattle({ width: 3200, height: 3200 });
  const artillery = battle.units.filter(unit => unit.type === "artillery");
  const counts = teamCounts(battle);

  assert.equal(artillery.length, 4);
  assert.ok(artillery.every(unit => unit.team === "ally"));
  assert.ok(artillery.every(unit => unit.role === "rearGuard"));
  assert.equal(new Set(artillery.map(unit => unit.formationId)).size, 2);
  assert.ok(artillery.every(unit => unit.hp === 50 && unit.maxHp === 50));
  assert.ok(artillery.every(unit => unit.x < 1600 && unit.y > 1600));
  assert.equal(counts.ally, 9);
  assert.equal(counts.enemy, 8);
  assert.equal(battle.rules.artilleryRange, 900);
  assert.equal(battle.rules.artilleryFireInterval, 4);
  assert.equal(battle.allyControlMode, "hold");
});

test("allied tanks are split into frontline formations", () => {
  const battle = createBattle();
  const tanks = battle.units.filter(unit => unit.team === "ally" && unit.type === "tank");

  assert.equal(tanks.length, 5);
  assert.ok(tanks.every(unit => unit.role === "frontline"));
  assert.equal(new Set(tanks.map(unit => unit.formationId)).size, 2);
});

test("enemy frontline contains enough tanks to contest the enlarged force", () => {
  const battle = createBattle();
  const enemies = battle.units.filter(unit => unit.team === "enemy");

  assert.equal(enemies.length, 8);
  assert.ok(enemies.every(unit => unit.type === "tank"));
  assert.equal(new Set(enemies.map(unit => unit.formationId)).size, 2);
});

test("artillery applies area damage only when its arcing shell lands", () => {
  const battle = createBattle({
    width: 1000,
    height: 600,
    rules: {
      attackRange: 0,
      tankSpeed: 0,
      fireInterval: 100,
      artilleryRange: 1000,
      artilleryMinRange: 0,
      artilleryFireInterval: 100,
      artilleryFlightTime: 1,
      artilleryBlastRadius: 120,
      artilleryDirectDamage: 60,
      artillerySplashDamage: 30,
    },
  });
  const artillery = battle.units.find(unit => unit.type === "artillery");
  const enemies = battle.units.filter(unit => unit.team === "enemy").slice(0, 2);
  battle.units = [artillery, ...enemies];
  artillery.x = 100;
  artillery.y = 300;
  artillery.cooldown = 0;
  enemies[0].x = 700;
  enemies[0].y = 300;
  enemies[1].x = 800;
  enemies[1].y = 300;

  updateBattle(battle, 0.05);
  const shell = battle.shells.find(item => item.type === "artillery");
  assert.ok(shell);
  assert.ok(shell.progress > 0 && shell.progress < 1);
  assert.deepEqual(enemies.map(unit => unit.hp), [100, 100]);

  for (let step = 0; step < 17; step += 1) updateBattle(battle, 0.05);
  assert.deepEqual(enemies.map(unit => unit.hp), [100, 100]);

  for (let step = 0; step < 3; step += 1) updateBattle(battle, 0.05);
  assert.deepEqual(enemies.map(unit => unit.hp), [70, 70]);
  assert.ok(battle.explosions.length > 0);
  assert.equal(battle.shells.some(item => item.type === "artillery"), false);
});

test("artillery retreats when an enemy enters its minimum range", () => {
  const battle = createBattle({
    width: 1000,
    height: 600,
    allyControlMode: "auto",
    rules: { artilleryMinRange: 250, artillerySpeed: 100 },
  });
  const artillery = battle.units.find(unit => unit.type === "artillery");
  const enemy = battle.units.find(unit => unit.team === "enemy");
  battle.units = [artillery, enemy];
  artillery.x = 400;
  artillery.y = 300;
  enemy.x = 500;
  enemy.y = 300;
  const startX = artillery.x;

  updateBattle(battle, 0.05);

  assert.equal(artillery.state, "retreating");
  assert.ok(artillery.x < startX);
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
    allyControlMode: "auto",
    rules: { attackRange: 0, tankSpeed: 100 },
  });
  const water = createBattle({
    width: 1000,
    height: 1000,
    allyControlMode: "auto",
    terrainMovement,
    rules: { attackRange: 0, tankSpeed: 100 },
  });
  const normalUnit = normal.units.find(unit => unit.id === "ally-tank-a-2");
  const waterUnit = water.units.find(unit => unit.id === "ally-tank-a-2");
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
    allyControlMode: "auto",
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
    allyControlMode: "auto",
    rules: { attackRange: 1000, fireInterval: 100, muzzleOffset: 58 },
  });
  const ally = battle.units.find(unit => unit.id === "ally-tank-a-2");
  for (let step = 0; step < 20; step += 1) updateBattle(battle, 1 / 60);
  const shell = battle.shells.find(item => item.team === "ally");
  assert.ok(shell);
  assert.ok(Math.hypot(shell.x - ally.x, shell.y - ally.y) >= 57.9);
});

test("both teams approach and automatically exchange fire", () => {
  const battle = createBattle({
    width: 1200,
    height: 800,
    allyControlMode: "auto",
    rules: {
      tankSpeed: 120,
      attackRange: 220,
      fireInterval: 0.25,
      shellSpeed: 900,
      shellDamage: 25,
    },
  });
  const initialAllyX = battle.units.find(unit => unit.id === "ally-tank-a-1").x;

  for (let step = 0; step < 3000 && !battle.winner; step += 1) {
    updateBattle(battle, 1 / 60);
  }

  const movedAlly = battle.units.find(unit => unit.id === "ally-tank-a-1");
  assert.ok(movedAlly.x > initialAllyX);
  assert.equal(movedAlly.facing, "right");
  assert.equal(battle.units.find(unit => unit.id === "enemy-tank-a-1").facing, "left");
  assert.ok(battle.units.some(unit => unit.hp < unit.maxHp));
  assert.ok(battle.winner);
  const counts = teamCounts(battle);
  assert.ok(counts.ally === 0 || counts.enemy === 0);
});

test("units stop advancing when their target enters attack range", () => {
  const battle = createBattle({
    width: 1000,
    height: 600,
    allyControlMode: "auto",
    rules: { tankSpeed: 100, attackRange: 200, fireInterval: 100 },
  });
  battle.units = battle.units.filter(unit => unit.type === "tank");
  const ally = battle.units.find(unit => unit.id === "ally-tank-a-2");

  for (let step = 0; step < 600; step += 1) updateBattle(battle, 1 / 60);

  const enemy = battle.units.find(unit => unit.id === ally.targetId);
  assert.ok(enemy);
  assert.ok(
    Math.hypot(enemy.x - ally.x, enemy.y - ally.y) <=
    battle.rules.attackRange + battle.rules.rangeTolerance + 0.01
  );
  assert.equal(ally.state, "attacking");
});

test("allied units hold position by default until ordered", () => {
  const battle = createBattle({ width: 1200, height: 800 });
  const ally = battle.units.find(unit => unit.id === "ally-tank-a-2");
  const start = { x: ally.x, y: ally.y };

  updateBattle(battle, 0.05);

  assert.equal(battle.allyControlMode, "hold");
  assert.deepEqual({ x: ally.x, y: ally.y }, start);
  assert.ok(["holding", "attacking"].includes(ally.state));
});

test("manual move orders move held allies toward assigned destinations", () => {
  const battle = createBattle({ width: 1200, height: 800 });
  const ally = battle.units.find(unit => unit.id === "ally-tank-a-2");
  const startX = ally.x;

  issueMoveOrder(battle, [{ unitId: ally.id, x: ally.x + 120, y: ally.y, angle: 0 }]);
  updateBattle(battle, 0.5);

  assert.ok(ally.x > startX);
  assert.equal(ally.command?.type, "move");
  setAllyControlMode(battle, "auto");
  assert.equal(battle.allyControlMode, "auto");
});
