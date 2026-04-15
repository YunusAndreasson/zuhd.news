const fs = require('node:fs');

/** Tabular Islamic calendar — converts Gregorian to Hijri date. */
function getHijriDate() {
  const now = new Date();
  const gy = now.getFullYear();
  const gm = now.getMonth() + 1;
  const gd = now.getDate();

  const a = Math.floor((14 - gm) / 12);
  const y = gy + 4800 - a;
  const m = gm + 12 * a - 3;
  const jdn =
    gd +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;

  const l = jdn - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
    Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 =
    l2 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l3) / 709);
  const day = l3 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;

  return { year, month, day };
}

function getHighestBuildNumber(appJson) {
  const ios = parseInt(appJson.expo?.ios?.buildNumber ?? '0', 10);
  const android = parseInt(appJson.expo?.android?.versionCode ?? 0, 10);
  return Math.max(ios, android);
}

function calculateNewVersion(currentVersion) {
  const { year, month, day } = getHijriDate();
  const base = currentVersion.split('+')[0];
  const parts = base.split('.').map(Number);

  if (parts.length !== 3) {
    throw new Error(`Invalid version: ${base}. Expected YEAR.MONTH.PATCH`);
  }

  const [curYear, curMonth, curPatch] = parts;

  // New Islamic month/year → reset patch to day number
  if (curYear !== year || curMonth !== month) {
    return `${year}.${month}.${day}`;
  }

  // Same month → increment patch
  return `${year}.${month}.${curPatch + 1}`;
}

// --- Main ---

const appJsonPath = './app.json';
const pkgPath = './package.json';

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const newBase = calculateNewVersion(pkg.version);
const newBuild = getHighestBuildNumber(appJson) + 1;
const newFull = `${newBase}+${newBuild}`;

// Update app.json
appJson.expo.version = newBase;
appJson.expo.ios.buildNumber = String(newBuild);
appJson.expo.android.versionCode = newBuild;
fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);

// Update package.json
pkg.version = newFull;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`${pkg.version.split('+')[0] !== newBase ? '↑' : '→'} ${newFull}`);
