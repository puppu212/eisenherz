import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFormationDestinations,
  centeredGridOffset,
  groupSelectedFormations,
} from "../src/formation.js";

const units = [
  unit("tank-b-2", "frontline", "frontline-b"),
  unit("tank-a-2", "frontline", "frontline-a"),
  unit("artillery-a-1", "rearGuard", "rear-a"),
  unit("tank-a-1", "frontline", "frontline-a"),
];

test("selected formations are grouped by role and sorted by formation id", () => {
  const groups = groupSelectedFormations(units);

  assert.deepEqual(
    groups.get("frontline").map(formation => formation.id),
    ["frontline-a", "frontline-b"]
  );
  assert.deepEqual(
    groups.get("frontline")[0].units.map(item => item.id),
    ["tank-a-2", "tank-a-1"]
  );
  assert.deepEqual(groups.get("rearGuard").map(formation => formation.id), ["rear-a"]);
});

test("line formations keep rear guard behind the frontline", () => {
  const destinations = buildFormationDestinations({
    centerX: 1000,
    centerY: 1000,
    angle: 0,
    units,
    style: "line",
  });
  const frontline = destinations.filter(destination => destination.role === "frontline");
  const rear = destinations.filter(destination => destination.role === "rearGuard");

  assert.equal(destinations.length, units.length);
  assert.ok(frontline.every(destination => destination.x === 1000));
  assert.ok(rear.every(destination => destination.x === 810));
});

test("dense formations compact selected units into centered rows", () => {
  const destinations = buildFormationDestinations({
    centerX: 1000,
    centerY: 1000,
    angle: 0,
    units,
    style: "dense",
  });

  assert.deepEqual(
    destinations.map(destination => Math.round(destination.y)),
    [904, 968, 1032, 1096]
  );
  assert.deepEqual(
    destinations.map(destination => Math.round(destination.x)),
    [1000, 1000, 1000, 1000]
  );
});

test("grid offsets are centered around the requested column count", () => {
  assert.deepEqual(centeredGridOffset(0, 0, 3, 64, 64), { lateral: -64, forward: -0 });
  assert.deepEqual(centeredGridOffset(2, 1, 3, 64, 64), { lateral: 64, forward: -64 });
});

function unit(id, role, formationId) {
  return {
    id,
    role,
    formationId,
  };
}
