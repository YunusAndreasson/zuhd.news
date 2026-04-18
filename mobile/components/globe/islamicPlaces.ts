/**
 * Historically significant places of the Islamic world. Surfaces only when
 * the globe is zoomed past the adaptive range (clip angle < 22°), so the
 * default view stays uncluttered. Each entry is anchored in broadly-accepted
 * Sunni historical record — not eschatology. Entries that lean on prophetic
 * tradition (Constantinople) cite the hadith; the rest cite the historical
 * event that fixes the place in the Islamic tradition.
 *
 * Coordinates point at the landmark a reader would recognize (the Haram,
 * the congregational mosque, etc.) rather than the modern city centroid.
 *
 * `caption` is short enough to be shown in a toast on tap, pairing with
 * the place's name (e.g. "Medina · the Prophet ﷺ's city and second Haram").
 */

export interface IslamicPlace {
  id: string;
  /** Latin-script label rendered on the globe. */
  name: string;
  /** Display coordinates — [lng, lat] tuple matches d3-geo's expected order. */
  coords: [number, number];
  /** Short sentence fragment used as the toast body on tap. */
  caption: string;
}

export const ISLAMIC_PLACES: IslamicPlace[] = [
  // ── Sacred & Seerah ──────────────────────────────────────────────────────
  {
    // Sahih al-Bukhari 1189 — Prophet ﷺ: travel is permitted to three
    // mosques (Makkah, Medina, Al-Aqsa). Medina's sanctity fixed by
    // multiple sahih narrations (e.g. Sahih Muslim 1363).
    id: 'medina',
    name: 'Medina',
    coords: [39.6111, 24.4672], // Masjid an-Nabawi
    caption: 'the Prophet ﷺ’s city and second Haram',
  },
  {
    // Battle of Badr, 17 Ramadan 2 AH / 624 CE — the first major victory
    // of the Muslims. Cited in Qur'an 3:123 ("God indeed helped you at
    // Badr when you were a humble few") and Qur'an 8:5–19.
    id: 'badr',
    name: 'Badr',
    coords: [38.7875, 23.7831], // Badr, Hejaz
    caption: 'site of the first major Muslim victory, 2 AH',
  },
  {
    // Battle / campaign of Khaybar, 7 AH / 628 CE. Sahih al-Bukhari
    // (Kitab al-Maghazi) devotes a full chapter to it; hadith on Ali
    // being given the banner (Sahih al-Bukhari 4210).
    id: 'khaybar',
    name: 'Khaybar',
    coords: [39.2897, 25.6975], // Khaybar oasis
    caption: 'fortress oasis taken in 7 AH',
  },
  {
    // First hijra to Abyssinia (c. 615 CE) under an-Najashi (the Negus).
    // The Prophet ﷺ prayed the funeral prayer for the Negus in absentia
    // (Sahih al-Bukhari 1320, 1333). Aksum was the kingdom's capital.
    id: 'aksum',
    name: 'Aksum',
    coords: [38.7237, 14.1211], // Aksum, Ethiopia
    caption: 'refuge of the first hijra, under the Negus',
  },
  {
    // Qur'an 17:1 (al-Isra'); Sahih al-Bukhari 1189 — third of the three
    // mosques Muslims may travel to. First qibla.
    id: 'al-aqsa',
    name: 'Al-Aqsa',
    coords: [35.2356, 31.7781], // Al-Aqsa mosque
    caption: 'first qibla, one of the three sacred mosques',
  },
  // ── Rashidun conquests ───────────────────────────────────────────────────
  {
    // Battle of Yarmuk, 15 AH / 636 CE — Rashidun army under Khalid ibn
    // al-Walid decisively defeated the Byzantine Empire and opened Sham
    // to Islamic rule.
    id: 'yarmuk',
    name: 'Yarmuk',
    coords: [35.89, 32.7], // Yarmuk valley
    caption: 'where the Byzantines fell to Khalid, 15 AH',
  },
  {
    // Battle of al-Qadisiyyah, 15 AH / 636 CE — Rashidun army under Sa'd
    // ibn Abi Waqqas defeated the Sassanid Empire, opening Iraq and
    // Persia to Islam.
    id: 'qadisiyyah',
    name: 'Qadisiyyah',
    coords: [44.28, 31.58], // approximate site near Kufa
    caption: 'where the Sassanids fell to the Rashidun, 15 AH',
  },
  {
    // Umayyad capital 661–750 CE (Mu'awiya onwards). Umayyad Mosque built
    // 706–715 CE by al-Walid I; one of the oldest extant mosques.
    id: 'damascus',
    name: 'Damascus',
    coords: [36.3066, 33.5117], // Umayyad Mosque
    caption: 'Umayyad caliphate capital, 661–750 CE',
  },
  {
    // Abbasid capital founded 762 CE by al-Mansur; seat of Bayt al-Hikmah,
    // the Islamic Golden Age of learning until the Mongol sack in 1258.
    id: 'baghdad',
    name: 'Baghdad',
    coords: [44.3931, 33.3406], // al-Mustansiriyya Madrasa
    caption: 'Abbasid capital and heart of the Golden Age',
  },
  {
    // Founded 969 CE by the Fatimids; home of al-Azhar (970 CE), which
    // became the central Sunni institution under the Ayyubids from 1171
    // CE onwards. Mamluk capital 1250–1517.
    id: 'cairo',
    name: 'Cairo',
    coords: [31.2625, 30.0459], // al-Azhar
    caption: 'al-Azhar, founded 970 CE',
  },
  {
    // Founded 670 CE by Uqba ibn Nafi'. Mosque of Uqba (Great Mosque of
    // Kairouan) is the first congregational mosque in the Maghreb and
    // the template for later North African mosque architecture.
    id: 'kairouan',
    name: 'Kairouan',
    coords: [10.1033, 35.6814], // Mosque of Uqba
    caption: 'first great mosque of the Maghreb, 670 CE',
  },
  {
    // Founded 698 CE on the site of Carthage. Zaytuna Mosque (732 CE)
    // among the oldest scholarly centers of the Maghreb; Ibn Khaldun
    // (d. 808 AH / 1406 CE) studied and taught here.
    id: 'tunis',
    name: 'Tunis',
    coords: [10.1723, 36.7977], // Zaytuna Mosque
    caption: 'Zaytuna Mosque and Ibn Khaldun’s teaching seat',
  },
  {
    // Almoravid foundation (1062 CE) and later Almohad imperial capital;
    // the Koutoubia Mosque (1184 CE) and al-Qarawiyyin's Maghrebi
    // successor madrasas anchor its scholarly weight.
    id: 'marrakesh',
    name: 'Marrakesh',
    coords: [-7.9908, 31.624], // Koutoubia Mosque
    caption: 'Almoravid and Almohad imperial capital',
  },
  {
    // Capital of the Umayyad Emirate and Caliphate of al-Andalus
    // (756–1031 CE). The Great Mosque (Mezquita) begun 785 CE.
    id: 'cordoba',
    name: 'Cordoba',
    coords: [-4.7794, 37.8789], // Mezquita
    caption: 'Umayyad al-Andalus capital, 756–1031 CE',
  },
  {
    // Final Muslim stronghold of al-Andalus under the Nasrid dynasty
    // (1238–1492 CE); Alhambra palace-fortress completed under Yusuf I
    // and Muhammad V in the 14th century.
    id: 'granada',
    name: 'Granada',
    coords: [-3.5881, 37.1761], // Alhambra
    caption: 'last Muslim stronghold of al-Andalus, fell 1492',
  },
  {
    // al-Qarawiyyin founded 859 CE by Fatima al-Fihriya — recognized by
    // UNESCO as the oldest continuously operating university.
    id: 'fes',
    name: 'Fes',
    coords: [-4.9733, 34.0647], // al-Qarawiyyin
    caption: 'al-Qarawiyyin, the oldest university still running (859)',
  },
  {
    // Walled holy city of Ethiopian Islam — the Jugol, a UNESCO World
    // Heritage site — with over 80 mosques in a small enclosure; founded
    // as an Islamic center from the 10th century.
    id: 'harar',
    name: 'Harar',
    coords: [42.1278, 9.3107], // Jugol walled city
    caption: 'walled Islamic city of Ethiopia',
  },
  {
    // Founded 999 CE by Hausa settlers; Islamic emirate from the 14th
    // century, consolidated under the Sokoto Caliphate in 1807. Long a
    // trans-Saharan trade terminus and learning center.
    id: 'kano',
    name: 'Kano',
    coords: [8.5142, 12.0028], // Great Mosque of Kano
    caption: 'Hausa emirate and Sahel learning center',
  },
  {
    // Trans-Saharan scholarly hub at its height under the Mali (14th c.)
    // and Songhai (15th–16th c.) empires. The Sankore, Djinguereber, and
    // Sidi Yahya mosques anchored a network of tens of thousands of
    // manuscripts now known as the Timbuktu Manuscripts.
    id: 'timbuktu',
    name: 'Timbuktu',
    coords: [-3.0087, 16.7666], // Sankore Mosque
    caption: 'Sankore scholarship and the trans-Saharan manuscripts',
  },
  {
    // Swahili Coast: centuries of Indian Ocean Islamic trading civilization.
    // Stone Town (Mji Mkongwe) is a UNESCO World Heritage site, successor
    // to the medieval Sultanate of Kilwa (10th–15th c.) traditions.
    id: 'zanzibar',
    name: 'Zanzibar',
    coords: [39.1897, -6.1628], // Stone Town
    caption: 'Swahili Coast Islamic civilization',
  },
  {
    // Conquered by Sultan Mehmed II in 1453 CE — the long-foretold fath
    // (Musnad Ahmad 18859; classed sahih by al-Albani, Silsilat al-Sahihah
    // 4/3). Ottoman capital thereafter.
    id: 'istanbul',
    name: 'Istanbul',
    coords: [28.98, 41.0086], // Hagia Sophia / Ayasofya
    caption: 'conquered 1453, the long-foretold fath',
  },
  {
    // Ottoman Bosnia: Gazi Husrev-beg Mosque (1531 CE) and endowment
    // complex. Long a central European center of Islamic learning and
    // civic infrastructure — often called the "Jerusalem of Europe".
    id: 'sarajevo',
    name: 'Sarajevo',
    coords: [18.4279, 43.8589], // Gazi Husrev-beg Mosque
    caption: 'Ottoman Bosnia and the Gazi Husrev-beg Mosque',
  },
  {
    // Historical capital of the Volga Tatars and, from the 15th century,
    // the Khanate of Kazan. The Qolşärif Mosque in the Kazan Kremlin
    // (rebuilt 2005) marks the centuries of Tatar Islamic presence on
    // the Volga.
    id: 'kazan',
    name: 'Kazan',
    coords: [49.1064, 55.7984], // Kazan Kremlin / Qolşärif
    caption: 'Volga Tatar historical capital',
  },
  {
    // Seljuk Sultanate of Rum capital (1077–1307 CE); center of early
    // Anatolian Islamization. Site of the mausoleum of Mawlana Jalal
    // al-Din al-Rumi (d. 672 AH / 1273 CE).
    id: 'konya',
    name: 'Konya',
    coords: [32.5067, 37.8713], // Mevlana complex
    caption: 'Seljuk Rum capital and Rumi’s resting place',
  },
  {
    // Early Islamic garrison city founded 14 AH / 636 CE under 'Umar. Home
    // of Hasan al-Basri (d. 110 AH), al-Khalil ibn Ahmad al-Farahidi
    // (d. 170 AH, grammarian of the Arabic language), and generations
    // of the earliest muhaddithun.
    id: 'basra',
    name: 'Basra',
    coords: [47.79, 30.5158],
    caption: 'early garrison city of Hasan al-Basri',
  },
  {
    // Khorasan's intellectual capital through the Abbasid and early
    // Seljuk periods. Birthplace of Imam Muslim ibn al-Hajjaj
    // (author of Sahih Muslim, d. 261 AH); a Shafi'i stronghold.
    id: 'nishapur',
    name: 'Nishapur',
    coords: [58.7958, 36.2126],
    caption: 'Khorasan’s scholarly hub and Imam Muslim’s home',
  },
  {
    // Central Asian center of learning from the 9th century onwards.
    // Registan, the Bibi-Khanym mosque, and the Ulugh Beg observatory
    // anchor the city's weight in the Islamic scholarly tradition.
    id: 'samarkand',
    name: 'Samarkand',
    coords: [66.9749, 39.6547], // Registan
    caption: 'Transoxiana center of learning',
  },
  {
    // Homeland of Imam Muhammad ibn Isma'il al-Bukhari (194–256 AH /
    // 810–870 CE), compiler of Sahih al-Bukhari. Historic seat of the
    // Samanid dynasty and a major medieval scholarly center.
    id: 'bukhara',
    name: 'Bukhara',
    coords: [64.4286, 39.7747], // Po-i-Kalyan
    caption: 'homeland of Imam al-Bukhari',
  },
  {
    // Delhi Sultanate (1206–1526 CE) and Mughal Empire (1526–1857 CE)
    // — the great Islamic political and scholarly center of the Indian
    // subcontinent. Home of Shah Waliullah (d. 1176 AH / 1762 CE) and
    // the Dehlavi hadith tradition.
    id: 'delhi',
    name: 'Delhi',
    coords: [77.237, 28.656], // Jama Masjid
    caption: 'Delhi Sultanate and Mughal imperial capital',
  },
  {
    // Mughal cultural and ceremonial capital; Data Darbar (shrine of Ali
    // Hujwiri, d. 465 AH), Badshahi Mosque (1084 AH / 1673 CE), and
    // later the city of Muhammad Iqbal (d. 1938).
    id: 'lahore',
    name: 'Lahore',
    coords: [74.3103, 31.589], // Badshahi Mosque
    caption: 'Mughal Punjab and the Badshahi Mosque',
  },
  // ── China & East Asia ────────────────────────────────────────────────────
  {
    // Great Mosque of Xi'an (the city known in the Abbasid era as
    // Chang'an) — founded 742 CE per inscription, rebuilt in Ming form.
    // A central site of Chinese Hui Muslim heritage.
    id: 'xian',
    name: "Xi'an",
    coords: [108.9386, 34.2655], // Great Mosque of Xi'an
    caption: 'Great Mosque of Xi’an and the Hui heartland',
  },
  {
    // Id Kah Mosque (founded 1442 CE) in Kashgar — historical heart of
    // Uyghur Islam and long the western terminus of the Silk Road.
    id: 'kashgar',
    name: 'Kashgar',
    coords: [75.9889, 39.4721], // Id Kah Mosque
    caption: 'Silk Road terminus and Uyghur Islamic heritage',
  },
  {
    // Quanzhou (known medievally as Zayton) — the Ashab Mosque (1009 CE)
    // and tombs of Muslim merchants attest to a centuries-long Muslim
    // trading community. Ibn Battuta visited the port in the 14th c.
    id: 'quanzhou',
    name: 'Quanzhou',
    coords: [118.5871, 24.915], // Ashab Mosque
    caption: 'medieval Muslim merchant port, visited by Ibn Battuta',
  },
  // ── Southeast Asia ───────────────────────────────────────────────────────
  {
    // Sultanate of Melaka (c. 1400–1511 CE) — the pivotal polity in the
    // Islamization of the Malay Archipelago. Its trade networks carried
    // Islam eastward through the islands before Aceh's later apex.
    id: 'melaka',
    name: 'Melaka',
    coords: [102.2497, 2.196], // Kampung Hulu area
    caption: 'Malay Sultanate (1400–1511) — pivot of Malay Islamization',
  },
  {
    // Sultanate of Aceh (founded c. 1496 CE) — the first enduring
    // Islamic polity in the Malay world. Known in the tradition as
    // Serambi Makkah ("Verandah of Makkah") for its role as the
    // springboard for Southeast Asian Islam.
    id: 'aceh',
    name: 'Aceh',
    coords: [95.3196, 5.5543], // Baiturrahman Grand Mosque
    caption: 'Serambi Makkah, gateway of Southeast Asian Islam',
  },
];

/** Lookup by id — small set, but a Map keeps the tap handler O(1). */
export const ISLAMIC_PLACES_BY_ID: ReadonlyMap<string, IslamicPlace> = new Map(
  ISLAMIC_PLACES.map((p) => [p.id, p]),
);
