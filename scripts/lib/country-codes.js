// A country by its ISO 3166-1 alpha-3 code.
//
// Everything this site keys a country on is alpha-2 (`CC_TO_TOPOJSON_NAME`,
// `shared/countries/iso.ts`) or the Natural Earth name that table yields, which
// is what `COUNTRY_DATA` and `COUNTRY_AUGMENTED` are keyed by. GDACS names an
// alert's country by alpha-3 and by a display name of its own, and the display
// name is not the key: "United States" is `United States of America` here,
// "Russian Federation" is `Russia`, and a storm over two countries is
// "Papua New Guinea, Indonesia". Joined on the name, those three found no
// profile in the snapshot of 2026-10-09, and the American one was among the
// four alerts narrated that day.
//
// **The whole list, generated, never a part of it typed.** `lib/ipc.js` keeps
// 52 rows of its own and says why a partial general table is worse than a
// complete specific one: a missing code is a card with no route to its country.
// A disaster can be anywhere, so here the complete one is the specific one:
// all 249 rows of ISO 3166-1 as `iso-codes` 4.16.0 carries them, and `XKX`,
// the user-assigned code the World Bank and others send for Kosovo, which ISO
// does not list. The test holds it to the IPC table and to ICU's regions.

import { CC_TO_TOPOJSON_NAME } from '../../shared/countries/iso.ts'

