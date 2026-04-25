// Metro bundler config — extends Expo's defaults to teach Metro about the
// repo-root `shared/` directory that mobile imports via the `@shared/*` alias
// declared in tsconfig.json. Two pieces are needed:
//   1. `watchFolders` — Metro only watches files inside `projectRoot` by
//      default; without this, files in ../shared/ aren't tracked and the
//      resolver can't see them.
//   2. `resolver.extraNodeModules` — Metro reads tsconfig paths via
//      babel-preset-expo's transformer, but the resolver still needs an
//      explicit fallback to find the target on disk when it doesn't sit
//      inside `node_modules`. Mapping the alias prefix to the absolute
//      shared/ path covers all `@shared/<anything>` imports.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

config.resolver = {
  ...config.resolver,
  // App ships iOS + Android only — drop `web` so Metro doesn't probe
  // `*.web.ts(x)` on every import.
  platforms: ['ios', 'android', 'native'],
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules ?? {}),
    '@shared': sharedRoot,
  },
  // Metro defaults exclude TypeScript source extensions in some setups;
  // make sure .ts/.tsx files inside ../shared/ resolve.
  sourceExts: Array.from(
    new Set([...(config.resolver?.sourceExts ?? []), 'ts', 'tsx', 'js', 'jsx', 'json']),
  ),
};

module.exports = config;
