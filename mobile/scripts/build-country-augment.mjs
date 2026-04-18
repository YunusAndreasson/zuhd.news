#!/usr/bin/env node
// Fetch extra country indicators and emit `constants/country-augmented.ts`.
// Kept as a separate file from country-data.ts so the hand-curated edits in
// that file (Palestine capital, Muslim-world corrections, etc.) stay intact —
// the UI merges the two at read-time.
//
// Sources:
//   • World Bank API (primary — free, no auth, stable ISO-2 ids).
//   • Our World in Data grapher CSVs — aggregator for V-Dem, Transparency
//     International CPI, RSF press freedom, UNDP HDI, and UNHCR refugees.
//     Using OWID rather than hitting each source directly means one CSV
//     schema (Entity,Code,Year,<value>), one parse path, permissive CC BY.
//   • Derived locally: population density (from country-data.ts strings).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COUNTRY_DATA_FILE = path.join(__dirname, '..', 'constants', 'country-data.ts');
const OUT_FILE = path.join(__dirname, '..', 'constants', 'country-augmented.ts');

// ---------------------------------------------------------------------------
// Indicator specs
// ---------------------------------------------------------------------------

// Formatters — every value is stored as a pre-formatted display string; the
// parseStat in lib/country-ranking.ts reads the leading number back for
// sort order, so units and decorations come along for free.
const fmtPct = (digits = 0) => (n) => `${n.toFixed(digits)}%`;
const fmtPctAuto = (n) => `${n.toFixed(n < 10 ? 1 : 0)}%`;
const fmtFixed = (digits) => (n) => n.toFixed(digits);
const fmtCount = (n) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return `${Math.round(n)}`;
};
const fmtLocale = (digits = 0) => (n) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// World Bank indicator code → field name on CountryAugmented + formatter.
const WB_INDICATORS = {
  // Existing
  co2PerCapita: { id: 'EN.GHG.CO2.PC.CE.AR5', format: (n) => `${n.toFixed(n < 1 ? 2 : 1)} t` },
  urbanPct: { id: 'SP.URB.TOTL.IN.ZS', format: (n) => `${Math.round(n)}%` },
  fertilityRate: { id: 'SP.DYN.TFRT.IN', format: fmtFixed(1) },
  migrantPct: { id: 'SM.POP.TOTL.ZS', format: fmtPctAuto },
  // Group A — ummah lens
  remittancePctGdp: { id: 'BX.TRF.PWKR.DT.GD.ZS', format: fmtPctAuto },
  // Group C — science / tech
  rdPctGdp: { id: 'GB.XPD.RSDV.GD.ZS', format: fmtPct(1) },
  researchersPerMillion: { id: 'SP.POP.SCIE.RD.P6', format: fmtLocale(0) },
  scientificArticles: { id: 'IP.JRN.ARTC.SC', format: fmtCount },
  highTechExportsPct: { id: 'TX.VAL.TECH.MF.ZS', format: fmtPct(0) },
  // Group D — development / inequality
  giniIndex: { id: 'SI.POV.GINI', format: fmtFixed(1) },
  youthUnemploymentPct: { id: 'SL.UEM.1524.ZS', format: fmtPct(0) },
  literacyPct: { id: 'SE.ADT.LITR.ZS', format: fmtPct(0) },
};

// Our World in Data grapher slugs → field name on CountryAugmented + formatter.
// Each CSV has the shape: Entity,Code,Year,<value column>. We take the most
// recent non-empty value per ISO-3 code.
const OWID_INDICATORS = {
  democracyIndex: {
    slug: 'liberal-democracy-index',
    format: fmtFixed(2),
  },
  corruptionCpi: {
    slug: 'corruption-perception-index',
    format: (n) => `${Math.round(n)}`,
  },
  pressFreedomScore: {
    slug: 'press-freedom-index-rsf',
    format: fmtFixed(1),
  },
  hdi: {
    slug: 'human-development-index',
    format: fmtFixed(3),
  },
  refugeesHosted: {
    slug: 'refugee-population-by-country-or-territory-of-asylum',
    format: fmtCount,
  },
  refugeesProduced: {
    slug: 'refugee-population-by-country-or-territory-of-origin',
    format: fmtCount,
  },
};

// ---------------------------------------------------------------------------
// country-data.ts parsing
// ---------------------------------------------------------------------------