/** @type {Record<string, string>} */
export const ALPHA3_TO_ALPHA2 = {
  ABW: 'AW', AFG: 'AF', AGO: 'AO', AIA: 'AI', ALA: 'AX', ALB: 'AL', AND: 'AD', ARE: 'AE',
  ARG: 'AR', ARM: 'AM', ASM: 'AS', ATA: 'AQ', ATF: 'TF', ATG: 'AG', AUS: 'AU', AUT: 'AT',
  AZE: 'AZ', BDI: 'BI', BEL: 'BE', BEN: 'BJ', BES: 'BQ', BFA: 'BF', BGD: 'BD', BGR: 'BG',
  BHR: 'BH', BHS: 'BS', BIH: 'BA', BLM: 'BL', BLR: 'BY', BLZ: 'BZ', BMU: 'BM', BOL: 'BO',
  BRA: 'BR', BRB: 'BB', BRN: 'BN', BTN: 'BT', BVT: 'BV', BWA: 'BW', CAF: 'CF', CAN: 'CA',
  CCK: 'CC', CHE: 'CH', CHL: 'CL', CHN: 'CN', CIV: 'CI', CMR: 'CM', COD: 'CD', COG: 'CG',
  COK: 'CK', COL: 'CO', COM: 'KM', CPV: 'CV', CRI: 'CR', CUB: 'CU', CUW: 'CW', CXR: 'CX',
  CYM: 'KY', CYP: 'CY', CZE: 'CZ', DEU: 'DE', DJI: 'DJ', DMA: 'DM', DNK: 'DK', DOM: 'DO',
  DZA: 'DZ', ECU: 'EC', EGY: 'EG', ERI: 'ER', ESH: 'EH', ESP: 'ES', EST: 'EE', ETH: 'ET',
  FIN: 'FI', FJI: 'FJ', FLK: 'FK', FRA: 'FR', FRO: 'FO', FSM: 'FM', GAB: 'GA', GBR: 'GB',
  GEO: 'GE', GGY: 'GG', GHA: 'GH', GIB: 'GI', GIN: 'GN', GLP: 'GP', GMB: 'GM', GNB: 'GW',
  GNQ: 'GQ', GRC: 'GR', GRD: 'GD', GRL: 'GL', GTM: 'GT', GUF: 'GF', GUM: 'GU', GUY: 'GY',
  HKG: 'HK', HMD: 'HM', HND: 'HN', HRV: 'HR', HTI: 'HT', HUN: 'HU', IDN: 'ID', IMN: 'IM',
  IND: 'IN', IOT: 'IO', IRL: 'IE', IRN: 'IR', IRQ: 'IQ', ISL: 'IS', ISR: 'IL', ITA: 'IT',
  JAM: 'JM', JEY: 'JE', JOR: 'JO', JPN: 'JP', KAZ: 'KZ', KEN: 'KE', KGZ: 'KG', KHM: 'KH',
  KIR: 'KI', KNA: 'KN', KOR: 'KR', KWT: 'KW', LAO: 'LA', LBN: 'LB', LBR: 'LR', LBY: 'LY',
  LCA: 'LC', LIE: 'LI', LKA: 'LK', LSO: 'LS', LTU: 'LT', LUX: 'LU', LVA: 'LV', MAC: 'MO',
  MAF: 'MF', MAR: 'MA', MCO: 'MC', MDA: 'MD', MDG: 'MG', MDV: 'MV', MEX: 'MX', MHL: 'MH',
  MKD: 'MK', MLI: 'ML', MLT: 'MT', MMR: 'MM', MNE: 'ME', MNG: 'MN', MNP: 'MP', MOZ: 'MZ',
  MRT: 'MR', MSR: 'MS', MTQ: 'MQ', MUS: 'MU', MWI: 'MW', MYS: 'MY', MYT: 'YT', NAM: 'NA',
  NCL: 'NC', NER: 'NE', NFK: 'NF', NGA: 'NG', NIC: 'NI', NIU: 'NU', NLD: 'NL', NOR: 'NO',
  NPL: 'NP', NRU: 'NR', NZL: 'NZ', OMN: 'OM', PAK: 'PK', PAN: 'PA', PCN: 'PN', PER: 'PE',
  PHL: 'PH', PLW: 'PW', PNG: 'PG', POL: 'PL', PRI: 'PR', PRK: 'KP', PRT: 'PT', PRY: 'PY',
  PSE: 'PS', PYF: 'PF', QAT: 'QA', REU: 'RE', ROU: 'RO', RUS: 'RU', RWA: 'RW', SAU: 'SA',
  SDN: 'SD', SEN: 'SN', SGP: 'SG', SGS: 'GS', SHN: 'SH', SJM: 'SJ', SLB: 'SB', SLE: 'SL',
  SLV: 'SV', SMR: 'SM', SOM: 'SO', SPM: 'PM', SRB: 'RS', SSD: 'SS', STP: 'ST', SUR: 'SR',
  SVK: 'SK', SVN: 'SI', SWE: 'SE', SWZ: 'SZ', SXM: 'SX', SYC: 'SC', SYR: 'SY', TCA: 'TC',
  TCD: 'TD', TGO: 'TG', THA: 'TH', TJK: 'TJ', TKL: 'TK', TKM: 'TM', TLS: 'TL', TON: 'TO',
  TTO: 'TT', TUN: 'TN', TUR: 'TR', TUV: 'TV', TWN: 'TW', TZA: 'TZ', UGA: 'UG', UKR: 'UA',
  UMI: 'UM', URY: 'UY', USA: 'US', UZB: 'UZ', VAT: 'VA', VCT: 'VC', VEN: 'VE', VGB: 'VG',
  VIR: 'VI', VNM: 'VN', VUT: 'VU', WLF: 'WF', WSM: 'WS', YEM: 'YE', ZAF: 'ZA', ZMB: 'ZM',
  ZWE: 'ZW',
  // Not ISO's: user-assigned, and what GDACS and the World Bank send for Kosovo.
  XKX: 'XK',
}

/**
 * The name a country's profile is keyed on, from its alpha-3 code: the
 * Natural Earth name `COUNTRY_DATA` uses. `undefined` for no code, a code that
 * is not one, and a country the name table does not carry — the caller says
 * so, it does not guess.
 *
 * @param {unknown} iso3
 * @returns {string | undefined}
 */
export const countryNameFromIso3 = (iso3) => CC_TO_TOPOJSON_NAME[ALPHA3_TO_ALPHA2[String(iso3 ?? '').trim().toUpperCase()]]
