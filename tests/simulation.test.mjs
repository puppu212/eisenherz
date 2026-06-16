import assert from "node:assert/strict";
import test from "node:test";
import {
  clearFireTarget,
  clearMoveOrders,
  createBattle,
  facingFromDirection,
  issueFireTarget,
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
  assert.equal(battle.rules.maxHp, 130);
  assert.equal(battle.rules.artilleryHp, 70);
  assert.equal(battle.rules.fireInterval, 1.35);
  assert.equal(battle.rules.shellSpeed, 1400);
});

test("allies include two long-range artillery formations", () => {
  const battle = createBattle({ width: 3200, height: 3200 });
  const artillery = battle.units.filter(unit => unit.type === "artillery");
  const counts = teamCounts(battle);

  assert.equal(artillery.length, 8);
  assert.ok(artillery.every(unit => unit.team === "ally"));
  assert.ok(artillery.every(unit => unit.role === "rearGuard"));
  assert.equal(new Set(artillery.map(unit => unit.formationId)).size, 2);
  assert.ok(artillery.every(unit => unit.hp === 70 && unit.maxHp === 70));
  assert.ok(artillery.every(unit => unit.x < 1600 && unit.y > 1600));
  assert.equal(counts.ally, 24);
  assert.equal(counts.enemy, 24);
  assert.equal(battle.rules.artilleryRange, 900);
  assert.equal(battle.rules.artilleryFireInterval, 4);
  assert.equal(battle.allyControlMode, "hold");
});

test("allied tanks are split into frontline formations", () => {
  const battle = createBattle();
  const tanks = battle.units.filter(unit => unit.team === "ally" && unit.type === "tank");

  assert.equal(tanks.length, 16);
  assert.ok(tanks.every(unit => unit.role === "frontline"));
  assert.equal(new Set(tanks.map(unit => unit.formationId)).size, 4);
  assert.ok(tanks.every(unit => unit.hp === 130 && unit.maxHp === 130));
});