function parseCountryData(src) {
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

function formatDensity(density) {
  if (density == null || !Number.isFinite(density)) return null;
  const rounded = density >= 100 ? Math.round(density) : density.toFixed(1);
  return `${rounded.toLocaleString?.() ?? rounded} /km²`;
}

// ---------------------------------------------------------------------------
// Network + CSV helpers
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

// Minimal RFC-4180-ish CSV parser. Handles quoted fields with embedded commas
// and escaped "" quotes — enough for OWID exports, which can contain country
// names like `Korea, Dem. People's Rep. of`.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

async function fetchWBIndicator(id) {
  // `mrv=10` pulls up to 10 most-recent observations per country (WB returns
  // them newest-first). Some indicators (Gini, literacy, R&D) only report
  // every few years, so mrv=1 would miss most countries. We keep the first
  // non-null value we encounter per iso2 — i.e. the most recent available.
  const url = `https://api.worldbank.org/v2/country/all/indicator/${id}?format=json&per_page=4000&mrv=10`;
  const json = await fetchJson(url);
  const rows = Array.isArray(json) ? json[1] : null;
  if (!Array.isArray(rows)) throw new Error(`Unexpected WB response for ${id}`);
  const byIso2 = new Map();
  for (const r of rows) {
    const iso2 = r?.country?.id;
    const v = r?.value;
    if (typeof iso2 !== 'string' || typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (!byIso2.has(iso2)) byIso2.set(iso2, v);
  }
  return byIso2;
}

// OWID grapher CSV → Map<ISO-3, { year, value }>. Takes most recent non-empty
// value per country. Column layout is always Entity,Code,Year,<metric>.
async function fetchOWIDIndicator(slug) {
  const url = `https://ourworldindata.org/grapher/${slug}.csv?v=1&csvType=full&useColumnShortNames=false`;
  const text = await fetchText(url);
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error(`Empty OWID CSV for ${slug}`);
  const [header, ...body] = rows;
  const codeIdx = header.indexOf('Code');
  const yearIdx = header.indexOf('Year');
  // The value column is whichever column isn't Entity/Code/Year.
  const valueIdx = header.findIndex(
    (h, i) => i !== 0 && i !== codeIdx && i !== yearIdx && h.trim() !== '',
  );
  if (codeIdx < 0 || yearIdx < 0 || valueIdx < 0) {
    throw new Error(`Unexpected OWID header for ${slug}: ${header.join(',')}`);
  }
  const byIso3 = new Map();
  for (const r of body) {
    const iso3 = r[codeIdx];
    const year = Number.parseInt(r[yearIdx], 10);
    const raw = r[valueIdx];
    if (!iso3 || iso3.length !== 3 || !Number.isFinite(year) || raw === '' || raw == null) continue;
    const v = Number.parseFloat(raw);
    if (!Number.isFinite(v)) continue;
    const existing = byIso3.get(iso3);
    if (!existing || year > existing.year) byIso3.set(iso3, { year, value: v });
  }
  return byIso3;
}

async function fetchRestCountries() {
  const url = 'https://restcountries.com/v3.1/all?fields=name,cca2,cca3';
  const json = await fetchJson(url);
  const nameToIso2 = new Map();
  const iso3ToIso2 = new Map();
  for (const c of json) {
    const name = c?.name?.common;
    const iso2 = c?.cca2;
    const iso3 = c?.cca3;
    if (typeof name === 'string' && typeof iso2 === 'string') nameToIso2.set(name, iso2);
    if (typeof iso3 === 'string' && typeof iso2 === 'string') iso3ToIso2.set(iso3, iso2);
  }
  return { nameToIso2, iso3ToIso2 };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const src = fs.readFileSync(COUNTRY_DATA_FILE, 'utf8');
  const entries = parseCountryData(src);
  console.log(`Parsed ${entries.length} countries from country-data.ts`);

  console.log('Fetching REST Countries name → ISO map…');
  const { nameToIso2, iso3ToIso2 } = await fetchRestCountries();

  console.log('Fetching World Bank indicators…');
  const wbData = {};
  for (const [key, spec] of Object.entries(WB_INDICATORS)) {
    process.stdout.write(`  ${spec.id.padEnd(26)} (${key})… `);
    try {
      wbData[key] = await fetchWBIndicator(spec.id);
      console.log(`${wbData[key].size} rows`);
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      wbData[key] = new Map();
    }
  }

  console.log('Fetching Our World in Data indicators…');
  const owidData = {};
  for (const [key, spec] of Object.entries(OWID_INDICATORS)) {
    process.stdout.write(`  ${spec.slug.padEnd(56)} (${key})… `);
    try {
      const byIso3 = await fetchOWIDIndicator(spec.slug);
      // Convert to ISO-2 via REST Countries map for merge with WB data.
      const byIso2 = new Map();
      for (const [iso3, { value }] of byIso3) {
        const iso2 = iso3ToIso2.get(iso3) ?? MANUAL_ISO3_TO_ISO2[iso3];
        if (iso2) byIso2.set(iso2, value);
      }
      owidData[key] = byIso2;
      console.log(`${byIso2.size} rows`);
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      owidData[key] = new Map();
    }
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
    Macedonia: 'MK',
    'North Macedonia': 'MK',
    // Somaliland has no ISO-2 code — intentionally left unmapped; falls
    // through to the `missing` list and the country simply gets no augmented
    // data.
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
    // Derived: population density.
    const popNum = parseStat(entry.population);
    const areaNum = parseStat(entry.area);
    if (popNum != null && areaNum != null && areaNum > 0) {
      record.populationDensity = formatDensity(popNum / areaNum);
    }
    // World Bank indicators.
    for (const [key, spec] of Object.entries(WB_INDICATORS)) {
      const v = wbData[key].get(iso2);
      if (typeof v === 'number' && Number.isFinite(v)) record[key] = spec.format(v);
    }
    // OWID-sourced indicators.
    for (const [key, spec] of Object.entries(OWID_INDICATORS)) {
      const v = owidData[key].get(iso2);
      if (typeof v === 'number' && Number.isFinite(v)) record[key] = spec.format(v);
    }
    if (Object.keys(record).length > 0) augmented[entry.name] = record;
  }

  if (missing.length) {
    console.warn(`\nCouldn't resolve ISO-2 for ${missing.length} countries:`);
    for (const n of missing) console.warn(`  - ${n}`);
  }

  const body =
    `// Auto-generated by scripts/build-country-augment.mjs — do not edit by hand.\n` +
    `// Sources: World Bank API + Our World in Data (V-Dem, Transparency\n` +
    `// International, RSF, UNDP HDR, UNHCR) + derived (density).\n\n` +
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
    `  /** Personal remittances received, % of GDP. */\n` +
    `  remittancePctGdp?: string;\n` +
    `  /** R&D expenditure, % of GDP. */\n` +
    `  rdPctGdp?: string;\n` +
    `  /** Researchers in R&D, per million people. */\n` +
    `  researchersPerMillion?: string;\n` +
    `  /** Scientific and technical journal articles (annual count). */\n` +
    `  scientificArticles?: string;\n` +
    `  /** High-technology exports, % of manufactured exports. */\n` +
    `  highTechExportsPct?: string;\n` +
    `  /** Gini index of income inequality (0–100). */\n` +
    `  giniIndex?: string;\n` +
    `  /** Youth unemployment, ages 15–24 (%). */\n` +
    `  youthUnemploymentPct?: string;\n` +
    `  /** Adult literacy rate (%). */\n` +
    `  literacyPct?: string;\n` +
    `  /** V-Dem Liberal Democracy Index (0–1, higher = more democratic). */\n` +
    `  democracyIndex?: string;\n` +
    `  /** Transparency International CPI (0–100, higher = cleaner). */\n` +
    `  corruptionCpi?: string;\n` +
    `  /** RSF Press Freedom score (0–100; LOWER = freer, per RSF methodology). */\n` +
    `  pressFreedomScore?: string;\n` +
    `  /** UNDP Human Development Index (0–1). */\n` +
    `  hdi?: string;\n` +
    `  /** Refugees hosted (UNHCR, country of asylum). */\n` +
    `  refugeesHosted?: string;\n` +
    `  /** Refugees produced (UNHCR, country of origin). */\n` +
    `  refugeesProduced?: string;\n` +
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

// Handful of ISO-3 codes that some sources use but REST Countries doesn't map
// cleanly (Kosovo has no official ISO-3166 alpha-3; OWID uses OWID_KOS).
const MANUAL_ISO3_TO_ISO2 = {
  OWID_KOS: 'XK',
  XKX: 'XK',
  ROM: 'RO',
  TMP: 'TL',
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
