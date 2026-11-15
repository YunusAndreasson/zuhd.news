---
paths:
  - "mobile/app.json"
  - "mobile/eas.json"
  - "mobile/package.json"
  - "mobile/native-runtimes.json"
  - "mobile/scripts/check-runtime.js"
  - "mobile/scripts/eas-update.sh"
  - "mobile/scripts/release.sh"
  - "mobile/scripts/eas-fetch-shared.js"
  - "mobile/plugins/**"
  - "mobile/patches/**"
  - ".easignore"
---

# Releasing the app

- A store build is `npm run release` (`scripts/release.sh`, `--check` for the preflight alone); an OTA update is `npm run ota -- -m "…"` (`scripts/eas-update.sh`). Never call `eas update` or `eas build` directly: only these check the runtime, the tree and the upstream.
- `native-runtimes.json` holds each `runtimeVersion`'s native fingerprint, checked by `npm run verify`, `eas-build-post-install` and `npm run ota`. A native change (a native package, a plugin, a patch, native app config) needs a NEW `runtimeVersion` in `app.json`, then `npm run runtime:record`; never edit or replace a recorded hash. `retired` lists the runtimes shipped before the record existed, so none can be recorded again.
- `.easignore` at the repo root is an allow-list: EAS uploads only `mobile/`. A file the build needs outside `mobile/` must be let back in there; `shared/` is not, because `eas-fetch-shared.js` fetches it from GitHub at the build's commit, which must be pushed.
