const fs = require('node:fs');
const moment = require('moment-hijri');

function getHijriDate() {
  const now = moment();
  return {
    year: now.iYear(),
    month: now.iMonth() + 1,
    day: now.iDate(),
  };
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
