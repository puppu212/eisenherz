export const CAMERA_LIMITS = Object.freeze({
  minScale: 0.3,
  maxScale: 2,
  edgeSize: 72,
  edgeSpeed: 620,
});

export function createCamera(worldWidth, worldHeight, options = {}) {
  return {
    centerX: options.centerX ?? worldWidth / 2,
    centerY: options.centerY ?? worldHeight / 2,
    scale: options.scale ?? 0.6,
    worldWidth,
    worldHeight,
  };
}

export function clampCamera(camera, viewWidth, viewHeight) {
  camera.scale = Math.max(camera.scale, minimumCoverScale(camera, viewWidth, viewHeight));
  const halfVisibleWidth = viewWidth / (2 * camera.scale);
  const halfVisibleHeight = viewHeight / (2 * camera.scale);

  camera.centerX = clampAxis(camera.centerX, halfVisibleWidth, camera.worldWidth);
  camera.centerY = clampAxis(camera.centerY, halfVisibleHeight, camera.worldHeight);
  return camera;
}

export function cameraTransform(camera, viewWidth, viewHeight) {
  return {
    scale: camera.scale,
    x: viewWidth / 2 - camera.centerX * camera.scale,
    y: viewHeight / 2 - camera.centerY * camera.scale,
  };
}

export function moveCamera(camera, screenDx, screenDy, deltaSeconds, viewWidth, viewHeight, options = {}) {
  const speed = options.edgeSpeed ?? CAMERA_LIMITS.edgeSpeed;
  const magnitude = Math.hypot(screenDx, screenDy);
  const normalization = magnitude > 1 ? 1 / magnitude : 1;
  camera.centerX += (screenDx * normalization * speed * deltaSeconds) / camera.scale;
  camera.centerY += (screenDy * normalization * speed * deltaSeconds) / camera.scale;
  return clampCamera(camera, viewWidth, viewHeight);
}

export function zoomCameraAt(camera, nextScale, screenX, screenY, viewWidth, viewHeight, options = {}) {
  const minScale = Math.max(
    options.minScale ?? CAMERA_LIMITS.minScale,
    minimumCoverScale(camera, viewWidth, viewHeight)
  );
  const maxScale = options.maxScale ?? CAMERA_LIMITS.maxScale;
  const clampedScale = Math.max(minScale, Math.min(maxScale, nextScale));
  const worldX = camera.centerX + (screenX - viewWidth / 2) / camera.scale;
  const worldY = camera.centerY + (screenY - viewHeight / 2) / camera.scale;

  camera.scale = clampedScale;
  camera.centerX = worldX - (screenX - viewWidth / 2) / camera.scale;
  camera.centerY = worldY - (screenY - viewHeight / 2) / camera.scale;
  return clampCamera(camera, viewWidth, viewHeight);
}

export function edgeDirection(x, y, viewWidth, viewHeight, edgeSize = CAMERA_LIMITS.edgeSize) {
  return {
    x: edgeAxis(x, viewWidth, edgeSize),
    y: edgeAxis(y, viewHeight, edgeSize),
  };
}

export function minimumCoverScale(camera, viewWidth, viewHeight) {
  return Math.max(
    CAMERA_LIMITS.minScale,
    viewWidth / camera.worldWidth,
    viewHeight / camera.worldHeight
  );
}

function edgeAxis(position, size, edgeSize) {
  if (position < edgeSize) return -Math.min(1, (edgeSize - position) / edgeSize);
  if (position > size - edgeSize) return Math.min(1, (position - (size - edgeSize)) / edgeSize);
  return 0;
}

function clampAxis(value, halfVisible, worldSize) {
  if (halfVisible * 2 >= worldSize) return worldSize / 2;
  return Math.max(halfVisible, Math.min(worldSize - halfVisible, value));
}
