import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraTransform,
  clampCamera,
  createCamera,
  edgeDirection,
  minimumCoverScale,
  moveCamera,
  zoomCameraAt,
} from "../src/camera.js";

test("edge direction increases toward each screen edge", () => {
  assert.deepEqual(edgeDirection(100, 100, 800, 600), { x: 0, y: 0 });
  assert.deepEqual(edgeDirection(0, 300, 800, 600), { x: -1, y: 0 });
  assert.deepEqual(edgeDirection(800, 600, 800, 600), { x: 1, y: 1 });
});

test("the map always covers the visible canvas", () => {
  const camera = createCamera(3200, 3200, { scale: 0.3 });
  assert.equal(minimumCoverScale(camera, 1600, 900), 0.5);
  clampCamera(camera, 1600, 900);
  assert.equal(camera.scale, 0.5);
  zoomCameraAt(camera, 0.1, 800, 450, 1600, 900);
  assert.equal(camera.scale, 0.5);
});

test("camera movement stays inside the map", () => {
  const camera = createCamera(3200, 3200, { scale: 1 });
  moveCamera(camera, 1, 0, 10, 1000, 700);
  assert.equal(camera.centerX, 2700);
  moveCamera(camera, -1, -1, 10, 1000, 700);
  assert.equal(camera.centerX, 500);
  assert.equal(camera.centerY, 350);
});

test("diagonal edge movement uses the same overall speed as horizontal movement", () => {
  const horizontal = createCamera(3200, 3200, { scale: 1 });
  const diagonal = createCamera(3200, 3200, { scale: 1 });
  moveCamera(horizontal, 1, 0, 0.5, 800, 600);
  moveCamera(diagonal, 1, 1, 0.5, 800, 600);
  const horizontalDistance = horizontal.centerX - 1600;
  const diagonalDistance = Math.hypot(
    diagonal.centerX - 1600,
    diagonal.centerY - 1600
  );
  assert.ok(Math.abs(horizontalDistance - diagonalDistance) < 0.001);
});

test("zoom keeps the world position under the pointer stable", () => {
  const camera = createCamera(3200, 3200, { centerX: 1500, centerY: 1400, scale: 0.5 });
  const viewWidth = 1000;
  const viewHeight = 700;
  const pointerX = 700;
  const pointerY = 280;
  const before = cameraTransform(camera, viewWidth, viewHeight);
  const worldX = (pointerX - before.x) / before.scale;
  const worldY = (pointerY - before.y) / before.scale;

  zoomCameraAt(camera, 1, pointerX, pointerY, viewWidth, viewHeight);
  const after = cameraTransform(camera, viewWidth, viewHeight);

  assert.ok(Math.abs(worldX - (pointerX - after.x) / after.scale) < 0.001);
  assert.ok(Math.abs(worldY - (pointerY - after.y) / after.scale) < 0.001);
  clampCamera(camera, viewWidth, viewHeight);
});
