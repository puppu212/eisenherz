export const DEFAULT_RULES = Object.freeze({
  maxHp: 130,
  tankSpeed: 90,
  attackRange: 650,
  fireInterval: 1.35,
  shellSpeed: 1400,
  shellDamage: 25,
  hitRadius: 44,
  muzzleOffset: 58,
  rangeTolerance: 2,
  explosionFrameDuration: 0.075,
  explosionFrameCount: 9,
  artilleryHp: 70,
  artillerySpeed: 63,
  artilleryRange: 900,
  artilleryMinRange: 250,
  artilleryFireInterval: 4,
  artilleryFlightTime: 1.35,
  artilleryArcHeight: 260,
  artilleryDirectDamage: 60,
  artillerySplashDamage: 30,
  artilleryBlastRadius: 120,
  moveArrivalRadius: 12,
  timeLimit: 300,
});

const FIRE_TARGET_DIRECTION_COSINE = Math.cos(Math.PI / 4);

export function facingFromDirection(directionX, threshold = 0.05) {
  return directionX > threshold ? "right" : "left";
}

export function createBattle(options = {}) {
  const rules = { ...DEFAULT_RULES, ...options.rules };
  const width = options.width ?? 3200;
  const height = options.height ?? 3200;
  const units = [];
  const allyOrigin = { x: width * 0.26, y: height * 0.64 };
  const enemyOrigin = { x: width * 0.74, y: height * 0.36 };

  if (Array.isArray(options.alliedUnits) || Array.isArray(options.enemyUnits)) {
    createRosterUnits(units, {
      team: "ally",
      roster: options.alliedUnits ?? [],
      origin: allyOrigin,
      direction: { x: 1, y: -1 },
      rules,
    });
    createRosterUnits(units, {
      team: "enemy",
      roster: options.enemyUnits ?? [],
      origin: enemyOrigin,
      direction: { x: -1, y: 1 },
      rules,
    });

    return {
      width,
      height,
      rules,
      allyControlMode: options.allyControlMode ?? "hold",
      terrainMovement: options.terrainMovement ?? null,
      units,
      shells: [],
      explosions: [],
      elapsed: 0,
      timeExpired: false,
      winner: null,
      nextShellId: 1,
      nextExplosionId: 1,
      fireTarget: null,
    };
  }

  const alliedFormations = [
    ["tank-a", "frontline-tanks-a", "tank", "frontline", -210, -95],
    ["tank-b", "frontline-tanks-b", "tank", "frontline", 210, 25],
    ["artillery-a", "rear-artillery-a", "artillery", "rearGuard", 0, 270],
  ];
  for (const [id, formation, type, role, offsetX, offsetY] of alliedFormations) {
    createFormation(units, {
      team: "ally",
      idPrefix: `ally-${id}`,
      formationId: `ally-${formation}`,
      type,
      role,
      count: 8,
      origin: { x: allyOrigin.x + offsetX, y: allyOrigin.y + offsetY },
      direction: { x: 1, y: -1 },
      rules,
    });
  }

  const enemyFormations = [
    ["tank-a", "frontline-tanks-a", -320, -110],
    ["tank-b", "frontline-tanks-b", 0, 0],
    ["tank-c", "frontline-tanks-c", 320, 110],
  ];
  for (const [id, formation, offsetX, offsetY] of enemyFormations) {
    createFormation(units, {
      team: "enemy",
      idPrefix: `enemy-${id}`,
      formationId: `enemy-${formation}`,
      type: "tank",
      role: "frontline",
      count: 8,
      origin: { x: enemyOrigin.x + offsetX, y: enemyOrigin.y + offsetY },
      direction: { x: -1, y: 1 },
      rules,
    });
  }

  return {
    width,
    height,
    rules,
    allyControlMode: options.allyControlMode ?? "hold",
    terrainMovement: options.terrainMovement ?? null,
    units,
    shells: [],
    explosions: [],
    elapsed: 0,
    timeExpired: false,
    winner: null,
    nextShellId: 1,
    nextExplosionId: 1,
    fireTarget: null,
  };
}

