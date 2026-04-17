#!/usr/bin/env node
// Fetch extra country indicators and emit `constants/country-augmented.ts`.
// Kept as a separate file from country-data.ts so the hand-curated edits in
// that file (Palestine capital, Muslim-world corrections, etc.) stay intact —
// the UI merges the two at read-time.
//
// Indicators pulled from the World Bank API (free, no auth). Names matched to
// country-data.ts keys via REST Countries v3 /all (name.common → ISO-2).
// Population density is derived locally from the strings already baked into
// country-data.ts, not fetched.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COUNTRY_DATA_FILE = path.join(__dirname, '..', 'constants', 'country-data.ts');
const OUT_FILE = path.join(__dirname, '..', 'constants', 'country-augmented.ts');

const INDICATORS = {
  co2PerCapita: {
    id: 'EN.GHG.CO2.PC.CE.AR5',
    format: (n) => `${n.toFixed(n < 1 ? 2 : 1)} t`,
  },
  urbanPct: {
    id: 'SP.URB.TOTL.IN.ZS',
    format: (n) => `${Math.round(n)}%`,
  },
  fertilityRate: {
    id: 'SP.DYN.TFRT.IN',
    format: (n) => `${n.toFixed(1)}`,
  },
  migrantPct: {
    id: 'SM.POP.TOTL.ZS',
    format: (n) => `${n.toFixed(n < 10 ? 1 : 0)}%`,
  },
};

// ---------------------------------------------------------------------------
// Parse country-data.ts — extract { name, population, area } per entry.
// Regex is brittle by nature; we only care about three specific string fields
// whose format is stable (auto-generated), so the risk is acceptable.
// ---------------------------------------------------------------------------

function parseCountryData(src) {
  // Split at top-level `  Name: {` — lookbehind guards against nested braces.
  const re = /^ {2}([A-Z][^:\n]*): \{$/gm;
  const out = [];
  const starts = [];
  let m = re.exec(src);
  while (m !== null) {
    starts.push({ name: m[1], idx: m.index });
    m = re.exec(src);
  }
  for (let i = 0; i < starts.length; i++) {
    const { name, idx } = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].idx : src.length;
    const block = src.slice(idx, end);
    const pop = block.match(/^ {4}population: '([^']+)'/m)?.[1] ?? null;
    const area = block.match(/^ {4}area: '([^']+)'/m)?.[1] ?? null;
    out.push({ name, population: pop, area });
  }
  return out;
}

// ---------------------------------------------------------------------------
// "44M km²" / "2.4M km²" / "1K" / "$17B" → numeric value (units resolved).
// ---------------------------------------------------------------------------
function parseStat(value) {
  if (!value) return null;
  const m = value.match(/^\$?([\d,.]+)\s*([KMBT])?/i);
  if (!m?.[1]) return null;
  const n = Number.parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  const suffix = m[2]?.toUpperCase();
  const mult =
    suffix === 'T' ? 1e12 : suffix === 'B' ? 1e9 : suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1;
  return n * mult;
}

