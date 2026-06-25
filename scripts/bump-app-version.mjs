import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const INDEX_URL = new URL("index.html", ROOT);
const THEME_TEST_URL = new URL("tests/theme.test.mjs", ROOT);
const checkOnly = process.argv.includes("--check");

function versionFromIndex(html) {
  const match = html.match(/\.\/src\/app\.js\?v=(\d+)/);
  if (!match) throw new Error("Could not find ./src/app.js?v=N in index.html");
  return Number(match[1]);
}

function versionFromThemeTest(source) {
  const match = source.match(/src="\\\.\\\/src\\\/app\\\.js\\\?v=(\d+)"/);
  if (!match) throw new Error("Could not find app.js version assertion in tests/theme.test.mjs");
  return Number(match[1]);
}

function replaceIndexVersion(html, version) {
  return html.replace(/\.\/src\/app\.js\?v=\d+/, `./src/app.js?v=${version}`);
}

function replaceThemeTestVersion(source, version) {
  return source.replace(
    /src="\\\.\\\/src\\\/app\\\.js\\\?v=\d+"/,
    `src="\\.\\/src\\/app\\.js\\?v=${version}"`
  );
}

const [html, themeTest] = await Promise.all([
  readFile(INDEX_URL, "utf8"),
  readFile(THEME_TEST_URL, "utf8"),
]);

const indexVersion = versionFromIndex(html);
const themeTestVersion = versionFromThemeTest(themeTest);

if (checkOnly) {
  if (indexVersion !== themeTestVersion) {
    throw new Error(
      `app.js version mismatch: index.html has v=${indexVersion}, tests/theme.test.mjs has v=${themeTestVersion}`
    );
  }
  console.log(`app.js version is synchronized at v=${indexVersion}`);
} else {
  const nextVersion = indexVersion + 1;
  await Promise.all([
    writeFile(INDEX_URL, replaceIndexVersion(html, nextVersion)),
    writeFile(THEME_TEST_URL, replaceThemeTestVersion(themeTest, nextVersion)),
  ]);
  console.log(`Bumped app.js cache version: v=${indexVersion} -> v=${nextVersion}`);
}
