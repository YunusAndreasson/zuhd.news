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
};

export function displayLocation(location: string | null): string | null {
  if (!location) return null;
  return ARABIC_NAMES[location] ?? location;
}