// Round to 1 decimal when the density is small, else integer. Renders "1,234 /km²".
function formatDensity(density) {
  if (density == null || !Number.isFinite(density)) return null;
  const rounded = density >= 100 ? Math.round(density) : density.toFixed(1);
  return `${rounded.toLocaleString?.() ?? rounded} /km²`;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function fetchIndicator(id) {
  // `mrv=1` = most recent value; `per_page=400` covers all countries in one page.
  const url = `https://api.worldbank.org/v2/country/all/indicator/${id}?format=json&per_page=400&mrv=1`;
  const json = await fetchJson(url);
  const rows = Array.isArray(json) ? json[1] : null;
  if (!Array.isArray(rows)) throw new Error(`Unexpected WB response for ${id}`);
  const byIso2 = new Map();
  for (const r of rows) {
    const iso2 = r?.country?.id;
    const v = r?.value;
    if (typeof iso2 === 'string' && typeof v === 'number') byIso2.set(iso2, v);
  }
  return byIso2;
}

async function fetchRestCountries() {
  const url = 'https://restcountries.com/v3.1/all?fields=name,cca2';
  const json = await fetchJson(url);
  const nameToIso2 = new Map();
  for (const c of json) {
    const name = c?.name?.common;
    const iso2 = c?.cca2;
    if (typeof name === 'string' && typeof iso2 === 'string') nameToIso2.set(name, iso2);
  }
  return nameToIso2;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const src = fs.readFileSync(COUNTRY_DATA_FILE, 'utf8');
  const entries = parseCountryData(src);
  console.log(`Parsed ${entries.length} countries from country-data.ts`);

  console.log('Fetching REST Countries name → ISO-2 map…');
  const nameToIso2 = await fetchRestCountries();

  console.log('Fetching World Bank indicators…');
  const indicatorData = {};
  for (const [key, spec] of Object.entries(INDICATORS)) {
    process.stdout.write(`  ${spec.id} (${key})… `);
    indicatorData[key] = await fetchIndicator(spec.id);
    console.log(`${indicatorData[key].size} rows`);
  }

  // Manual overrides for REST Countries edge cases / zuhd naming choices.
  const MANUAL_ISO2 = {
    'Czech Republic': 'CZ',
    'South Korea': 'KR',
    'North Korea': 'KP',
    Syria: 'SY',
    Russia: 'RU',
    Iran: 'IR',
    Taiwan: 'TW',
    Venezuela: 'VE',
    Bolivia: 'BO',
    Vietnam: 'VN',
    Moldova: 'MD',
    'United States': 'US',
    'United Kingdom': 'GB',
    Brunei: 'BN',
    Laos: 'LA',
    'East Timor': 'TL',
    Palestine: 'PS',
    'Ivory Coast': 'CI',
    'Cape Verde': 'CV',
    Micronesia: 'FM',
    Tanzania: 'TZ',
    'Democratic Republic of the Congo': 'CD',
    'Republic of the Congo': 'CG',
    Congo: 'CG',
  };

  const augmented = {};
  const missing = [];
  for (const entry of entries) {
    const iso2 = MANUAL_ISO2[entry.name] ?? nameToIso2.get(entry.name);
    if (!iso2) {
      missing.push(entry.name);
      continue;
    }
    const record = {};
    // Derived: population density
    const popNum = parseStat(entry.population);
    const areaNum = parseStat(entry.area); // area strings end with " km²" but suffix parses first
    if (popNum != null && areaNum != null && areaNum > 0) {
      record.populationDensity = formatDensity(popNum / areaNum);
    }
    // World Bank indicators
    for (const [key, spec] of Object.entries(INDICATORS)) {
      const v = indicatorData[key].get(iso2);
      if (typeof v === 'number' && Number.isFinite(v)) {
        record[key] = spec.format(v);
      }
    }
    if (Object.keys(record).length > 0) augmented[entry.name] = record;
  }

  if (missing.length) {
    console.warn(`\nCouldn't resolve ISO-2 for ${missing.length} countries:`);
    for (const n of missing) console.warn(`  - ${n}`);
  }

  const body =
    `// Auto-generated by scripts/build-country-augment.mjs — do not edit by hand.\n` +
    `// Sources: World Bank (most recent value per indicator) + derived from\n` +
    `// country-data.ts (population density).\n\n` +
    `export interface CountryAugmented {\n` +
    `  /** Derived from population / area — "344 /km²". */\n` +
    `  populationDensity?: string;\n` +
    `  /** CO₂ emissions per capita (tonnes CO₂e/year, excl. LULUCF). */\n` +
    `  co2PerCapita?: string;\n` +
    `  /** Urban population share (%). */\n` +
    `  urbanPct?: string;\n` +
    `  /** Fertility rate (births per woman). */\n` +
    `  fertilityRate?: string;\n` +
    `  /** International migrant stock (%). */\n` +
    `  migrantPct?: string;\n` +
    `}\n\n` +
    `export const COUNTRY_AUGMENTED: Record<string, CountryAugmented> = ${JSON.stringify(
      augmented,
      null,
      2,
    )};\n`;

  fs.writeFileSync(OUT_FILE, body);
  console.log(`\nWrote ${OUT_FILE}`);
  console.log(`  ${Object.keys(augmented).length} / ${entries.length} countries augmented`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
