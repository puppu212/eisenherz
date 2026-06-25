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
    access(new URL("../assets/spot/Berlin.webp", import.meta.url)),
    access(new URL("../assets/spot/spot.webp", import.meta.url)),
    access(new URL("../assets/spot/city.webp", import.meta.url)),
    access(new URL("../assets/spot/port.webp", import.meta.url)),
    access(new URL("../assets/flag/flag1.webp", import.meta.url)),
    access(new URL("../assets/flag/flag6.webp", import.meta.url)),
    access(new URL("../assets/character/char6.webp", import.meta.url)),
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
  assert.match(source, /Berlin\.webp/);
  assert.match(source, /spot\.webp/);
  assert.match(source, /city\.webp/);
  assert.match(source, /port\.webp/);
  assert.match(source, /function strategySpotScale\(spot\)/);
  assert.match(source, /DEFAULT_SPOT_SCALE_BY_IMAGE/);
  assert.doesNotMatch(source, /ctx\.fillText\(spot\.name/);
  assert.match(source, /flag1\.webp/);
  assert.match(source, /flag6\.webp/);
  assert.match(source, /const SHELL_SIZE = 56;/);
  assert.match(source, /const ARTILLERY_SHELL_SIZE = 64;/);
  assert.match(source, /const EXPLOSION_SIZE = 176;/);
  assert.match(source, /EXPLOSION_FRAME_COUNT = 9/);
  assert.match(source, /state\.battle\.explosions \?\?= \[\]/);

  const strategy = JSON.parse(
    await readFile(new URL("../assets/spot/strategy.json", import.meta.url), "utf8")
  );
  assert.equal(strategy.factions.find(faction => faction.id === "poland")?.commander, "Anastazja");
  assert.equal(strategy.factions.find(faction => faction.id === "poland")?.selectable, false);
  assert.equal(strategy.spots.find(spot => spot.name === "Berlin")?.image, "Berlin");
  assert.equal(strategy.spots.find(spot => spot.name === "Koenigsberg")?.image, "port");
  assert.equal(strategy.spots.find(spot => spot.name === "Warsaw")?.image, "city");
  assert.deepEqual(
    strategy.spots
      .filter(spot => !["Berlin", "Koenigsberg", "Warsaw"].includes(spot.name))
      .map(spot => spot.image),
    ["spot", "spot"]
  );
  assert.equal(strategy.spots.some(spot => "labelOffsetX" in spot), false);
  assert.equal(strategy.spots.some(spot => "flagOffsetX" in spot), false);
  assert.equal(strategy.spots.some(spot => "scale" in spot), false);
});
