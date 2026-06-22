import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("battle sprites use the WebP asset set", async () => {
  await Promise.all([
    access(new URL("../assets/unit/ger1.webp", import.meta.url)),
    access(new URL("../assets/unit/ger2.webp", import.meta.url)),
    access(new URL("../assets/unit/sov1.webp", import.meta.url)),
    access(new URL("../assets/effect/tank_gun.webp", import.meta.url)),
    access(new URL("../assets/effect/grenades.webp", import.meta.url)),
    access(new URL("../assets/character/char1.webp", import.meta.url)),
    access(new URL("../assets/world/world.webp", import.meta.url)),
    access(new URL("../assets/spot/spot1.webp", import.meta.url)),
    access(new URL("../assets/spot/spot2.webp", import.meta.url)),
    access(new URL("../assets/flag/flag1.png", import.meta.url)),
    access(new URL("../assets/spot/strategy.json", import.meta.url)),
    access(new URL("../assets/title/title.webp", import.meta.url)),
    access(new URL("../assets/title/easy.webp", import.meta.url)),
    access(new URL("../assets/title/normal.webp", import.meta.url)),
    access(new URL("../assets/title/hard.webp", import.meta.url)),
    access(new URL("../assets/title/continue.webp", import.meta.url)),
    access(new URL("../assets/title/tool.webp", import.meta.url)),
    access(new URL("../assets/pre/pre1.webp", import.meta.url)),
    ...Array.from(
      { length: 9 },
      (_, index) => access(new URL(`../assets/effect/ex${index + 1}.webp`, import.meta.url))
    ),
  ]);

  const source = await import("node:fs/promises")
    .then(({ readFile }) => readFile(new URL("../src/app.js", import.meta.url), "utf8"));
  assert.match(source, /ger1\.webp/);
  assert.match(source, /ger2\.webp/);
  assert.match(source, /sov1\.webp/);
  assert.match(source, /tank_gun\.webp/);
  assert.match(source, /grenades\.webp/);
  assert.match(source, /world\.webp/);
  assert.match(source, /spot1\.webp/);
  assert.match(source, /spot2\.webp/);
  assert.match(source, /function strategySpotScale\(spot\)/);
  assert.match(source, /flag1\.png/);
  assert.match(source, /const SHELL_SIZE = 56;/);
  assert.match(source, /const ARTILLERY_SHELL_SIZE = 64;/);
  assert.match(source, /const EXPLOSION_SIZE = 176;/);
  assert.match(source, /EXPLOSION_FRAME_COUNT = 9/);
  assert.match(source, /state\.battle\.explosions \?\?= \[\]/);

  const strategy = JSON.parse(
    await readFile(new URL("../assets/spot/strategy.json", import.meta.url), "utf8")
  );
  assert.equal(strategy.spots.find(spot => spot.id === "spot2")?.scale, 0.5);
});
