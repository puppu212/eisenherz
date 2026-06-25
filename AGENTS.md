# Development Notes

- When changing `src/app.js`, also bump the cache-busting query in `index.html`:
  `./src/app.js?v=N` -> `./src/app.js?v=N+1`.
- Use `node scripts/bump-app-version.mjs` to update both `index.html` and tests that assert the
  current `app.js` version.
- After bumping, run `node scripts/bump-app-version.mjs --check` to confirm the referenced
  `app.js` version is synchronized.
