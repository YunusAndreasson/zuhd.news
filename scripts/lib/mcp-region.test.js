// Run: node --test scripts/lib/mcp-region.test.js
//
// The worker's old ladder tested a wide Middle East box before Africa and Asia,
// so Nairobi, Addis Ababa and Mumbai came back "Middle East & Central Asia", and
// Tehran and Mexico City came back "Other". Each city below is what a reader
// would file it under; the second group sits close to a line the ladder draws.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyRegion } from '../../workers/mcp/src/region.js'

const ME = 'Middle East & Central Asia'
const AF = 'Africa'
const EU = 'Europe'
const NA = 'North America'
const LA = 'Latin America'
const AS = 'East & South Asia'
const SE = 'Southeast Asia'
const OC = 'Oceania'

const CITIES = [
  ['Nairobi', -1.29, 36.82, AF],
  ['Addis Ababa', 9.03, 38.74, AF],
  ['Lagos', 6.52, 3.38, AF],
  // Egypt and Turkey are the Middle East here, as in REGION_CODES.
  ['Cairo', 30.04, 31.24, ME],
  ['Mumbai', 19.08, 72.88, AS],
  ['Delhi', 28.61, 77.21, AS],
  ['Tehran', 35.69, 51.39, ME],
  ['Riyadh', 24.71, 46.68, ME],
  ['Istanbul', 41.01, 28.98, ME],
  ['Moscow', 55.76, 37.62, EU],
  ['Paris', 48.86, 2.35, EU],
  ['London', 51.51, -0.13, EU],
  // Just under 60N, where the old ladder began an Arctic/Nordic band that
  // parted Oslo and Stockholm from Helsinki.
  ['Oslo', 59.91, 10.75, EU],
  ['Washington', 38.91, -77.04, NA],
  ['Mexico City', 19.43, -99.13, LA],
  ['São Paulo', -23.55, -46.63, LA],
  ['Tokyo', 35.68, 139.69, AS],
  ['Beijing', 39.9, 116.41, AS],
  ['Jakarta', -6.21, 106.85, SE],
  ['Sydney', -33.87, 151.21, OC],
  ['Auckland', -36.85, 174.76, OC],
]

const NEAR_A_LINE = [
  // The Mediterranean
  ['Tangier', 35.76, -5.8, AF],
  ['Gibraltar', 36.14, -5.35, EU],
  ['Malaga', 36.72, -4.42, EU],
  ['Algiers', 36.75, 3.06, AF],
  ['Tunis', 36.81, 10.18, AF],
  ['Palermo', 38.12, 13.36, EU],
  ['Valletta', 35.9, 14.51, EU],
  ['Tripoli', 32.89, 13.19, AF],
  ['Tobruk', 32.08, 23.96, AF],
  ['Athens', 37.98, 23.73, EU],
  // The Red Sea and the Horn
  ['Khartoum', 15.5, 32.56, AF],
  ['Port Sudan', 19.62, 37.22, AF],
  ['Jeddah', 21.49, 39.19, ME],
  ['Asmara', 15.32, 38.93, AF],
  ['Sanaa', 15.37, 44.19, ME],
  ['Aden', 12.79, 45.03, ME],
  ['Djibouti', 11.59, 43.15, AF],
  ['Mogadishu', 2.05, 45.32, AF],
  // Black Sea, Caucasus, the Urals
  ['Bucharest', 44.43, 26.1, EU],
  ['Odesa', 46.48, 30.72, EU],
  ['Tbilisi', 41.72, 44.79, ME],
  ['Sochi', 43.6, 39.73, EU],
  ['Samara', 53.2, 50.15, EU],
  ['Novosibirsk', 55.03, 82.92, EU],
  ['Russia, its centroid', 61.52, 105.32, EU],
  // Iran to the Hindu Kush, Central Asia
  ['Mashhad', 36.3, 59.6, ME],
  ['Kabul', 34.53, 69.17, AS],
  ['Karachi', 24.86, 67.0, AS],
  ['Tashkent', 41.3, 69.24, ME],
  ['Almaty', 43.24, 76.89, ME],
  ['Colombo', 6.93, 79.86, AS],
  // Asia's southeast corner
  ['Dhaka', 23.81, 90.41, AS],
  ['Yangon', 16.87, 96.2, SE],
  ['Hanoi', 21.03, 105.85, SE],
  ['Hong Kong', 22.32, 114.17, AS],
  ['Taipei', 25.03, 121.57, AS],
  ['Manila', 14.6, 120.98, SE],
  ['Port Moresby', -9.44, 147.18, OC],
  ['Darwin', -12.46, 130.84, OC],
  ['Hobart', -42.88, 147.33, OC],
  ['Suva', -18.14, 178.44, OC],
  ['Apia', -13.83, -171.76, OC],
  // The Americas
  ['Miami', 25.76, -80.19, NA],
  ['Havana', 23.11, -82.37, LA],
  ['Monterrey', 25.67, -100.31, LA],
  ['San Antonio', 29.42, -98.49, NA],
  ['El Paso', 31.76, -106.49, NA],
  ['Anchorage', 61.22, -149.9, NA],
  ['Recife', -8.05, -34.88, LA],
  // The far north
  ['Helsinki', 60.17, 24.94, EU],
  ['Reykjavik', 64.15, -21.94, EU],
  ['Nuuk', 64.18, -51.72, NA],
]

for (const [name, lat, lng, region] of [...CITIES, ...NEAR_A_LINE]) {
  test(`${name} is ${region}`, () => {
    assert.equal(classifyRegion(lat, lng), region)
  })
}

test('what no box holds is Other', () => {
  assert.equal(classifyRegion(-77.85, 166.67), 'Other') // McMurdo
  assert.equal(classifyRegion(0, -30), 'Other') // the mid-Atlantic
  assert.equal(classifyRegion(Number.NaN, Number.NaN), 'Other')
})
