/**
 * Restores original Arabic place names for locations in historic Palestine.
 * Applied at the display layer — source data is unchanged.
 */

const ARABIC_NAMES: Record<string, string> = {
  'Tel Aviv': 'Yafa',
  Jerusalem: 'Al-Quds',
  Haifa: 'Hayfa',
  Nazareth: 'An-Nasira',
  'Beer Sheva': 'Bir al-Saba',
  Ashkelon: 'Asqalan',
  Ashdod: 'Isdud',
  Acre: 'Akka',
  Netanya: 'Umm Khalid',
  Tiberias: 'Tabariyya',
  Safed: 'Safad',
  Eilat: 'Umm al-Rashrash',
  Herzliya: 'al-Haram',
  Ramle: 'ar-Ramla',
  Lod: 'al-Ludd',
  Jaffa: 'Yafa',
  Bethlehem: 'Bayt Lahm',
  Jericho: 'Ariha',
  Hebron: 'Al-Khalil',
};

export function displayLocation(location: string | null): string | null {
  if (!location) return null;
  return ARABIC_NAMES[location] ?? location;
}

/**
 * Display names for countries — translates Natural Earth cartographic
 * abbreviations and outdated names to proper names that respect
 * self-determination and sovereignty. Lookup keys stay unchanged.
 */
const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  // Renamed countries — using the name each nation chose for itself
  Turkey: 'Türkiye',
  Macedonia: 'North Macedonia',
  eSwatini: 'Eswatini',

  // Cartographic shortenings — match the conventions used by Google Maps
  // and most national atlases so labels read naturally on the globe.
  'United States of America': 'United States',

  // Natural Earth abbreviations → full names
  'S. Sudan': 'South Sudan',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Dem. Rep. Congo': 'Democratic Republic of the Congo',
  'Central African Rep.': 'Central African Republic',
  'Dominican Rep.': 'Dominican Republic',
  'Eq. Guinea': 'Equatorial Guinea',
  'W. Sahara': 'Western Sahara',
  'Solomon Is.': 'Solomon Islands',
  'Falkland Is.': 'Falkland Islands',
  'Fr. S. Antarctic Lands': 'French Southern Territories',
};

export function displayCountryName(name: string | null): string | null {
  if (!name) return null;
  return COUNTRY_DISPLAY_NAMES[name] ?? name;
}

/**
 * Splits a country label into 1–2 lines for map rendering. Mirrors the
 * convention used by Google Maps and Natural Earth atlases: long names
 * wrap at the word boundary closest to the middle so the result reads
 * as two roughly balanced lines (e.g. "Bosnia and / Herzegovina"). One
 * line is returned untouched when the name fits within `maxChars`.
 */
export function wrapCountryLabel(name: string, maxChars = 14): string[] {
  if (name.length <= maxChars) return [name];
  const middle = name.length / 2;
  let bestSpace = -1;
  let bestDist = Infinity;
  for (let i = 0; i < name.length; i++) {
    if (name[i] !== ' ') continue;
    const dist = Math.abs(i - middle);
    if (dist < bestDist) {
      bestDist = dist;
      bestSpace = i;
    }
  }
  if (bestSpace === -1) return [name];
  return [name.slice(0, bestSpace), name.slice(bestSpace + 1)];
}
