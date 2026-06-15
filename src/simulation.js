export const DEFAULT_RULES = Object.freeze({
  maxHp: 100,
  tankSpeed: 90,
  attackRange: 420,
  fireInterval: 1.15,
  shellSpeed: 1000,
  shellDamage: 25,
  hitRadius: 44,
  muzzleOffset: 58,
  rangeTolerance: 2,
  explosionFrameDuration: 0.075,
  explosionFrameCount: 9,
});

export function facingFromDirection(directionX, threshold = 0.05) {
  return directionX > threshold ? "right" : "left";
}

export function createBattle(options = {}) {
  const rules = { ...DEFAULT_RULES, ...options.rules };
  const width = options.width ?? 3200;
  const height = options.height ?? 3200;
  const units = [];
  const spacing = 100;
  const allyOrigin = { x: width * 0.28, y: height * 0.62 };
  const enemyOrigin = { x: width * 0.72, y: height * 0.38 };

  for (let index = 0; index < 3; index += 1) {
    const offset = (index - 1) * spacing;
    units.push(createUnit(
      `ally-${index + 1}`,
      "ally",
      allyOrigin.x + offset,
      allyOrigin.y + offset,
      rules
    ));
    units.push(createUnit(
      `enemy-${index + 1}`,
      "enemy",
      enemyOrigin.x + offset,
      enemyOrigin.y + offset,
      rules
    ));
  }

  return {
    width,
    height,
    rules,
    terrainMovement: options.terrainMovement ?? null,
    units,
    shells: [],
    explosions: [],
    elapsed: 0,
    winner: null,
    nextShellId: 1,
    nextExplosionId: 1,
  };
}

export function updateBattle(battle, deltaSeconds) {
  if (deltaSeconds <= 0) return battle;
  battle.explosions ??= [];
  battle.nextExplosionId ??= 1;
  const delta = Math.min(deltaSeconds, 0.05);
  updateExplosions(battle, delta);
  if (battle.winner) return battle;
  battle.elapsed += delta;

  for (const unit of battle.units) {
    if (!unit.alive) continue;
    unit.cooldown = Math.max(0, unit.cooldown - delta);
    const target = nearestEnemy(unit, battle.units);
    unit.targetId = target?.id ?? null;
    if (!target) continue;

    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const distance = Math.hypot(dx, dy);
    unit.angle = Math.atan2(dy, dx);
    unit.facing = facingFromDirection(dx);

    if (distance > battle.rules.attackRange + battle.rules.rangeTolerance) {
      unit.state = "moving";
      const terrainMultiplier = movementMultiplierAt(battle, unit.x, unit.y);
      const travel = Math.min(
        battle.rules.tankSpeed * terrainMultiplier * delta,
        distance - battle.rules.attackRange
      );
      unit.x += (dx / distance) * travel;
      unit.y += (dy / distance) * travel;
      clampUnit(unit, battle);
    } else {
      unit.state = "attacking";
      if (unit.cooldown <= 0) {
        fireShell(battle, unit, target);
        unit.cooldown = battle.rules.fireInterval;
      }
    }
  }

  updateShells(battle, delta);
  removeDestroyedUnitsFromTargets(battle);
  battle.winner = determineWinner(battle.units);
  return battle;
}

export function movementMultiplierAt(battle, x, y) {
  const terrain = battle.terrainMovement;
  if (!terrain) return 1;
  const tileX = Math.floor(x / terrain.tileSize);
  const tileY = Math.floor(y / terrain.tileSize);
  if (tileX < 0 || tileY < 0 || tileX >= terrain.width || tileY >= terrain.height) return 1;
  return terrain.cells[tileY * terrain.width + tileX] ?? 1;
}

export function teamCounts(battle) {
  return battle.units.reduce((counts, unit) => {
    if (unit.alive) counts[unit.team] += 1;
    return counts;
  }, { ally: 0, enemy: 0 });
}

function createUnit(id, team, x, y, rules) {
  return {
    id,
    team,
    x,
    y,
    angle: team === "ally" ? 0 : Math.PI,
    facing: team === "ally" ? "right" : "left",
    hp: rules.maxHp,
    maxHp: rules.maxHp,
    cooldown: 0.25,
    alive: true,
    state: "moving",
    targetId: null,
  };
}

function nearestEnemy(unit, units) {
  let target = null;
  let bestDistance = Infinity;
  for (const candidate of units) {
    if (!candidate.alive || candidate.team === unit.team) continue;
    const distance = Math.hypot(candidate.x - unit.x, candidate.y - unit.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      target = candidate;
    }
  }
  return target;
}

function fireShell(battle, source, target) {
  const angle = Math.atan2(target.y - source.y, target.x - source.x);
  battle.shells.push({
    id: `shell-${battle.nextShellId++}`,
    team: source.team,
    targetId: target.id,
    x: source.x + Math.cos(angle) * battle.rules.muzzleOffset,
    y: source.y + Math.sin(angle) * battle.rules.muzzleOffset,
    angle,
    alive: true,
  });
}

function updateShells(battle, delta) {
  const unitsById = new Map(battle.units.map(unit => [unit.id, unit]));
  for (const shell of battle.shells) {
    if (!shell.alive) continue;
    const target = unitsById.get(shell.targetId);
    if (!target?.alive) {
      shell.alive = false;
      continue;
    }

    const dx = target.x - shell.x;
    const dy = target.y - shell.y;
    const distance = Math.hypot(dx, dy);
    shell.angle = Math.atan2(dy, dx);
    const travel = battle.rules.shellSpeed * delta;

    if (distance <= battle.rules.hitRadius + travel) {
      target.hp = Math.max(0, target.hp - battle.rules.shellDamage);
      target.alive = target.hp > 0;
      target.state = target.alive ? target.state : "destroyed";
      if (!target.alive) createExplosion(battle, target);
      shell.alive = false;
      continue;
    }

    shell.x += (dx / distance) * travel;
    shell.y += (dy / distance) * travel;
  }
  battle.shells = battle.shells.filter(shell => shell.alive);
}

function createExplosion(battle, unit) {
  battle.explosions.push({
    id: `explosion-${battle.nextExplosionId++}`,
    x: unit.x,
    y: unit.y,
    age: 0,
  });
}

function updateExplosions(battle, delta) {
  const duration =
    battle.rules.explosionFrameDuration * battle.rules.explosionFrameCount;
  for (const explosion of battle.explosions) explosion.age += delta;
  battle.explosions = battle.explosions.filter(explosion => explosion.age < duration);
}

function removeDestroyedUnitsFromTargets(battle) {
  const living = new Set(battle.units.filter(unit => unit.alive).map(unit => unit.id));
  for (const unit of battle.units) {
    if (unit.targetId && !living.has(unit.targetId)) unit.targetId = null;
  }
}

function determineWinner(units) {
  const allyAlive = units.some(unit => unit.alive && unit.team === "ally");
  const enemyAlive = units.some(unit => unit.alive && unit.team === "enemy");
  if (allyAlive && enemyAlive) return null;
  if (allyAlive) return "ally";
  if (enemyAlive) return "enemy";
  return "draw";
}

function clampUnit(unit, battle) {
  unit.x = Math.max(32, Math.min(battle.width - 32, unit.x));
  unit.y = Math.max(32, Math.min(battle.height - 32, unit.y));
}
