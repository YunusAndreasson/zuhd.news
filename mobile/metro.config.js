// Metro bundler config — extends Expo's defaults to teach Metro about the
// `shared/` directory the app imports via the `@shared/*` alias.
//
// Path resolution:
//   * Local dev: ../shared/ at the repo root (sibling of mobile/).
//   * EAS Build: ./shared/ inside mobile/, populated by scripts/eas-fetch-shared.js
//     as the pre-install hook. Metro's resolver refused to follow the
//     cross-boundary ../shared/ on EAS even with extraNodeModules and a
//     custom resolveRequest, so the EAS build keeps everything inside the
//     project root.

const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const localShared = path.join(projectRoot, 'shared');
const repoShared = path.resolve(projectRoot, '..', 'shared');
const sharedRoot = fs.existsSync(localShared) ? localShared : repoShared;

if (process.env.EAS_BUILD) {
  console.log('[metro.config] projectRoot=', projectRoot);
  console.log('[metro.config] localShared=', localShared, 'exists:', fs.existsSync(localShared));
  console.log('[metro.config] repoShared=', repoShared, 'exists:', fs.existsSync(repoShared));
  console.log('[metro.config] sharedRoot=', sharedRoot);
  try {
    const countries = path.join(sharedRoot, 'countries');
    console.log('[metro.config] sharedRoot ls:', fs.readdirSync(sharedRoot));
    console.log('[metro.config] countries/ ls:', fs.readdirSync(countries));
  } catch (e) {
    console.log('[metro.config] ls err:', e.message);
  }
}

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

const baseResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  // App ships iOS + Android only — drop `web` so Metro doesn't probe
  // `*.web.ts(x)` on every import.
  platforms: ['ios', 'android', 'native'],
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules ?? {}),
    '@shared': sharedRoot,
  },
  // Resolve `@shared/*` directly to a real file. Bypasses Metro's resolver
  // for these imports so it works regardless of extraNodeModules quirks
  // in `expo export:embed --eager` on EAS.
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName === '@shared' || moduleName.startsWith('@shared/')) {
      const subPath = moduleName === '@shared' ? '' : moduleName.slice('@shared/'.length);
      const base = path.join(sharedRoot, subPath);
      const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.json'];
      for (const ext of exts) {
        const candidate = base + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return { type: 'sourceFile', filePath: candidate };
        }
      }
      if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
        for (const ext of exts.filter(Boolean)) {
          const indexFile = path.join(base, `index${ext}`);
          if (fs.existsSync(indexFile)) {
            return { type: 'sourceFile', filePath: indexFile };
          }
        }
      }
      throw new Error(`[metro.config] @shared resolver: nothing matched ${base}{${exts.join(',')}}`);
    }
    if (baseResolveRequest) return baseResolveRequest(context, moduleName, platform);
    return context.resolveRequest(context, moduleName, platform);
  },
  sourceExts: Array.from(
    new Set([...(config.resolver?.sourceExts ?? []), 'ts', 'tsx', 'js', 'jsx', 'json']),
  ),
};

// DIAGNOSTIC ONLY — remove alongside scripts/patch-worklets-diagnostic.js.
// That patch makes worklets report which non-worklet function was called on
// the UI runtime; `keep_fnames` is what stops the release minifier renaming
// it to a single letter first. Terser's keep_fnames is semantics-preserving —
// it exists precisely for code that reads `fn.name`.
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    ...(config.transformer?.minifierConfig ?? {}),
    keep_fnames: true,
    mangle: {
      ...(config.transformer?.minifierConfig?.mangle ?? {}),
      keep_fnames: true,
    },
  },
};

module.exports = config;