function createRosterUnits(units, { team, roster, origin, direction, rules }) {
  const formations = new Map();
  for (const unit of roster) {
    const formationId = unit.formationId ?? `${unit.spotId ?? team}-${unit.type ?? "tank"}`;
    if (!formations.has(formationId)) formations.set(formationId, []);
    formations.get(formationId).push(unit);
  }

  const sortedFormations = [...formations.entries()].sort(([first], [second]) =>
    first.localeCompare(second)
  );
  const formationSpacingX = 210;
  const formationSpacingY = 68;
  sortedFormations.forEach(([formationId, formationUnits], formationIndex) => {
    const centerOffset = formationIndex - (sortedFormations.length - 1) / 2;
    const baseX = origin.x - direction.x * centerOffset * formationSpacingX;
    const baseY = origin.y + direction.y * centerOffset * formationSpacingY;
    const columns = Math.ceil(Math.sqrt(formationUnits.length));
    const unitSpacing = 92;

    formationUnits.forEach((sourceUnit, unitIndex) => {
      const column = unitIndex % columns;
      const row = Math.floor(unitIndex / columns);
      const localX = (column - (columns - 1) / 2) * unitSpacing;
      const localY = (row - (Math.ceil(formationUnits.length / columns) - 1) / 2) * unitSpacing;
      const battleUnit = createUnit(
        sourceUnit.id ?? `${team}-${formationId}-${unitIndex + 1}`,
        team,
        baseX + localX,
        baseY + localY,
        rules,
        {
          type: sourceUnit.type,
          role: sourceUnit.role,
          formationId,
        }
      );
      battleUnit.angle = team === "ally" ? 0 : Math.PI;
      battleUnit.facing = team === "ally" ? "right" : "left";
      units.push(battleUnit);
    });
  });
}

