import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

test("battle sprites use the WebP asset set", async () => {
  await Promise.all([
    access(new URL("../assets/unit/ger1.webp", import.meta.url)),
    access(new URL("../assets/unit/ger2.webp", import.meta.url)),
    access(new URL("../assets/unit/sov1.webp", import.meta.url)),
    access(new URL("../assets/effect/tank_gun.webp", import.meta.url)),
    access(new URL("../assets/effect/grenades.webp", import.meta.url)),
    access(new URL("../assets/character/char1.webp", import.meta.url)),
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
  assert.match(source, /const SHELL_SIZE = 56;/);
  assert.match(source, /const ARTILLERY_SHELL_SIZE = 64;/);
  assert.match(source, /const EXPLOSION_SIZE = 176;/);
  assert.match(source, /EXPLOSION_FRAME_COUNT = 9/);
  assert.match(source, /state\.battle\.explosions \?\?= \[\]/);
});
