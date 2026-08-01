// Where the star names came from.
//
// This is an editorial table, hand-written and reviewable, in the same class as
// `shared/place-names.ts` and `scripts/lib/market-metadata.js` — a set of claims
// the site is making, not a dataset it is passing through. The generated
// catalogue (`shared/data/stars.json`, from the Bright Star Catalogue and the
// IAU's own name list) carries positions and names and nothing about where a
// name came from, because nobody publishes that in machine-readable form: the
// IAU's file says in as many words that the WGSN "is working to add brief
// summaries of etymological information to future editions".
//
// It exists because of what the list turns out to be. Of the 138 IAU-approved
// names on stars brighter than magnitude 3, about a hundred came into every
// European language through Arabic — Aldebaran, Altair, Deneb, Rigel, Betelgeuse,
// Fomalhaut, Vega, Algol — usually as a fragment of a longer Arabic phrase,
// often mis-transcribed on the way, and occasionally as a scribe's error
// preserved for eight centuries (Betelgeuse is a misread *yad*, "hand", as
// *bat*). A reader of this site is owed that, and it is the one thing a star
// mark can say that a picture of a star cannot.
//
// **Not Arabic-only, and that is the point.** The recent IAU approvals are
// deliberately not: Larawag is Wardaman, Paikauhale is Hawaiian, Tianguan and
// Fang are Chinese lunar-mansion names, Imai is Mursi, Tiaki is Māori, Nunki
// and Sargas are Mesopotamian. Rendering the whole sky as Arabic would be the
// same mistake in the opposite direction.
//
// **No Arabic script.** It belongs here and is deliberately absent: a hundred
// lines of Arabic orthography is a hundred factual claims, and this file should
// not publish claims that have not been read by someone who can check them.
// Adding the script with a reviewer is a good next change.
//
// A name with no entry gets no etymology line on its card — the card says the
// designation, the constellation, the magnitude and the distance, which is the
// honest floor. Silence is better than a guess here: several traditional names
// have no agreed derivation at all (Kraz, Hatysa, Hassaleh, Avior), and a
// confident sentence about one of those would be this file inventing a source.

/**
 * The IAU's 88 constellations, abbreviation to name.
 *
 * Here rather than in the generated catalogue because it is a *naming* table
 * like the one below it, and here rather than in the island because both are
 * merged into `/basemap/stars.json` at build time — a card's worth of text that
 * only a click can reach has no business in the bundle every reader downloads.
 *
 * The abbreviation is kept alongside the name rather than replaced by it: a
 * designation is written `α Tau`, and expanding it to `α Taurus` would be
 * wrong (the correct expansion is the genitive, `α Tauri`). The card prints
 * `α Tau · in Taurus` and needs no genitive table to stay correct.
 */
export const CONSTELLATIONS: Record<string, string> = {
  And: 'Andromeda', Ant: 'Antlia', Aps: 'Apus', Aql: 'Aquila', Aqr: 'Aquarius',
  Ara: 'Ara', Ari: 'Aries', Aur: 'Auriga', Boo: 'Boötes', Cae: 'Caelum',
  Cam: 'Camelopardalis', Cap: 'Capricornus', Car: 'Carina', Cas: 'Cassiopeia',
  Cen: 'Centaurus', Cep: 'Cepheus', Cet: 'Cetus', Cha: 'Chamaeleon',
  Cir: 'Circinus', CMa: 'Canis Major', CMi: 'Canis Minor', Cnc: 'Cancer',
  Col: 'Columba', Com: 'Coma Berenices', CrA: 'Corona Australis',
  CrB: 'Corona Borealis', Crt: 'Crater', Cru: 'Crux', Crv: 'Corvus',
  CVn: 'Canes Venatici', Cyg: 'Cygnus', Del: 'Delphinus', Dor: 'Dorado',
  Dra: 'Draco', Equ: 'Equuleus', Eri: 'Eridanus', For: 'Fornax', Gem: 'Gemini',
  Gru: 'Grus', Her: 'Hercules', Hor: 'Horologium', Hya: 'Hydra', Hyi: 'Hydrus',
  Ind: 'Indus', Lac: 'Lacerta', Leo: 'Leo', Lep: 'Lepus', Lib: 'Libra',
  LMi: 'Leo Minor', Lup: 'Lupus', Lyn: 'Lynx', Lyr: 'Lyra', Men: 'Mensa',
  Mic: 'Microscopium', Mon: 'Monoceros', Mus: 'Musca', Nor: 'Norma',
  Oct: 'Octans', Oph: 'Ophiuchus', Ori: 'Orion', Pav: 'Pavo', Peg: 'Pegasus',
  Per: 'Perseus', Phe: 'Phoenix', Pic: 'Pictor', PsA: 'Piscis Austrinus',
  Psc: 'Pisces', Pup: 'Puppis', Pyx: 'Pyxis', Ret: 'Reticulum', Scl: 'Sculptor',
  Sco: 'Scorpius', Sct: 'Scutum', Ser: 'Serpens', Sex: 'Sextans',
  Sge: 'Sagitta', Sgr: 'Sagittarius', Tau: 'Taurus', Tel: 'Telescopium',
  TrA: 'Triangulum Australe', Tri: 'Triangulum', Tuc: 'Tucana',
  UMa: 'Ursa Major', UMi: 'Ursa Minor', Vel: 'Vela', Vir: 'Virgo',
  Vol: 'Volans', Vul: 'Vulpecula',
}