export function updateBattle(battle, deltaSeconds) {
  if (deltaSeconds <= 0) return battle;
  battle.explosions ??= [];
  battle.nextExplosionId ??= 1;
  const delta = Math.min(deltaSeconds, 0.05);
  updateExplosions(battle, delta);
  if (battle.winner) return battle;
  battle.elapsed += delta;
  if (battle.rules.timeLimit > 0 && battle.elapsed >= battle.rules.timeLimit) {
    battle.elapsed = battle.rules.timeLimit;
    battle.timeExpired = true;
    battle.winner = "enemy";
    return battle;
  }

  for (const unit of battle.units) {
    if (!unit.alive) continue;
    unit.cooldown = Math.max(0, unit.cooldown - delta);
    if (unit.team === "ally" && battle.fireTarget) {
      updateFireTargetUnit(battle, unit, delta);
      continue;
    }
    const target = nearestEnemy(unit, battle.units);
    unit.targetId = target?.id ?? null;
    if (!target) {
      updateManualMove(battle, unit, delta);
      continue;
    }

    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const distance = Math.hypot(dx, dy);

    if (unit.team === "ally" && !isAutoControlled(battle, unit)) {
      updateHeldUnit(battle, unit, target, dx, dy, distance, delta);
      continue;
    }

    if (unit.type === "artillery") {
      unit.angle = Math.atan2(dy, dx);
      unit.facing = facingFromDirection(dx);
      updateArtilleryUnit(battle, unit, target, dx, dy, distance, delta);
      continue;
    }

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
      unit.angle = Math.atan2(dy, dx);
      unit.facing = facingFromDirection(dx);
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

export function setAllyControlMode(battle, mode) {
  battle.allyControlMode = mode === "auto" ? "auto" : "hold";
  for (const unit of battle.units) {
    if (unit.team === "ally") unit.controlMode = null;
  }
}

export function issueMoveOrder(battle, unitDestinations) {
  for (const { unitId, x, y, angle = 0 } of unitDestinations) {
    const unit = battle.units.find(candidate => candidate.id === unitId && candidate.alive);
    if (!unit || unit.team !== "ally") continue;
    unit.controlMode = "hold";
    unit.command = { type: "move", x, y, angle };
    unit.state = "moving";
  }
}

export function applyV2Strike(battle, x, y, options = {}) {
  if (!battle || battle.winner || !Number.isFinite(x) || !Number.isFinite(y)) return [];
  const team = options.team ?? "ally";
  const innerRadius = options.innerRadius ?? 120;
  const outerRadius = Math.max(innerRadius, options.outerRadius ?? 320);
  const innerDamage = options.innerDamage ?? 130;
  const outerDamage = options.outerDamage ?? 60;
  const hitUnitIds = [];

  for (const unit of battle.units) {
    if (!unit.alive || unit.team === team) continue;
    const distance = Math.hypot(unit.x - x, unit.y - y);
    if (distance > outerRadius) continue;
    damageUnit(battle, unit, distance <= innerRadius ? innerDamage : outerDamage);
    hitUnitIds.push(unit.id);
  }

  createExplosionAt(battle, x, y);
  removeDestroyedUnitsFromTargets(battle);
  battle.winner = determineWinner(battle.units);
  return hitUnitIds;
}

export function clearMoveOrders(battle) {
  for (const unit of battle.units) {
    if (unit.team !== "ally" || unit.command?.type !== "move") continue;
    unit.command = null;
    if (unit.alive) unit.state = "holding";
  }
}

export function issueFireTarget(battle, x, y) {
  battle.fireTarget = {
    x: Math.max(32, Math.min(battle.width - 32, x)),
    y: Math.max(32, Math.min(battle.height - 32, y)),
  };
}

export function clearFireTarget(battle) {
  battle.fireTarget = null;
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

function createUnit(id, team, x, y, rules, metadata = {}) {
  const {
    type = "tank",
    role = "frontline",
    formationId = `${team}-${type}`,
  } = metadata;
  const isArtillery = type === "artillery";
  return {
    id,
    team,
    type,
    role,
    formationId,
    x,
    y,
    angle: team === "ally" ? 0 : Math.PI,
    facing: team === "ally" ? "right" : "left",
    hp: isArtillery ? rules.artilleryHp : rules.maxHp,
    maxHp: isArtillery ? rules.artilleryHp : rules.maxHp,
    cooldown: isArtillery ? 0.8 : 0.25,
    alive: true,
    state: "moving",
    targetId: null,
    command: null,
    controlMode: null,
  };
}

function createFormation(units, options) {
  const lateral = normalize({ x: options.direction.y, y: -options.direction.x });
  const spacing = options.type === "artillery" ? 120 : 96;
  const centerOffset = ((options.count - 1) * spacing) / 2;
  for (let index = 0; index < options.count; index += 1) {
    const offset = index * spacing - centerOffset;
    units.push(createUnit(
      `${options.idPrefix}-${index + 1}`,
      options.team,
      options.origin.x + lateral.x * offset,
      options.origin.y + lateral.y * offset,
      options.rules,
      {
        type: options.type,
        role: options.role,
        formationId: options.formationId,
      }
    ));
  }
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function updateHeldUnit(battle, unit, target, dx, dy, distance, delta) {
  const moved = updateManualMove(battle, unit, delta);
  const attackRange = unit.type === "artillery"
    ? battle.rules.artilleryRange
    : battle.rules.attackRange;
  const minRange = unit.type === "artillery"
    ? battle.rules.artilleryMinRange
    : 0;
  if (
    distance <= attackRange + battle.rules.rangeTolerance &&
    distance >= minRange
  ) {
    unit.angle = Math.atan2(dy, dx);
    unit.facing = facingFromDirection(dx);
    unit.state = "attacking";
    if (unit.cooldown <= 0) {
      if (unit.type === "artillery") {
        fireArtilleryShell(battle, unit, target);
        unit.cooldown = battle.rules.artilleryFireInterval;
      } else {
        fireShell(battle, unit, target);
        unit.cooldown = battle.rules.fireInterval;
      }
    }
  } else if (!moved) {
    unit.state = "holding";
  }
}

function updateFireTargetUnit(battle, unit, delta) {
  let moved = updateManualMove(battle, unit, delta);
  if (!moved && isAutoControlled(battle, unit)) {
    moved = updateAutoPositioningUnit(battle, unit, delta);
  }
  const target = battle.fireTarget;
  if (!target) return;
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const distance = Math.hypot(dx, dy);
  const attackRange = unit.type === "artillery"
    ? battle.rules.artilleryRange
    : battle.rules.attackRange;
  const minRange = unit.type === "artillery"
    ? battle.rules.artilleryMinRange
    : 0;
  unit.targetId = null;

  if (
    distance <= attackRange + battle.rules.rangeTolerance &&
    distance >= minRange
  ) {
    unit.angle = Math.atan2(dy, dx);
    unit.facing = facingFromDirection(dx);
    unit.state = "attacking";
    if (unit.cooldown <= 0) {
      if (unit.type === "artillery") {
        fireArtilleryShellAtPoint(battle, unit, target.x, target.y);
        unit.cooldown = battle.rules.artilleryFireInterval;
      } else {
        fireShellAtPoint(battle, unit, target.x, target.y);
        unit.cooldown = battle.rules.fireInterval;
      }
    }
    return;
  }

  const directionalTarget = enemyInFireTargetDirection(
    battle,
    unit,
    dx,
    dy,
    attackRange,
    minRange
  );
  if (directionalTarget) {
    const rangePoint = pointAtRangeLimit(unit, dx, dy, attackRange);
    unit.angle = Math.atan2(dy, dx);
    unit.facing = facingFromDirection(dx);
    unit.state = "attacking";
    if (unit.cooldown <= 0) {
      if (unit.type === "artillery") {
        fireArtilleryShellAtPoint(battle, unit, rangePoint.x, rangePoint.y);
        unit.cooldown = battle.rules.artilleryFireInterval;
      } else {
        fireShellAtPoint(battle, unit, rangePoint.x, rangePoint.y);
        unit.cooldown = battle.rules.fireInterval;
      }
    }
  } else if (!moved) {
    unit.angle = Math.atan2(dy, dx);
    unit.facing = facingFromDirection(dx);
    unit.state = "holding";
  }
}

function isAutoControlled(battle, unit) {
  return (unit.controlMode ?? battle.allyControlMode) === "auto";
}

function updateAutoPositioningUnit(battle, unit, delta) {
  const target = nearestEnemy(unit, battle.units);
  if (!target) return false;
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const distance = Math.hypot(dx, dy);
  const terrainMultiplier = movementMultiplierAt(battle, unit.x, unit.y);

  if (unit.type === "artillery") {
    unit.angle = Math.atan2(dy, dx);
    unit.facing = facingFromDirection(dx);
    if (distance < battle.rules.artilleryMinRange) {
      unit.state = "retreating";
      moveUnit(
        unit,
        -dx,
        -dy,
        battle.rules.artillerySpeed * terrainMultiplier * delta,
        battle
      );
      return true;
    }
    if (distance > battle.rules.artilleryRange + battle.rules.rangeTolerance) {
      unit.state = "moving";
      moveUnit(
        unit,
        dx,
        dy,
        Math.min(
          battle.rules.artillerySpeed * terrainMultiplier * delta,
          distance - battle.rules.artilleryRange
        ),
        battle
      );
      return true;
    }
    return false;
  }

  if (distance <= battle.rules.attackRange + battle.rules.rangeTolerance) return false;
  unit.state = "moving";
  moveUnit(
    unit,
    dx,
    dy,
    Math.min(
      battle.rules.tankSpeed * terrainMultiplier * delta,
      distance - battle.rules.attackRange
    ),
    battle
  );
  unit.angle = Math.atan2(dy, dx);
  unit.facing = facingFromDirection(dx);
  return true;
}

function updateManualMove(battle, unit, delta) {
  const command = unit.command;
  if (!command || command.type !== "move") return false;
  const dx = command.x - unit.x;
  const dy = command.y - unit.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= battle.rules.moveArrivalRadius) {
    unit.x = command.x;
    unit.y = command.y;
    unit.angle = command.angle;
    unit.facing = facingFromDirection(Math.cos(command.angle));
    unit.command = null;
    unit.state = "holding";
    return false;
  }
  const terrainMultiplier = movementMultiplierAt(battle, unit.x, unit.y);
  const baseSpeed = unit.type === "artillery"
    ? battle.rules.artillerySpeed
    : battle.rules.tankSpeed;
  moveUnit(unit, dx, dy, Math.min(baseSpeed * terrainMultiplier * delta, distance), battle);
  unit.angle = Math.atan2(dy, dx);
  unit.facing = facingFromDirection(dx);
  unit.state = "moving";
  return true;
}

function updateArtilleryUnit(battle, unit, target, dx, dy, distance, delta) {
  const terrainMultiplier = movementMultiplierAt(battle, unit.x, unit.y);
  if (distance < battle.rules.artilleryMinRange) {
    unit.state = "retreating";
    moveUnit(
      unit,
      -dx,
      -dy,
      battle.rules.artillerySpeed * terrainMultiplier * delta,
      battle
    );
    return;
  }

  if (distance > battle.rules.artilleryRange + battle.rules.rangeTolerance) {
    unit.state = "moving";
    moveUnit(
      unit,
      dx,
      dy,
      Math.min(
        battle.rules.artillerySpeed * terrainMultiplier * delta,
        distance - battle.rules.artilleryRange
      ),
      battle
    );
    return;
  }

  unit.state = "attacking";
  if (unit.cooldown <= 0) {
    fireArtilleryShell(battle, unit, target);
    unit.cooldown = battle.rules.artilleryFireInterval;
  }
}

function moveUnit(unit, dx, dy, travel, battle) {
  const distance = Math.hypot(dx, dy);
  if (!distance) return;
  unit.x += (dx / distance) * travel;
  unit.y += (dy / distance) * travel;
  clampUnit(unit, battle);
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

function enemyInFireTargetDirection(battle, unit, targetDx, targetDy, attackRange, minRange) {
  const targetDistance = Math.hypot(targetDx, targetDy);
  if (!targetDistance) return null;
  const directionX = targetDx / targetDistance;
  const directionY = targetDy / targetDistance;
  let target = null;
  let bestDistance = Infinity;
  for (const candidate of battle.units) {
    if (!candidate.alive || candidate.team === unit.team) continue;
    const dx = candidate.x - unit.x;
    const dy = candidate.y - unit.y;
    const distance = Math.hypot(dx, dy);
    if (
      distance > attackRange + battle.rules.rangeTolerance ||
      distance < minRange ||
      distance === 0
    ) continue;
    const alignment = (dx / distance) * directionX + (dy / distance) * directionY;
    if (alignment < FIRE_TARGET_DIRECTION_COSINE) continue;
    if (distance < bestDistance) {
      target = candidate;
      bestDistance = distance;
    }
  }
  return target;
}

function pointAtRangeLimit(unit, targetDx, targetDy, attackRange) {
  const targetDistance = Math.hypot(targetDx, targetDy) || 1;
  return {
    x: unit.x + (targetDx / targetDistance) * attackRange,
    y: unit.y + (targetDy / targetDistance) * attackRange,
  };
}

function fireShell(battle, source, target) {
  const angle = Math.atan2(target.y - source.y, target.x - source.x);
  battle.shells.push({
    id: `shell-${battle.nextShellId++}`,
    type: "direct",
    team: source.team,
    targetId: target.id,
    x: source.x + Math.cos(angle) * battle.rules.muzzleOffset,
    y: source.y + Math.sin(angle) * battle.rules.muzzleOffset,
    angle,
    alive: true,
  });
}

function fireShellAtPoint(battle, source, targetX, targetY) {
  const angle = Math.atan2(targetY - source.y, targetX - source.x);
  battle.shells.push({
    id: `shell-${battle.nextShellId++}`,
    type: "direct",
    team: source.team,
    targetId: null,
    targetX,
    targetY,
    x: source.x + Math.cos(angle) * battle.rules.muzzleOffset,
    y: source.y + Math.sin(angle) * battle.rules.muzzleOffset,
    angle,
    alive: true,
  });
}

function fireArtilleryShell(battle, source, target) {
  const impact = artilleryAimPoint(target, battle.units, battle.rules.artilleryBlastRadius);
  fireArtilleryShellAtPoint(battle, source, impact.x, impact.y);
}

function fireArtilleryShellAtPoint(battle, source, targetX, targetY) {
  const impact = { x: targetX, y: targetY };
  const angle = Math.atan2(impact.y - source.y, impact.x - source.x);
  battle.shells.push({
    id: `shell-${battle.nextShellId++}`,
    type: "artillery",
    team: source.team,
    x: source.x,
    y: source.y,
    startX: source.x,
    startY: source.y,
    targetX: impact.x,
    targetY: impact.y,
    angle,
    age: 0,
    duration: battle.rules.artilleryFlightTime,
    arcHeight: battle.rules.artilleryArcHeight,
    progress: 0,
    alive: true,
  });
}

function artilleryAimPoint(primaryTarget, units, blastRadius) {
  const nearby = units.filter(unit =>
    unit.alive &&
    unit.team === primaryTarget.team &&
    Math.hypot(unit.x - primaryTarget.x, unit.y - primaryTarget.y) <= blastRadius * 2
  );
  return {
    x: nearby.reduce((sum, unit) => sum + unit.x, 0) / nearby.length,
    y: nearby.reduce((sum, unit) => sum + unit.y, 0) / nearby.length,
  };
}

function updateShells(battle, delta) {
  const unitsById = new Map(battle.units.map(unit => [unit.id, unit]));
  for (const shell of battle.shells) {
    if (!shell.alive) continue;
    if (shell.type === "artillery") {
      updateArtilleryShell(battle, shell, delta);
      continue;
    }
    if (!shell.targetId) {
      updatePointShell(battle, shell, delta);
      continue;
    }
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
      damageUnit(battle, target, battle.rules.shellDamage);
      shell.alive = false;
      continue;
    }

    shell.x += (dx / distance) * travel;
    shell.y += (dy / distance) * travel;
  }
  battle.shells = battle.shells.filter(shell => shell.alive);
}

function updatePointShell(battle, shell, delta) {
  const dx = shell.targetX - shell.x;
  const dy = shell.targetY - shell.y;
  const distance = Math.hypot(dx, dy);
  shell.angle = Math.atan2(dy, dx);
  const travel = battle.rules.shellSpeed * delta;
  const nextX = distance > 0 ? shell.x + (dx / distance) * Math.min(travel, distance) : shell.x;
  const nextY = distance > 0 ? shell.y + (dy / distance) * Math.min(travel, distance) : shell.y;
  const hit = directShellPathHit(battle, shell, nextX, nextY);
  if (hit) {
    damageUnit(battle, hit, battle.rules.shellDamage);
    shell.alive = false;
    return;
  }

  if (distance <= battle.rules.hitRadius + travel || distance === 0) {
    applyDirectImpact(battle, shell);
    shell.alive = false;
    return;
  }

  shell.x = nextX;
  shell.y = nextY;
}

function updateArtilleryShell(battle, shell, delta) {
  shell.age += delta;
  shell.progress = Math.min(1, shell.age / shell.duration);
  shell.x = shell.startX + (shell.targetX - shell.startX) * shell.progress;
  shell.y = shell.startY + (shell.targetY - shell.startY) * shell.progress;
  shell.angle = Math.atan2(shell.targetY - shell.startY, shell.targetX - shell.startX);
  if (shell.progress < 1) return;

  applyArtilleryImpact(battle, shell);
  createExplosionAt(battle, shell.targetX, shell.targetY);
  shell.alive = false;
}

function applyArtilleryImpact(battle, shell) {
  for (const unit of battle.units) {
    if (!unit.alive || unit.team === shell.team) continue;
    const distance = Math.hypot(unit.x - shell.targetX, unit.y - shell.targetY);
    if (distance > battle.rules.artilleryBlastRadius) continue;
    const damage = distance <= battle.rules.hitRadius
      ? battle.rules.artilleryDirectDamage
      : battle.rules.artillerySplashDamage;
    damageUnit(battle, unit, damage);
  }
}

function applyDirectImpact(battle, shell) {
  for (const unit of battle.units) {
    if (!unit.alive || unit.team === shell.team) continue;
    const distance = Math.hypot(unit.x - shell.targetX, unit.y - shell.targetY);
    if (distance > battle.rules.hitRadius) continue;
    damageUnit(battle, unit, battle.rules.shellDamage);
  }
}

function directShellPathHit(battle, shell, nextX, nextY) {
  let hit = null;
  let bestProgress = Infinity;
  for (const unit of battle.units) {
    if (!unit.alive || unit.team === shell.team) continue;
    const progress = closestSegmentProgress(shell.x, shell.y, nextX, nextY, unit.x, unit.y);
    const closestX = shell.x + (nextX - shell.x) * progress;
    const closestY = shell.y + (nextY - shell.y) * progress;
    const distance = Math.hypot(unit.x - closestX, unit.y - closestY);
    if (distance > battle.rules.hitRadius || progress >= bestProgress) continue;
    hit = unit;
    bestProgress = progress;
  }
  return hit;
}

function closestSegmentProgress(startX, startY, endX, endY, pointX, pointY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return 0;
  const progress = ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared;
  return Math.max(0, Math.min(1, progress));
}

function damageUnit(battle, unit, damage) {
  unit.hp = Math.max(0, unit.hp - damage);
  unit.alive = unit.hp > 0;
  unit.state = unit.alive ? unit.state : "destroyed";
  if (!unit.alive) createExplosion(battle, unit);
}

function createExplosion(battle, unit) {
  createExplosionAt(battle, unit.x, unit.y);
}

function createExplosionAt(battle, x, y) {
  battle.explosions.push({
    id: `explosion-${battle.nextExplosionId++}`,
    x,
    y,
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
