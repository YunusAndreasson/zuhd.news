import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DARK_COLORS, DEFAULT_PREFS } from '../constants/theme';

// The launch is dark from its first frame: the splash, the window behind it
// and the status bar's icons are the app's default appearance, which is dark.
// A light splash on a light-mode phone gave way to the dark app, cream to
// near-black on every cold start.

type Plugin = string | [string, Record<string, unknown>];
const config = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8')).expo as {
  backgroundColor?: string;
  plugins: Plugin[];
};
const plugin = (name: string) =>
  config.plugins.find(
    (p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === name,
  )?.[1];

it('opens on the default appearance, which is dark', () => {
  // If the default ever changes, the splash below has to change with it.
  expect(DEFAULT_PREFS.appearance).toBe('dark');
});

it('shows one dark splash, whatever the phone’s own appearance', () => {
  const splash = plugin('expo-splash-screen');
  expect(splash).toBeDefined();
  expect(splash).not.toHaveProperty('dark');
  expect(String(splash?.backgroundColor).toLowerCase()).toBe(DARK_COLORS.bg.toLowerCase());
  expect(splash?.image).toBe('./assets/splash-icon.png');
});

it('puts the dark ground behind the splash and white icons over it', () => {
  expect(config.backgroundColor?.toLowerCase()).toBe(DARK_COLORS.bg.toLowerCase());
  expect(plugin('expo-status-bar')?.style).toBe('light');
});