export interface StarLore {
  /** The language the name reached English through. */
  lang: string
  /** Romanised original, where the name is a fragment of a longer phrase. */
  from?: string
  /** What it means. */
  meaning: string
}

/**
 * Keyed by the IAU proper name exactly as `shared/data/stars.json` carries it,
 * so a rename upstream drops the entry rather than attaching it to the wrong
 * star. `stars.test.js` fails if a key here matches no star in the catalogue.
 */
export const STAR_LORE: Record<string, StarLore> = {
  // ── Arabic ────────────────────────────────────────────────────────────────
  Achernar: { lang: 'Arabic', from: 'ākhir an-nahr', meaning: 'the end of the river' },
  Acrab: { lang: 'Arabic', from: 'al-ʿaqrab', meaning: 'the scorpion' },
  Adhara: { lang: 'Arabic', from: 'al-ʿadhārā', meaning: 'the maidens' },
  Albaldah: { lang: 'Arabic', from: 'al-baldah', meaning: 'the town — a bare patch of sky' },
  Alderamin: { lang: 'Arabic', from: 'adh-dhirāʿ al-yamīn', meaning: 'the right forearm' },
  Aldebaran: { lang: 'Arabic', from: 'ad-dabarān', meaning: 'the follower — it follows the Pleiades' },
  Algenib: { lang: 'Arabic', from: 'al-janb', meaning: 'the flank' },
  Algieba: { lang: 'Arabic', from: 'al-jabhah', meaning: 'the forehead' },
  Algol: { lang: 'Arabic', from: 'al-ghūl', meaning: 'the ghoul — the star dims every 2.87 days' },
  Algorab: { lang: 'Arabic', from: 'al-ghurāb', meaning: 'the raven' },
  Alhena: { lang: 'Arabic', from: 'al-hanʿah', meaning: 'the brand, a mark burnt on a camel’s neck' },
  Alioth: { lang: 'Arabic', from: 'alyah', meaning: 'the fat tail of a sheep' },
  Aljanah: { lang: 'Arabic', from: 'al-janāḥ', meaning: 'the wing' },
  Alkaid: { lang: 'Arabic', from: 'qāʾid banāt naʿsh', meaning: 'the leader of the daughters of the bier' },
  Almaaz: { lang: 'Arabic', from: 'al-māʿiz', meaning: 'the he-goat' },
  Almach: { lang: 'Arabic', from: 'ʿanāq al-arḍ', meaning: 'the caracal' },
  Alnair: { lang: 'Arabic', from: 'an-nayyir min dhanab al-ḥūt', meaning: 'the bright one of the fish’s tail' },
  Alnasl: { lang: 'Arabic', from: 'an-naṣl', meaning: 'the arrowhead' },
  Alnilam: { lang: 'Arabic', from: 'an-niẓām', meaning: 'the string of pearls' },
  Alnitak: { lang: 'Arabic', from: 'an-niṭāq', meaning: 'the girdle' },
  Alniyat: { lang: 'Arabic', from: 'an-niyāṭ', meaning: 'the arteries' },
  Alphard: { lang: 'Arabic', from: 'al-fard', meaning: 'the solitary one — it stands alone in an empty sky' },
  Alphecca: { lang: 'Arabic', from: 'al-fakkah', meaning: 'the broken one — the gap in the northern crown' },
  Alpheratz: { lang: 'Arabic', from: 'surrat al-faras', meaning: 'the navel of the horse' },
  Altair: { lang: 'Arabic', from: 'an-nasr aṭ-ṭāʾir', meaning: 'the flying eagle' },
  Aludra: { lang: 'Arabic', from: 'al-ʿadhrāʾ', meaning: 'the maiden' },
  Ankaa: { lang: 'Arabic', from: 'al-ʿanqāʾ', meaning: 'the phoenix' },
  Alsephina: { lang: 'Arabic', from: 'al-safīnah', meaning: 'the ship' },
  Arneb: { lang: 'Arabic', from: 'arnab', meaning: 'the hare' },
  Athebyne: { lang: 'Arabic', from: 'adh-dhiʾbayn', meaning: 'the two wolves' },
  Caph:{ lang: 'Arabic', from: 'al-kaff al-khaḍīb', meaning: 'the stained hand' },
  Cebalrai: { lang: 'Arabic', from: 'kalb ar-rāʿī', meaning: 'the shepherd’s dog' },
  Cursa: { lang: 'Arabic', from: 'al-kursī', meaning: 'the footstool' },
  Deneb: { lang: 'Arabic', from: 'dhanab ad-dajājah', meaning: 'the tail of the hen' },
  'Deneb Algedi': { lang: 'Arabic', from: 'dhanab al-jady', meaning: 'the tail of the goat' },
  Denebola: { lang: 'Arabic', from: 'dhanab al-asad', meaning: 'the tail of the lion' },
  Diphda: { lang: 'Arabic', from: 'aḍ-ḍifdaʿ ath-thānī', meaning: 'the second frog' },
  Dschubba: { lang: 'Arabic', from: 'jabhah', meaning: 'the forehead' },
  Dubhe: { lang: 'Arabic', from: 'ẓahr ad-dubb al-akbar', meaning: 'the back of the greater bear' },
  Elnath: { lang: 'Arabic', from: 'an-naṭḥ', meaning: 'the butting horn' },
  Eltanin: { lang: 'Arabic', from: 'at-tinnīn', meaning: 'the dragon' },
  Enif: { lang: 'Arabic', from: 'anf', meaning: 'the nose' },
  Fawaris: { lang: 'Arabic', from: 'al-fawāris', meaning: 'the horsemen' },
  Fomalhaut: { lang: 'Arabic', from: 'fam al-ḥūt', meaning: 'the mouth of the fish' },
  Gienah: { lang: 'Arabic', from: 'al-janāḥ', meaning: 'the wing' },
  Gomeisa: { lang: 'Arabic', from: 'al-ghumayṣāʾ', meaning: 'the bleary-eyed one' },
  Hadar: { lang: 'Arabic', from: 'haḍār', meaning: 'the settled land, as against the desert' },
  Hamal: { lang: 'Arabic', from: 'raʾs al-ḥamal', meaning: 'the head of the ram' },
  Izar: { lang: 'Arabic', from: 'izār', meaning: 'the waistcloth' },
  'Kaus Australis': { lang: 'Arabic and Latin', from: 'qaws', meaning: 'the southern part of the bow' },
  'Kaus Borealis': { lang: 'Arabic and Latin', from: 'qaws', meaning: 'the northern part of the bow' },
  'Kaus Media': { lang: 'Arabic and Latin', from: 'qaws', meaning: 'the middle of the bow' },
  Kochab: { lang: 'Arabic', from: 'al-kawkab ash-shamālī', meaning: 'the northern star' },
  Lesath: { lang: 'Arabic', from: 'lasʿah', meaning: 'the sting' },
  Mahasim: { lang: 'Arabic', from: 'al-miʿṣam', meaning: 'the wrist' },
  Markab: { lang: 'Arabic', from: 'markab', meaning: 'the saddle' },
  Markeb: { lang: 'Arabic', from: 'markab', meaning: 'the ship' },
  Matar: { lang: 'Arabic', from: 'saʿd al-maṭar', meaning: 'the lucky star of rain' },
  Mebsuta: { lang: 'Arabic', from: 'al-mabsūṭah', meaning: 'the outstretched paw' },
  Menkalinan: { lang: 'Arabic', from: 'mankib dhī al-ʿinān', meaning: 'the shoulder of the rein-holder' },
  Menkar: { lang: 'Arabic', from: 'minkhar', meaning: 'the nostril' },
  Menkent: { lang: 'Arabic and Latin', from: 'mankib', meaning: 'the shoulder of the centaur' },
  Merak: { lang: 'Arabic', from: 'al-maraqq', meaning: 'the loins' },
  Miaplacidus: { lang: 'Arabic and Latin', from: 'miyāh', meaning: 'the placid waters' },
  Mintaka: { lang: 'Arabic', from: 'manṭaqah', meaning: 'the belt' },
  Mirach: { lang: 'Arabic', from: 'mīzar', meaning: 'the waistcloth' },
  Mirfak: { lang: 'Arabic', from: 'al-mirfaq', meaning: 'the elbow' },
  Mirzam: { lang: 'Arabic', from: 'al-murzim', meaning: 'the announcer — it rises before Sirius' },
  Mizar: { lang: 'Arabic', from: 'mīzar', meaning: 'the waistcloth' },
  Muphrid: { lang: 'Arabic', from: 'mufrid ar-rāmiḥ', meaning: 'the solitary one of the lancer' },
  Nihal: { lang: 'Arabic', from: 'an-nihāl', meaning: 'the camels quenching their thirst' },
  Okab: { lang: 'Arabic', from: 'al-ʿuqāb', meaning: 'the eagle' },
  Phact: { lang: 'Arabic', from: 'fākhitah', meaning: 'the ring dove' },
  Phecda: { lang: 'Arabic', from: 'fakhidh ad-dubb', meaning: 'the thigh of the bear' },
  Rasalhague: { lang: 'Arabic', from: 'raʾs al-ḥawwāʾ', meaning: 'the head of the serpent-bearer' },
  Rastaban: { lang: 'Arabic', from: 'raʾs ath-thuʿbān', meaning: 'the head of the serpent' },
  Rigel: { lang: 'Arabic', from: 'rijl al-jabbār', meaning: 'the foot of the giant' },
  'Rigil Kentaurus': { lang: 'Arabic and Latin', from: 'rijl al-qanṭūris', meaning: 'the foot of the centaur' },
  Ruchbah: { lang: 'Arabic', from: 'rukbah', meaning: 'the knee' },
  Sabik: { lang: 'Arabic', from: 'as-sābiq', meaning: 'the preceding one' },
  Sadalmelik: { lang: 'Arabic', from: 'saʿd al-malik', meaning: 'the luck of the king' },
  Sadalsuud: { lang: 'Arabic', from: 'saʿd as-suʿūd', meaning: 'the luckiest of the lucky' },
  Sadr: { lang: 'Arabic', from: 'ṣadr ad-dajājah', meaning: 'the breast of the hen' },
  Saiph: { lang: 'Arabic', from: 'sayf al-jabbār', meaning: 'the sword of the giant' },
  Scheat: { lang: 'Arabic', from: 'as-sāq', meaning: 'the shin' },
  Schedar: { lang: 'Arabic', from: 'ṣadr', meaning: 'the breast' },
  Shaula: { lang: 'Arabic', from: 'ash-shawlāʾ', meaning: 'the raised tail of the scorpion' },
  Sheratan: { lang: 'Arabic', from: 'ash-sharaṭān', meaning: 'the two signs' },
  Suhail: { lang: 'Arabic', from: 'suhayl', meaning: 'a given name, and the old name of Canopus' },
  Tarazed: { lang: 'Persian', from: 'shāhīn tarāzū', meaning: 'the beam of the scale' },
  Toliman: { lang: 'Arabic', from: 'aẓ-ẓalīmān', meaning: 'the two ostriches' },
  Tureis: { lang: 'Arabic', from: 'turays', meaning: 'the little shield' },
  Unukalhai: { lang: 'Arabic', from: 'ʿunuq al-ḥayyah', meaning: 'the neck of the serpent' },
  Vega: { lang: 'Arabic', from: 'an-nasr al-wāqiʿ', meaning: 'the swooping eagle' },
  Wezen: { lang: 'Arabic', from: 'al-wazn', meaning: 'the weight' },
  'Yed Prior': { lang: 'Arabic and Latin', from: 'yad', meaning: 'the leading star of the hand' },
  Zaurak: { lang: 'Arabic', from: 'az-zawraq', meaning: 'the boat' },
  Zubenelgenubi: { lang: 'Arabic', from: 'az-zubānā al-janūbiyyah', meaning: 'the southern claw' },
  Zubeneschamali: { lang: 'Arabic', from: 'az-zubānā ash-shamāliyyah', meaning: 'the northern claw' },

  // Betelgeuse is kept apart because the note is the whole point of it.
  Betelgeuse: {
    lang: 'Arabic',
    from: 'yad al-jawzāʾ',
    meaning: 'the hand of al-Jawzāʾ — mediaeval copyists read the yāʾ as a bāʾ, ' +
      'and eight centuries of European star charts have carried the slip',
  },

  // ── Greek and Latin ───────────────────────────────────────────────────────
  Alcyone: { lang: 'Greek', meaning: 'one of the seven Pleiades' },
  Antares: { lang: 'Greek', from: 'Ant-Arēs', meaning: 'the rival of Ares — it is as red as Mars' },
  Arcturus: { lang: 'Greek', from: 'Arktouros', meaning: 'the guardian of the bear' },
  Ascella: { lang: 'Latin', meaning: 'the armpit' },
  Aspidiske: { lang: 'Greek', from: 'aspidiskē', meaning: 'the little shield' },
  Bellatrix: { lang: 'Latin', meaning: 'the woman warrior' },
  Capella: { lang: 'Latin', meaning: 'the little she-goat' },
  Canopus:{ lang: 'Greek', from: 'Kanōbos', meaning: 'the pilot of Menelaus’s ship' },
  Castor: { lang: 'Greek', meaning: 'one of the twins' },
  'Cor Caroli': { lang: 'Latin', meaning: 'the heart of Charles' },
  Kornephoros: { lang: 'Greek', from: 'korynēphoros', meaning: 'the club-bearer' },
  Mimosa: { lang: 'Latin', meaning: 'the mimosa flower — a modern name, not an ancient one' },
  Naos: { lang: 'Greek', from: 'naus', meaning: 'the ship' },
  Polaris: { lang: 'Latin', from: 'stella polaris', meaning: 'the pole star' },
  Pollux: { lang: 'Latin', meaning: 'the other twin' },
  Procyon: { lang: 'Greek', from: 'prokyōn', meaning: 'before the dog — it rises ahead of Sirius' },
  Regulus: { lang: 'Latin', meaning: 'the little king' },
  Sirius: { lang: 'Greek', from: 'seirios', meaning: 'scorching' },
  Spica: { lang: 'Latin', meaning: 'the ear of grain' },
  Vindemiatrix: { lang: 'Latin', meaning: 'the grape-harvestress — it rises at the vintage' },
  Zosma: { lang: 'Greek', from: 'zōsma', meaning: 'the girdle' },

  // ── Everywhere else ───────────────────────────────────────────────────────
  Acrux: { lang: 'Modern', meaning: 'a contraction of Alpha Crucis, coined in the 1800s' },
  Atria: { lang: 'Modern', meaning: 'a contraction of Alpha Trianguli Australis' },
  Avior: { lang: 'Modern', meaning: 'coined in the 1930s for a navigation almanac; its derivation went unrecorded' },
  Fang: { lang: 'Chinese', from: '房', meaning: 'the room — the fourth lunar mansion' },
  Gacrux: { lang: 'Modern', meaning: 'a contraction of Gamma Crucis' },
  Imai: { lang: 'Mursi', meaning: 'a Mursi name from the lower Omo valley' },
  Larawag: { lang: 'Wardaman', meaning: 'a Wardaman name from northern Australia' },
  Nunki: { lang: 'Babylonian', meaning: 'a Sumerian name recorded in cuneiform' },
  Paikauhale: { lang: 'Hawaiian', meaning: 'the vagrant, one without a home' },
  Peacock: { lang: 'English', meaning: 'named in the 1930s for a navigation almanac that needed one' },
  Sargas: { lang: 'Akkadian', meaning: 'an Akkadian name of uncertain sense' },
  Tiaki: { lang: 'Māori', meaning: 'to guard, to watch over' },
  Tianguan: { lang: 'Chinese', from: '天關', meaning: 'the celestial gate' },
}
