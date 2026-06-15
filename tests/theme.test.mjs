import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the interface follows the black red and white design system", async () => {
  const [css, app, html] = await Promise.all([
    readFile(new URL("../styles.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);

  assert.match(css, /--black:\s*#000000/);
  assert.match(css, /--red:\s*#db0814/);
  assert.match(css, /--white:\s*#ffffff/);
  assert.match(css, /--font-display:[^;]*UnifrakturCook/);
  assert.match(css, /--font-ui:[^;]*Noto Serif JP/);
  assert.match(css, /\.top-bar[^}]*border-bottom:\s*4px solid var\(--white\)/s);
  assert.match(css, /button\s*\{[^}]*border:\s*3px solid var\(--white\)/s);
  assert.doesNotMatch(css, /box-shadow|text-shadow/);
  assert.match(app, /unit\.team === "ally" \? "#ffffff" : "#db0814"/);
  assert.match(html, /name="theme-color" content="#000000"/);
  assert.match(html, /<h1>DEMO<\/h1>/);
  assert.match(html, /<p class="eyebrow">EISENHERZ<\/p>/);
  assert.match(html, /id="ally-count">3<\/b>\s*ALLIES<\/span>/);
  assert.match(html, /id="enemy-count">3<\/b>\s*ENEMIES<\/span>/);
  assert.match(html, /id="toggle-pause"[^>]*>PAUSE<\/button>/);
  assert.match(html, /id="restart"[^>]*>RESTART<\/button>/);
  assert.match(html, /class="commander-panel"/);
  assert.match(html, /class="commander-name">ELISE<\/strong>/);
  assert.match(html, /src="\.\/assets\/character\/char1\.webp"/);
  assert.match(html, /id="panel-unit-count"/);
  assert.match(html, /id="panel-strength"/);
  assert.match(html, /id="panel-status"/);
  assert.match(html, /id="battle-result"[^>]*hidden/);
  assert.match(html, /id="result-title"/);
  assert.match(html, /id="result-restart"[^>]*>RESTART BATTLE<\/button>/);
  assert.match(html, /id="start-screen"/);
  assert.match(html, /id="start-title">EISENHERZ<\/h2>/);
  assert.match(html, /id="start-battle"[^>]*>START BATTLE<\/button>/);
  assert.doesNotMatch(html, /CLICK \/ ENTER \/ SPACE TO START/);
  assert.match(html, /class="start-controls"/);
  assert.doesNotMatch(app, /startScreen\.addEventListener\("pointerup"/);
  assert.match(css, /button\.is-active\s*\{[^}]*background:\s*var\(--white\)/s);
  assert.match(css, /\.battle-result\s*\{[^}]*border:\s*4px solid var\(--white\)/s);
  assert.match(css, /#result-restart\s*\{[^}]*background:\s*var\(--red\)/s);
  assert.match(css, /\.start-screen\s*\{[^}]*background:\s*var\(--black\)/s);
  assert.match(css, /#start-battle\s*\{[^}]*background:\s*var\(--red\)/s);
  assert.match(css, /\.commander-panel\s*\{[^}]*width:\s*360px;[^}]*border:\s*3px solid var\(--white\)/s);
  assert.match(css, /\.battle-status\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 148px minmax\(0, 1fr\)/s);
  assert.match(css, /\.battle-status\s*\{[^}]*width:\s*372px;[^}]*min-width:\s*372px;[^}]*max-width:\s*372px/s);
  assert.match(css, /#battle-message\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*148px/s);
  assert.match(app, /\["Enter", "Space"\]\.includes\(event\.code\)/);
  assert.match(app, /if \(!state\.started\) \{\s*startBattle\(\)/s);
  assert.match(app, /if \(state\.started && !state\.paused\) updateBattle/);
  assert.match(app, /pauseButton\.textContent = state\.paused \? "RESUME" : "PAUSE"/);
  assert.match(app, /function initialCameraScale\(\) \{\s*return CAMERA_LIMITS\.minScale;/s);
});
