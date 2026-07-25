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

  // Further towns built on, or renamed from, named Palestinian localities.
  'Beit Shean': 'Bisan',
  Afula: 'al-Fula',
  Yavne: 'Yibna',
  Gedera: 'Qatra',
  Sderot: 'Najd',
  'Kiryat Shmona': 'al-Khalisa',
  'Rishon LeZion': 'Ayun Qara',
  'Petah Tikva': 'Mulabbis',
  'Or Yehuda': "Kafr 'Ana",
  Rehovot: 'Khirbat Duran',
  'Kfar Saba': 'Kafr Saba',

  // Alternate romanisations and official double-barrelled forms. Different
  // feeds and cartographic datasets spell the same place several ways, and a
  // lookup that only knows one of them silently passes the rest through — the
  // map was printing "Tel Aviv" while the article beside it said "Yafa".
  'Tel Aviv-Yafo': 'Yafa',
  'Tel Aviv-Jaffa': 'Yafa',
  Beersheba: 'Bir al-Saba',
  "Be'er Sheva": 'Bir al-Saba',
  Zefat: 'Safad',
  Tzfat: 'Safad',
  Akko: 'Akka',
  Ako: 'Akka',
  Hefa: 'Hayfa',
  Yerushalayim: 'Al-Quds',
  'Bet Shean': 'Bisan',
  "Bet She'an": 'Bisan',
  Ramla: 'ar-Ramla',
  Lydda: 'al-Ludd',
};

/**
 * Settlements under the name the people who live there chose.
 *
 * Separate from `ARABIC_NAMES` because the case is different: nothing here is
 * contested. Each of these is a rename the state or city carried out itself,
 * usually shedding a colonial transliteration — and news feeds keep supplying
 * the old form, so an article dateline could still read "Bombay" while the
 * country page beside it said India.
 */
const RECLAIMED_NAMES: Record<string, string> = {
  // Kazakhstan reverted its capital to Astana in 2022.
  'Nur-Sultan': 'Astana',

  // Indian cities that replaced their British-era spellings. The city
  // corporations made these official; the wires are just slow.
  Bombay: 'Mumbai',
  Calcutta: 'Kolkata',
  Madras: 'Chennai',
  Bangalore: 'Bengaluru',
  Poona: 'Pune',
  Baroda: 'Vadodara',
  Cawnpore: 'Kanpur',
  Benares: 'Varanasi',
  Simla: 'Shimla',
  Cochin: 'Kochi',
  Trivandrum: 'Thiruvananthapuram',
  Gauhati: 'Guwahati',

  // Renamed on independence or after it.
  Rangoon: 'Yangon',
  Dacca: 'Dhaka',
  Katmandu: 'Kathmandu',
  Ulan_Bator: 'Ulaanbaatar',
  'Ulan Bator': 'Ulaanbaatar',

  // Australia's own dual-naming policy puts the Anangu name first.
  'Ayers Rock': 'Uluru',
};

export function displayLocation(location: string | null): string | null {
  if (!location) return null;
  return ARABIC_NAMES[location] ?? RECLAIMED_NAMES[location] ?? location;
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

  // The same rule applied to names the wires still print. A feed writing
  // "Ivory Coast" is not using an English translation Côte d'Ivoire accepts —
  // the state asked, in 1986, that the French form be used in every language.
  'Ivory Coast': "Côte d'Ivoire",
  Swaziland: 'Eswatini',
  Burma: 'Myanmar',
  'East Timor': 'Timor-Leste',
  'Cape Verde': 'Cabo Verde',
  'Czech Republic': 'Czechia',
  'Republic of the Congo': 'Congo',

  /* --- Territories carrying the coloniser's name -------------------------
   *
   * The map already prints Yafa and Al-Quds rather than the settler renaming,
   * and it does it outright rather than in parentheses. These follow that
   * house style: the name of the people whose land it is, standing alone.
   *
   * All three are live decolonisation questions, not historical ones —
   * Malvinas and Kanaky sit on the UN list of Non-Self-Governing Territories,
   * and Kalaallit Nunaat is simply what Greenland calls itself.
   */
  'Falkland Is.': 'Malvinas',
  'Falkland Islands': 'Malvinas',
  'New Caledonia': 'Kanaky',
  Greenland: 'Kalaallit Nunaat',

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
  'Fr. S. Antarctic Lands': 'French Southern Territories',
  'N. Cyprus': 'Northern Cyprus',
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
