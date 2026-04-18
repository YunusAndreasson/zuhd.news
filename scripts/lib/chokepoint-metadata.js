// Curated catalog of maritime chokepoints surfaced on the globe. The set is
// deliberately smaller than PortWatch's full 28-strait list — these are the
// ten that consistently shape geopolitical stories and whose transit rhythms
// are worth teaching. Lat/lon are mirrored from PortWatch's own chokepoint
// database (service9/.../PortWatch_chokepoints_database) so coordinates stay
// aligned with the transit data.
//
// Shape: { id, portname, name, lat, lng, blurb, topicTags, primaryField }
//   - portname    — exact string used as `portname` filter in Daily_Chokepoints_Data
//   - primaryField — vessel-count column most meaningful for this chokepoint's
//                    story (tanker for oil chokepoints, container for commercial
//                    shipping routes). Used for the sheet's headline stat.
//   - topicTags    — lowercased; matched against article.concepts/title for the
//                    sheet's "related articles" section.

export const CHOKEPOINT_CATALOG = [
  {
    id: 'hormuz',
    portname: 'Strait of Hormuz',
    name: 'Strait of Hormuz',
    lat: 26.297,
    lng: 56.860,
    blurb:
      'One-fifth of global seaborne oil passes through this 21-mile strait between Iran and Oman.',
    topicTags: ['hormuz', 'strait', 'iran', 'gulf', 'persian gulf', 'oil', 'tanker', 'opec'],
    primaryField: 'n_tanker',
  },
  {
    id: 'bab-el-mandeb',
    portname: 'Bab el-Mandeb Strait',
    name: 'Bab el-Mandeb',
    lat: 12.789,
    lng: 43.350,
    blurb:
      'Between Yemen and Djibouti — the Red Sea\u2019s southern gate. Houthi attacks since 2023 have pushed container shipping to reroute around Africa.',
    topicTags: ['bab-el-mandeb', 'red sea', 'yemen', 'houthi', 'sanaa', 'container', 'maersk', 'suez'],
    primaryField: 'n_container',
  },
  {
    id: 'suez',
    portname: 'Suez Canal',
    name: 'Suez Canal',
    lat: 30.593,
    lng: 32.437,
    blurb:
      'Egypt\u2019s 120-mile artery carries roughly 12% of global trade. The 2021 closure disrupted supply chains for weeks; Red Sea instability keeps it volatile.',
    topicTags: ['suez', 'egypt', 'canal', 'red sea', 'mediterranean', 'cairo', 'sisi', 'container'],
    primaryField: 'n_container',
  },
  {
    id: 'malacca',
    portname: 'Malacca Strait',
    name: 'Malacca Strait',
    lat: 1.517,
    lng: 102.665,
    blurb:
      'Between Malaysia and Sumatra — the fastest route between the Indian and Pacific Oceans. Over 80,000 ships a year, including most of China\u2019s oil imports.',
    topicTags: ['malacca', 'malaysia', 'indonesia', 'singapore', 'asean', 'china oil', 'lng', 'tanker'],
    primaryField: 'n_tanker',
  },
  {
    id: 'taiwan',
    portname: 'Taiwan Strait',
    name: 'Taiwan Strait',
    lat: 24.724,
    lng: 119.831,
    blurb:
      'Between mainland China and Taiwan — roughly 40% of the world\u2019s container traffic passes through, and the flashpoint of any US\u2013China confrontation.',
    topicTags: ['taiwan', 'taipei', 'china', 'pla', 'semiconductor', 'tsmc', 'pacific', 'container'],
    primaryField: 'n_container',
  },
  {
    id: 'panama',
    portname: 'Panama Canal',
    name: 'Panama Canal',
    lat: 9.121,
    lng: -79.767,
    blurb:
      '50-mile shortcut between the Atlantic and Pacific. Drought in 2023\u201324 cut daily transits by half \u2014 a live example of climate binding to trade.',
    topicTags: ['panama', 'canal', 'drought', 'climate', 'shipping', 'us trade', 'container'],
    primaryField: 'n_container',
  },
  {
    id: 'bosporus',
    portname: 'Bosporus Strait',
    name: 'Bosporus Strait',
    lat: 41.169,
    lng: 29.092,
    blurb:
      'Istanbul\u2019s 20-mile waterway links the Black Sea to the Mediterranean \u2014 the only route for Russian naval access and Ukrainian grain exports.',
    topicTags: ['bosporus', 'turkey', 'istanbul', 'black sea', 'ukraine grain', 'russia navy', 'montreux'],
    primaryField: 'n_dry_bulk',
  },
  {
    id: 'gibraltar',
    portname: 'Gibraltar Strait',
    name: 'Strait of Gibraltar',
    lat: 35.942,
    lng: -5.755,
    blurb:
      '8 miles between Morocco and Spain \u2014 the only Atlantic\u2013Mediterranean link. A surveillance chokepoint for Russian submarines and sanctioned oil.',
    topicTags: ['gibraltar', 'spain', 'morocco', 'mediterranean', 'shadow fleet', 'sanctions'],
    primaryField: 'n_total',
  },
  {
    id: 'dover',
    portname: 'Dover Strait',
    name: 'Dover Strait',
    lat: 51.030,
    lng: 1.506,
    blurb:
      'The busiest shipping lane on Earth \u2014 400+ ships a day squeeze through the English Channel\u2019s 21-mile narrows.',
    topicTags: ['dover', 'english channel', 'uk shipping', 'france', 'north sea'],
    primaryField: 'n_total',
  },
  {
    id: 'cape-of-good-hope',
    portname: 'Cape of Good Hope',
    name: 'Cape of Good Hope',
    lat: -34.927,
    lng: 20.883,
    blurb:
      'The 3,000-mile detour around southern Africa \u2014 the alternative when the Red Sea is closed. The new default for tankers since Houthi attacks began.',
    topicTags: ['cape of good hope', 'south africa', 'red sea alternative', 'suez bypass', 'tanker'],
    primaryField: 'n_total',
  },
  {
    id: 'kerch',
    portname: 'Kerch Strait',
    name: 'Kerch Strait',
    lat: 45.267,
    lng: 36.544,
    blurb:
      'Between Crimea and Russia \u2014 the only access to the Sea of Azov. A flashpoint since 2014 and contested throughout the Russia\u2013Ukraine war.',
    topicTags: ['kerch', 'crimea', 'azov', 'russia', 'ukraine', 'black sea'],
    primaryField: 'n_total',
  },
];

/** Convenience: id → catalog entry lookup. */
export const CHOKEPOINT_BY_ID = Object.fromEntries(
  CHOKEPOINT_CATALOG.map((c) => [c.id, c]),
);
