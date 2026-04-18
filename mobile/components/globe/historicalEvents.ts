/**
 * Twenty events across ~3,500 years that shaped the ummah's world — the
 * context in which today's news happens. Surfaces on the globe only when
 * the camera is genuinely zoomed (same gate as islamicPlaces).
 *
 * Scope is intentional: these are events, not places. A separate layer from
 * ISLAMIC_PLACES, drawn with a different glyph (cross rather than ring) so
 * the two layers read distinctly even where they cluster.
 *
 * Every entry is anchored in an authentic source — Qur'an for the prophetic
 * narratives, well-documented history for the rest — with the citation in
 * an inline comment next to the data. No speculative geographies, no
 * uncertain eschatological readings.
 */

export interface HistoricalEvent {
  id: string;
  /** Short display name ("Battle of Tours"). */
  name: string;
  /** Year label (CE by default; "c. 610" when uncertain; "15 AH" for
   *  hijri-anchored battles where the hijri year is the better-known form). */
  year: string;
  /** [lng, lat] tuple — d3-geo's expected order. */
  coords: [number, number];
  /** One-sentence consequence; appended to the tap toast. */
  caption: string;
}

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  // ── Prophetic (Qur'an-anchored) ─────────────────────────────────────────
  {
    // Qur'an 11:44 — "the ship rested on al-Judi". Mount Judi (Cudi)
    // stands above the Tigris in southeastern Turkey, near modern Cizre.
    id: 'nuh-judi',
    name: 'Ark of Nuh',
    year: 'antiquity',
    coords: [42.15, 37.3785], // Mount Judi
    caption: 'Mount Judi, where the ark came to rest',
  },
  {
    // Qur'an 21:68–71 — Ibrahim cast into the fire, "cool and peaceful".
    // Islamic tradition locates this at Urfa (modern Şanlıurfa), site of
    // the Pool of Abraham (Balıklıgöl).
    id: 'ibrahim-urfa',
    name: 'Ibrahim’s fire',
    year: 'antiquity',
    coords: [38.7939, 37.1671], // Şanlıurfa (Pool of Abraham)
    caption: 'Urfa, where the flames turned cool for Ibrahim',
  },
  {
    // Qur'an 26:63 — "strike the sea with your staff" — and Qur'an 20:77.
    // The classical tafsir tradition places the crossing at the northern
    // Red Sea; the exact point is debated, marked here at Ras Sedr.
    id: 'musa-sea',
    name: 'Red Sea crossing',
    year: 'antiquity',
    coords: [32.5, 29.8], // Ras Sedr area, northern Gulf of Suez
    caption: 'Musa parts the sea for Bani Isra’il',
  },
  {
    // Qur'an 7:73–79, 15:80–84 — the Thamud hewed homes in the cliffs
    // and were destroyed. al-Hijr (Mada'in Saleh) preserves their
    // rock-cut tombs; a UNESCO World Heritage Site.
    id: 'thamud-hijr',
    name: 'al-Hijr',
    year: 'antiquity',
    coords: [37.9531, 26.7917], // Mada'in Saleh
    caption: 'rock-cut ruins of the Thamud',
  },
  {
    // Qur'an 37:139–148, 21:87 — Yunus and the people of Nineveh, the
    // only nation saved by its repentance after a prophet had left it.
    // The archaeological Nineveh sits opposite modern Mosul on the Tigris.
    id: 'yunus-nineveh',
    name: 'Nineveh',
    year: 'antiquity',
    coords: [43.1585, 36.3597], // Nineveh / Mosul
    caption: 'city that repented at Yunus’s warning',
  },

  // ── Medieval inflection points ──────────────────────────────────────────
  {
    // 732 CE — Umayyad force under Abd al-Rahman al-Ghafiqi defeated by
    // Charles Martel; the northernmost extent of early Muslim expansion
    // into Frankish Europe.
    id: 'tours',
    name: 'Battle of Tours',
    year: '732',
    coords: [0.6848, 47.3941], // Tours, France
    caption: 'Umayyad advance into Frankish Europe halted',
  },
  {
    // 1071 CE — Seljuk sultan Alp Arslan defeats the Byzantine emperor
    // Romanos IV; opens Anatolia to Turkic settlement and long-term
    // Islamization.
    id: 'manzikert',
    name: 'Battle of Manzikert',
    year: '1071',
    coords: [42.5408, 39.1411], // Malazgirt, eastern Turkey
    caption: 'Seljuks break Byzantium, opening Anatolia',
  },
  {
    // 1260 CE — Mamluk army under Qutuz and Baybars defeats the Mongols
    // in the Jezreel Valley; the first major Mongol defeat, saving
    // Egypt and the Hejaz from the fate of Baghdad.
    id: 'ayn-jalut',
    name: 'Ayn Jalut',
    year: '1260',
    coords: [35.3333, 32.55], // Jezreel Valley
    caption: 'Mamluks stop the Mongol advance on the Muslim world',
  },
  {
    // 1514 CE — Ottoman sultan Selim I defeats Safavid shah Ismail I;
    // fixes the Ottoman–Safavid frontier and deepens the Sunni–Shia
    // political fault line for centuries.
    id: 'chaldiran',
    name: 'Battle of Chaldiran',
    year: '1514',
    coords: [44.3833, 39.0167], // Chaldoran, Iran
    caption: 'Ottoman–Safavid frontier fixed for centuries',
  },
  {
    // 1683 CE — Ottoman siege broken by the relief of Jan III Sobieski
    // of Poland; the high-water mark of Ottoman expansion into Europe.
    id: 'vienna-siege',
    name: 'Siege of Vienna',
    year: '1683',
    coords: [16.3738, 48.2082], // Vienna
    caption: 'Ottoman advance into Europe reaches its peak',
  },

  // ── Modern reshaping of the Muslim world ────────────────────────────────
  {
    // 1798 CE — Napoleon Bonaparte lands at Alexandria; the first direct
    // European military encroachment on an Ottoman heartland and the
    // spark of Muslim modernization debates from Muhammad Ali onward.
    id: 'napoleon-egypt',
    name: 'Napoleon in Egypt',
    year: '1798',
    coords: [29.9187, 31.2001], // Alexandria
    caption: 'first European military strike into Ottoman lands',
  },
  {
    // 1869 CE — Suez Canal opens, binding the Hejaz and Indian Ocean to
    // European shipping; reshapes hajj logistics and imperial strategy.
    id: 'suez-open',
    name: 'Suez Canal opens',
    year: '1869',
    coords: [32.5439, 30.5852], // Ismailia, midpoint
    caption: 'world trade rerouted through Egypt',
  },
  {
    // 1884–85 CE — Berlin Conference partitions Africa between European
    // powers; draws the borders that still shape many Muslim-majority
    // African states today.
    id: 'berlin-conf',
    name: 'Berlin Conference',
    year: '1884',
    coords: [13.405, 52.52], // Berlin
    caption: 'European powers carve up Africa',
  },
  {
    // 1917 CE — Balfour Declaration, a British statement of support for
    // "a national home for the Jewish people in Palestine". Issued from
    // the Foreign Office in London.
    id: 'balfour',
    name: 'Balfour Declaration',
    year: '1917',
    coords: [-0.1278, 51.5074], // London
    caption: 'British promise of a Jewish home in Palestine',
  },
  {
    // 3 March 1924 — Turkish Grand National Assembly in Ankara abolishes
    // the Ottoman caliphate; a rupture in the ummah's political form
    // still debated across Muslim political thought.
    id: 'caliphate-end',
    name: 'End of the Caliphate',
    year: '1924',
    coords: [32.8597, 39.9334], // Ankara
    caption: 'a 1,300-year Ottoman institution formally ends',
  },
  {
    // 1932 CE — Ibn Saud unifies the Najd and Hejaz into the Kingdom of
    // Saudi Arabia, fixing custody of the Haramayn in its modern form.
    id: 'saudi-unified',
    name: 'Saudi Arabia founded',
    year: '1932',
    coords: [46.7219, 24.6877], // Riyadh
    caption: 'Ibn Saud unifies the kingdom of the Haramayn',
  },
  {
    // 1947 CE — Partition of British India creates Pakistan; the largest
    // mass displacement in human history. Bengal anchor marks the
    // eastern half of the partition (later Bangladesh, 1971).
    id: 'partition-1947',
    name: 'Partition of India',
    year: '1947',
    coords: [90.4125, 23.8103], // Dhaka (Bengal partition)
    caption: 'Pakistan is created in history’s largest displacement',
  },
  {
    // 1979 CE — Iranian Revolution overthrows the Pahlavi monarchy;
    // establishes the Islamic Republic and redraws Muslim political
    // geography for the rest of the century.
    id: 'iran-rev',
    name: 'Iranian Revolution',
    year: '1979',
    coords: [51.389, 35.6892], // Tehran
    caption: 'Pahlavi monarchy falls, Islamic Republic born',
  },
  {
    // December 1979 — Soviet invasion of Afghanistan begins a decade-long
    // war and catalyzes a generation of transnational jihadist movements.
    id: 'soviet-afghan',
    name: 'Soviet–Afghan War',
    year: '1979',
    coords: [69.1833, 34.5333], // Kabul
    caption: 'a decade of war that catalyzed transnational jihadism',
  },
  {
    // 11 September 2001 — the attacks on New York and Washington
    // triggered the Global War on Terror, reshaping policy, borders,
    // and perceptions of Muslims worldwide for a generation.
    id: 'sept-11',
    name: 'September 11',
    year: '2001',
    coords: [-74.0134, 40.7127], // Lower Manhattan
    caption: 'the Global War on Terror begins',
  },
];

/** Lookup by id for the tap handler. */
export const HISTORICAL_EVENTS_BY_ID: ReadonlyMap<string, HistoricalEvent> = new Map(
  HISTORICAL_EVENTS.map((e) => [e.id, e]),
);