test("enemy frontline contains enough tanks to contest the enlarged force", () => {
  const battle = createBattle();
  const enemies = battle.units.filter(unit => unit.team === "enemy");

  assert.equal(enemies.length, 24);
  assert.ok(enemies.every(unit => unit.type === "tank"));
  assert.equal(new Set(enemies.map(unit => unit.formationId)).size, 6);
  assert.ok(enemies.every(unit => unit.hp === 130 && unit.maxHp === 130));
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
  assert.deepEqual(enemies.map(unit => unit.hp), [130, 130]);

  for (let step = 0; step < 17; step += 1) updateBattle(battle, 0.05);
  assert.deepEqual(enemies.map(unit => unit.hp), [130, 130]);

  for (let step = 0; step < 3; step += 1) updateBattle(battle, 0.05);
  assert.deepEqual(enemies.map(unit => unit.hp), [100, 100]);
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
    width: 32,
    height: 32,
    tileSize: 100,
    cells: new Float32Array(1024).fill(0.5),
  };
  const normal = createBattle({
    width: 3200,
    height: 3200,
    allyControlMode: "auto",
    rules: { attackRange: 0, tankSpeed: 100 },
  });
  const water = createBattle({
    width: 3200,
    height: 3200,
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

test("clearing move orders removes active allied destinations", () => {
  const battle = createBattle({ width: 1200, height: 800 });
  const ally = battle.units.find(unit => unit.id === "ally-tank-a-2");

  issueMoveOrder(battle, [{ unitId: ally.id, x: ally.x + 120, y: ally.y, angle: 0 }]);
  assert.equal(ally.command?.type, "move");

  clearMoveOrders(battle);

  assert.equal(ally.command, null);
  assert.equal(ally.state, "holding");
});

test("fire target makes all allied units shoot the marked point when in range", () => {
  const battle = createBattle({
    width: 1000,
    height: 600,
    rules: {
      attackRange: 1000,
      fireInterval: 100,
      shellSpeed: 5000,
      shellDamage: 25,
      artilleryRange: 1000,
      artilleryMinRange: 0,
      artilleryFireInterval: 100,
      artilleryFlightTime: 1,
    },
  });
  const tank = battle.units.find(unit => unit.id === "ally-tank-a-1");
  const artillery = battle.units.find(unit => unit.id === "ally-artillery-a-1");
  battle.units = [tank, artillery, ...battle.units.filter(unit => unit.team === "enemy").slice(0, 1)];
  tank.x = 100;
  tank.y = 300;
  tank.cooldown = 0;
  artillery.x = 140;
  artillery.y = 340;
  artillery.cooldown = 0;

  issueFireTarget(battle, 700, 300);
  updateBattle(battle, 0.05);

  assert.deepEqual(battle.fireTarget, { x: 700, y: 300 });
  assert.equal(tank.targetId, null);
  assert.equal(artillery.targetId, null);
  assert.ok(battle.shells.some(shell => shell.type === "direct" && shell.targetX === 700));
  assert.ok(battle.shells.some(shell => shell.type === "artillery" && shell.targetX === 700));

  clearFireTarget(battle);
  assert.equal(battle.fireTarget, null);
});

test("fire target does not fire units that are out of range", () => {
  const battle = createBattle({
    width: 2000,
    height: 1200,
    rules: {
      attackRange: 100,
      fireInterval: 100,
      artilleryRange: 120,
      artilleryMinRange: 0,
      artilleryFireInterval: 100,
    },
  });
  const tank = battle.units.find(unit => unit.id === "ally-tank-a-1");
  const artillery = battle.units.find(unit => unit.id === "ally-artillery-a-1");
  battle.units = [tank, artillery, ...battle.units.filter(unit => unit.team === "enemy").slice(0, 1)];
  tank.x = 100;
  tank.y = 300;
  tank.cooldown = 0;
  artillery.x = 120;
  artillery.y = 320;
  artillery.cooldown = 0;

  issueFireTarget(battle, 900, 300);
  updateBattle(battle, 0.05);

  assert.equal(battle.shells.length, 0);
  assert.equal(tank.state, "holding");
  assert.equal(artillery.state, "holding");
});

test("out of range fire target shoots the range limit when enemies enter the marked direction", () => {
  const battle = createBattle({
    width: 1200,
    height: 800,
    rules: {
      attackRange: 240,
      fireInterval: 100,
      shellSpeed: 100,
      artilleryRange: 260,
      artilleryMinRange: 0,
      artilleryFireInterval: 100,
      artilleryFlightTime: 1,
    },
  });
  const tank = battle.units.find(unit => unit.id === "ally-tank-a-1");
  const artillery = battle.units.find(unit => unit.id === "ally-artillery-a-1");
  const enemy = battle.units.find(unit => unit.team === "enemy");
  battle.units = [tank, artillery, enemy];
  tank.x = 100;
  tank.y = 300;
  tank.cooldown = 0;
  artillery.x = 100;
  artillery.y = 300;
  artillery.cooldown = 0;
  enemy.x = 290;
  enemy.y = 300;

  issueFireTarget(battle, 900, 300);
  updateBattle(battle, 0.05);

  assert.equal(tank.targetId, null);
  assert.equal(artillery.targetId, null);
  assert.ok(battle.shells.some(shell =>
    shell.type === "direct" &&
    shell.targetId === null &&
    Math.abs(shell.targetX - 340) < 0.001 &&
    Math.abs(shell.targetY - 300) < 0.001
  ));
  assert.ok(battle.shells.some(shell =>
    shell.type === "artillery" &&
    Math.abs(shell.targetX - 360) < 0.001 &&
    Math.abs(shell.targetY - 300) < 0.001
  ));
});

test("direct point fire can hit enemies along the shell path before the target point", () => {
  const battle = createBattle({
    width: 900,
    height: 600,
    rules: {
      attackRange: 500,
      fireInterval: 100,
      shellSpeed: 5000,
      shellDamage: 25,
    },
  });
  const tank = battle.units.find(unit => unit.id === "ally-tank-a-1");
  const enemy = battle.units.find(unit => unit.team === "enemy");
  battle.units = [tank, enemy];
  tank.x = 100;
  tank.y = 300;
  tank.cooldown = 0;
  enemy.x = 300;
  enemy.y = 300;

  issueFireTarget(battle, 500, 300);
  updateBattle(battle, 0.05);

  assert.equal(enemy.hp, enemy.maxHp - battle.rules.shellDamage);
  assert.equal(battle.shells.length, 0);
});
