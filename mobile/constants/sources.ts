interface SourceInfo {
  type: string;
  location: string;
  description: string;
}

export const SOURCES: Record<string, SourceInfo> = {
  'Al Jazeera': {
    type: 'Public broadcaster',
    location: 'Doha, Qatar',
    description:
      'English-language news network funded by the Qatari government. Extensive coverage of the Middle East, Africa, and the Global South.',
  },
  'BBC World': {
    type: 'Public broadcaster',
    location: 'London, UK',
    description:
      'International news service of the BBC, funded by the UK licence fee. One of the largest global news operations.',
  },
  'BBC Business': {
    type: 'Public broadcaster',
    location: 'London, UK',
    description:
      'Business and economics vertical of BBC News. Covers global markets, trade, and economic policy.',
  },
  'France 24': {
    type: 'Public broadcaster',
    location: 'Paris, France',
    description:
      'French government-funded international news channel. Broadcasts in four languages with depth on Francophone Africa. Coverage shaped by French foreign policy interests, particularly in former colonies and on secularism issues affecting Muslims.',
  },
  'Deutsche Welle': {
    type: 'Public broadcaster',
    location: 'Bonn, Germany',
    description:
      'Germany\u2019s international broadcaster. Publishes in 30 languages with strong coverage of European politics and human rights. Fired several Arab journalists in 2022 over social media posts critical of Israel, reflecting Germany\u2019s policy of unconditional Israel support.',
  },
  AllAfrica: {
    type: 'Digital media',
    location: 'Washington, DC / Nairobi',
    description:
      'Aggregator and publisher of African news from over 100 sources across the continent. Registered in Mauritius with editorial offices in Washington, Nairobi, Lagos, and Cape Town.',
  },
  'Al Monitor': {
    type: 'Digital media',
    location: 'Washington, DC',
    description:
      'Covers the Middle East and North Africa with reporting from journalists based in the region. Funded by subscriptions and corporate sponsors. Founded by Jamal Daniel, an Iraqi-American businessman.',
  },
  'Hacker News': {
    type: 'Community',
    location: 'San Francisco, US',
    description:
      'Link aggregator run by Y Combinator. Stories ranked by user votes, surfacing technical and entrepreneurial content.',
  },
  'The Hindu': {
    type: 'Newspaper',
    location: 'Chennai, India',
    description:
      'English-language daily founded in 1878. Regarded as a paper of record in India for politics and policy.',
  },
  Yonhap: {
    type: 'News agency',
    location: 'Seoul, South Korea',
    description:
      'South Korea\u2019s largest news agency. Primary wire service for Korean news and inter-Korean relations.',
  },
  CoinDesk: {
    type: 'Digital media',
    location: 'New York, US',
    description:
      'Trade publication covering cryptocurrency, blockchain, and digital assets. Acquired in 2023 by Bullish, a crypto exchange backed by Peter Thiel and others \u2014 a potential conflict of interest on industry coverage.',
  },
  Bellingcat: {
    type: 'Investigative',
    location: 'The Hague, Netherlands',
    description:
      'Open-source intelligence collective using publicly available data and satellite imagery. Funded by grants including from the European Union, Dutch government, and private foundations.',
  },
  Haaretz: {
    type: 'Newspaper',
    location: 'Tel Aviv, Israel',
    description:
      'Israel\u2019s oldest daily newspaper, published since 1918. Consistently critical of the occupation, settlement expansion, and military operations in Palestinian territories. One of the few Israeli outlets that reports Palestinian casualties and human rights violations with the same weight as Israeli ones.',
  },
  Nature: {
    type: 'Scientific journal',
    location: 'London, UK',
    description:
      'Peer-reviewed scientific journal founded in 1869. One of the most cited scientific publications in the world.',
  },
  'Quanta Magazine': {
    type: 'Nonprofit',
    location: 'New York, US',
    description:
      'Science and mathematics publication funded by the Simons Foundation. Technically rigorous long-form journalism.',
  },
  'New Scientist': {
    type: 'Magazine',
    location: 'London, UK',
    description:
      'Weekly science and technology magazine founded in 1956. Covers research developments for a general audience.',
  },
  'STAT News': {
    type: 'Digital media',
    location: 'Boston, US',
    description:
      'Health and medicine publication owned by Boston Globe Media. Covers pharma, biotech, and public health policy.',
  },
  'Ars Technica': {
    type: 'Digital media',
    location: 'New York, US',
    description:
      'Technology publication owned by Cond\u00e9 Nast. Known for in-depth, technically detailed reporting.',
  },
  'Moscow Times': {
    type: 'Newspaper',
    location: 'Amsterdam, Netherlands',
    description:
      'English-language outlet covering Russia, relocated abroad after 2022. Designated a \u201cforeign agent\u201d by Russia.',
  },
  'Rest of World': {
    type: 'Nonprofit',
    location: 'New York, US',
    description:
      'Covers technology\u2019s impact outside the Western bubble. Focuses on platforms, AI, and digital economies in the Global South.',
  },
  'MIT Technology Review': {
    type: 'Magazine',
    location: 'Cambridge, US',
    description:
      'Technology magazine owned by MIT, published since 1899. Covers emerging tech with a focus on societal implications.',
  },
  '404 Media': {
    type: 'Digital media',
    location: 'United States',
    description:
      'Worker-owned site founded by former Motherboard journalists. Investigates hacking, surveillance, AI, and digital rights.',
  },
  'Carbon Brief': {
    type: 'Nonprofit',
    location: 'London, UK',
    description:
      'Covers climate science, energy policy, and climate negotiations. Known for data-driven analysis and fact-checks.',
  },
  'Malay Mail': {
    type: 'Newspaper',
    location: 'Kuala Lumpur, Malaysia',
    description:
      'English-language newspaper founded in 1896. Covers Malaysian politics, courts, and national affairs.',
  },
  'Antara News': {
    type: 'News agency',
    location: 'Jakarta, Indonesia',
    description:
      'Indonesia\u2019s state-owned national news agency, established in 1937. Covers domestic politics and ASEAN affairs.',
  },
  'Premium Times': {
    type: 'Digital media',
    location: 'Abuja, Nigeria',
    description:
      'Nigerian investigative newspaper. Known for corruption investigations and accountability journalism.',
  },
  Dawn: {
    type: 'Newspaper',
    location: 'Karachi, Pakistan',
    description:
      'Pakistan\u2019s oldest English-language newspaper, founded in 1941 by Muhammad Ali Jinnah. Editorially independent but operates under persistent military and government pressure, including distribution blocks and journalist intimidation.',
  },
  'Daily Star': {
    type: 'Newspaper',
    location: 'Dhaka, Bangladesh',
    description:
      'Leading English-language daily in Bangladesh. Covers politics, garment industry, and climate vulnerability.',
  },
  'South China Morning Post': {
    type: 'Newspaper',
    location: 'Hong Kong',
    description:
      'English-language newspaper covering Hong Kong, China, and Asia-Pacific. Owned by Alibaba Group since 2016. Editorial independence questioned after acquisition; coverage of mainland China has softened notably.',
  },
  'Middle East Eye': {
    type: 'Digital media',
    location: 'London, UK',
    description:
      'Online news organization covering the Middle East and North Africa. Original reporting on conflicts and human rights. Funded by Qatari interests; editorially sympathetic to political Islam and Palestinian causes.',
  },
  'Sveriges Radio': {
    type: 'Public broadcaster',
    location: 'Stockholm, Sweden',
    description:
      'Sweden\u2019s public radio broadcaster with legally mandated editorial independence. Funded by a public service fee. Covers Nordic and Baltic affairs with strong investigative reporting.',
  },
  'Daily Maverick': {
    type: 'Digital media',
    location: 'Johannesburg, South Africa',
    description:
      'South African online newspaper. Its Scorpio unit has broken major stories on state capture and corruption.',
  },
  'Buenos Aires Times': {
    type: 'Newspaper',
    location: 'Buenos Aires, Argentina',
    description:
      'English-language newspaper covering Argentine politics and Latin American affairs.',
  },
  MercoPress: {
    type: 'News agency',
    location: 'Montevideo, Uruguay',
    description:
      'English-language agency focused on South America, particularly Mercosur member states and trade.',
  },
  'CBC News': {
    type: 'Public broadcaster',
    location: 'Toronto, Canada',
    description:
      'News division of the Canadian Broadcasting Corporation. Covers Canadian politics, Arctic affairs, and international news.',
  },
  'Fox News': {
    type: 'Cable news',
    location: 'New York, US',
    description:
      'American cable news network owned by Fox Corporation. Conservative editorial stance with a consistently pro-Israel position. Largest cable news audience in the US. Paid $787.5M to settle Dominion\u2019s defamation suit in 2023.',
  },
  'ABC News Australia': {
    type: 'Public broadcaster',
    location: 'Sydney, Australia',
    description:
      'News division of the Australian Broadcasting Corporation. Covers Asia-Pacific geopolitics and regional issues.',
  },
  'RNZ Pacific': {
    type: 'Public broadcaster',
    location: 'Wellington, New Zealand',
    description:
      'One of the few outlets providing consistent English-language coverage of Pacific Island nations and climate impacts.',
  },
  'Mada Masr': {
    type: 'Digital media',
    location: 'Cairo, Egypt',
    description:
      'Independent Egyptian news outlet operating under significant government pressure. Critical reporting on politics and human rights.',
  },
  Medyascope: {
    type: 'Digital media',
    location: 'Istanbul, Turkey',
    description:
      'Independent Turkish digital platform. Provides news outside Turkey\u2019s largely government-aligned mainstream media.',
  },
  TSA: {
    type: 'Digital media',
    location: 'Algiers, Algeria',
    description:
      'Tout Sur l\u2019Alg\u00e9rie. One of the most-read independent online news sources in Algeria.',
  },
  'Anadolu Agency': {
    type: 'News agency',
    location: 'Ankara, T\u00fcrkiye',
    description:
      'T\u00fcrkiye\u2019s state-run news agency. Publishes in 13 languages with extensive coverage of the Muslim world and Central Asia.',
  },
  'Associated Press': {
    type: 'News agency',
    location: 'New York, US',
    description:
      'American nonprofit news cooperative founded in 1846. One of the two major global wire services alongside Reuters. Its Gaza bureau building was destroyed by an Israeli airstrike in 2021. Wire service framing is adopted by thousands of downstream outlets.',
  },
  BBC: {
    type: 'Public broadcaster',
    location: 'London, UK',
    description:
      'British Broadcasting Corporation. Funded by the UK licence fee. One of the largest and oldest news operations in the world. Internal editorial guidelines avoid labelling Israeli military actions as \u201cattacks.\u201d The suppressed Balen Report on Middle East coverage bias has never been released despite Freedom of Information requests.',
  },
  'Economic Times': {
    type: 'Newspaper',
    location: 'Mumbai, India',
    description:
      'Indian financial daily owned by the Times Group. India\u2019s most widely read English-language business newspaper.',
  },
  HuffPost: {
    type: 'Digital media',
    location: 'New York, US',
    description:
      'American online news outlet founded in 2005. Progressive editorial stance. Acquired by BuzzFeed in 2021. Covers US politics, culture, and social issues.',
  },
  'Investing.com': {
    type: 'Financial data',
    location: 'Nicosia, Cyprus',
    description:
      'Financial markets platform providing real-time data, analysis, and news across global markets and commodities.',
  },
  'New York Times': {
    type: 'Newspaper',
    location: 'New York, US',
    description:
      'American newspaper of record founded in 1851. Extensive international bureau network. Owned by the Sulzberger family. Criticized by The Intercept and media watchdogs for disproportionate reliance on Israeli military sources and framing that minimizes Palestinian casualties in Gaza coverage.',
  },
  RT: {
    type: 'State broadcaster',
    location: 'Moscow, Russia',
    description:
      'Russian government-funded international television network. Designated a foreign agent in the US and banned in the EU.',
  },
  'Space.com': {
    type: 'Digital media',
    location: 'New York, US',
    description:
      'Space and astronomy news site owned by Future plc. Covers NASA missions, rocket launches, and astrophysics.',
  },
  TASS: {
    type: 'News agency',
    location: 'Moscow, Russia',
    description:
      'Russia\u2019s largest news agency, state-owned since 1904. Primary wire service for Russian government communications.',
  },
  'The Guardian': {
    type: 'Newspaper',
    location: 'London, UK',
    description:
      'British daily owned by the Scott Trust, guaranteeing editorial independence. No paywall; funded by reader donations and advertising. Progressive editorial stance. Known for investigative journalism.',
  },
  'The Jerusalem Post': {
    type: 'Newspaper',
    location: 'Tel Aviv, Israel',
    description:
      'English-language Israeli newspaper founded in 1932. Right-wing Zionist editorial line, shifted further under owner Eli Azur. Regularly amplifies IDF positions and government messaging.',
  },
  'The Times of India': {
    type: 'Newspaper',
    location: 'Mumbai, India',
    description:
      'World\u2019s largest-selling English-language daily newspaper. Flagship of the Times Group media conglomerate.',
  },
  'Times of Israel': {
    type: 'Digital media',
    location: 'Tel Aviv, Israel',
    description:
      'Online newspaper founded in 2012. Covers Israeli news, Middle East affairs, and Jewish world. Broadly Zionist editorial line. Publishes IDF-sourced material, sometimes without independent verification.',
  },
  'Yahoo News': {
    type: 'Digital media',
    location: 'Sunnyvale, US',
    description:
      'News aggregation platform combining original reporting with wire service and partner content. One of the most-visited news sites globally.',
  },
  'Drop Site': {
    type: 'Investigative',
    location: 'United States',
    description:
      'Independent investigative outlet founded by journalists Jeremy Scahill and Ryan Grim. Covers national security, foreign policy, and government accountability.',
  },
  OCCRP: {
    type: 'Investigative',
    location: 'Amsterdam, Netherlands',
    description:
      'Organised Crime and Corruption Reporting Project. Global network of investigative journalists exposing kleptocracy, money laundering, and state capture.',
  },
  Reuters: {
    type: 'News agency',
    location: 'London, UK',
    description:
      'Global wire service owned by Thomson Reuters. One of the two largest international news agencies alongside Associated Press. Trust Principles nominally guarantee editorial independence. Criticized for sanitized language around Israeli military operations that is then adopted by thousands of downstream outlets.',
  },
  'Al Arabiya': {
    type: 'Broadcaster',
    location: 'Dubai, UAE',
    description:
      'Saudi-owned Arabic news channel. Covers Middle East affairs with editorial perspective aligned with Saudi foreign policy, which has increasingly aligned with Israeli interests against Iran through normalization efforts.',
  },
  'The Intercept': {
    type: 'Investigative',
    location: 'New York, US',
    description:
      'Digital publication focused on national security, civil liberties, and government surveillance. Founded in 2014 by Pierre Omidyar\u2019s First Look Media, originally to publish the Snowden documents.',
  },
  'Kyodo News': {
    type: 'News agency',
    location: 'Tokyo, Japan',
    description:
      'Japan\u2019s largest news cooperative. Primary wire service for Japanese media, covering domestic politics and Asia-Pacific affairs.',
  },
  Xinhua: {
    type: 'News agency',
    location: 'Beijing, China',
    description:
      'China\u2019s official state news agency. Largest news agency in the world by correspondents and bureaus. Reflects Chinese government positions.',
  },
  'The Washington Post': {
    type: 'Newspaper',
    location: 'Washington, DC',
    description:
      'American broadsheet known for political coverage and investigative journalism. Owned by Jeff Bezos since 2013. Generally reflects US establishment consensus on Israel-Palestine, which skews toward Israeli state framing.',
  },
  'Financial Times': {
    type: 'Newspaper',
    location: 'London, UK',
    description:
      'Global business daily owned by Nikkei. Authoritative coverage of finance, economics, and international trade.',
  },
  'The Economist': {
    type: 'Magazine',
    location: 'London, UK',
    description:
      'Weekly magazine covering international affairs, politics, business, and economics. Known for unsigned editorial voice.',
  },
  'Le Monde': {
    type: 'Newspaper',
    location: 'Paris, France',
    description:
      'France\u2019s newspaper of record. Independent editorial line covering French and international politics.',
  },
  'Der Spiegel': {
    type: 'Magazine',
    location: 'Hamburg, Germany',
    description:
      'Germany\u2019s largest news magazine. Known for investigative reporting and its role in exposing political scandals.',
  },

  // --- Name variants (same outlets, different feed names) ---
  'Al Jazeera Online': {
    type: 'Public broadcaster',
    location: 'Doha, Qatar',
    description:
      'English-language news network funded by the Qatari government. Extensive coverage of the Middle East, Africa, and the Global South.',
  },
  'Al-Monitor': {
    type: 'Digital media',
    location: 'Washington, DC',
    description:
      'Covers the Middle East and North Africa with reporting from journalists based in the region. Funded by subscriptions and corporate sponsors. Founded by Jamal Daniel, an Iraqi-American businessman.',
  },
  'Anadolu Ajans\u0131': {
    type: 'News agency',
    location: 'Ankara, T\u00fcrkiye',
    description:
      'T\u00fcrkiye\u2019s state-run news agency. Publishes in 13 languages with extensive coverage of the Muslim world and Central Asia.',
  },
  'Drop Site News': {
    type: 'Investigative',
    location: 'United States',
    description:
      'Independent investigative outlet founded by journalists Jeremy Scahill and Ryan Grim. Covers national security, foreign policy, and government accountability.',
  },
  'Premium Times Nigeria': {
    type: 'Digital media',
    location: 'Abuja, Nigeria',
    description:
      'Nigerian investigative newspaper. Known for corruption investigations and accountability journalism.',
  },

  // --- Sources appearing in feed without prior entries ---
  'TRT World': {
    type: 'State broadcaster',
    location: 'Istanbul, T\u00fcrkiye',
    description:
      'English-language international channel of Turkish Radio and Television Corporation. State-funded. Covers the Muslim world, Africa, and conflict zones. Editorial line reflects Turkish government positions on foreign policy.',
  },
  'Nikkei Asia': {
    type: 'Digital media',
    location: 'Tokyo, Japan',
    description:
      'English-language outlet of Nikkei Inc. covering Asian business, politics, and economics. Also owns the Financial Times.',
  },
  'The New Arab': {
    type: 'Digital media',
    location: 'London, UK',
    description:
      'English-language outlet covering the Middle East, North Africa, and the wider Muslim world. Funded by Qatari interests.',
  },
  'The National': {
    type: 'Newspaper',
    location: 'Abu Dhabi, UAE',
    description:
      'English-language broadsheet owned by the Abu Dhabi state investment fund. Covers Gulf affairs, business, and regional politics. Editorial line reflects UAE foreign policy, including the Abraham Accords normalization with Israel.',
  },
  'Mehr News Agency': {
    type: 'News agency',
    location: 'Tehran, Iran',
    description:
      'Semi-official Iranian news agency affiliated with the Islamic Ideology Dissemination Organization. Provides an Iranian government-adjacent perspective on regional affairs.',
  },
  Euronews: {
    type: 'Broadcaster',
    location: 'Lyon, France',
    description:
      'Pan-European multilingual news channel. Covers EU politics, climate, and technology from a continental perspective.',
  },
  'Euronews English': {
    type: 'Broadcaster',
    location: 'Lyon, France',
    description:
      'Pan-European multilingual news channel. Covers EU politics, climate, and technology from a continental perspective.',
  },
  SMEX: {
    type: 'Nonprofit',
    location: 'Beirut, Lebanon',
    description:
      'Digital rights organization advancing self-expression and privacy in the Middle East and North Africa. Monitors internet shutdowns and censorship.',
  },
  'India Today': {
    type: 'Magazine',
    location: 'New Delhi, India',
    description:
      'India\u2019s most widely read English-language news magazine. Covers politics, economy, and society across the subcontinent.',
  },
  'The Independent': {
    type: 'Digital media',
    location: 'London, UK',
    description:
      'British online newspaper. Originally a broadsheet, now digital-only since 2016. Owned by a Saudi-linked consortium.',
  },
  Wamda: {
    type: 'Digital media',
    location: 'Dubai, UAE',
    description:
      'Platform covering entrepreneurship, venture capital, and the startup ecosystem across the Middle East and North Africa.',
  },
  Mint: {
    type: 'Newspaper',
    location: 'New Delhi, India',
    description:
      'Indian business daily published by HT Media in arrangement with the Wall Street Journal. Covers markets, policy, and technology.',
  },
  'Ecofin Agency': {
    type: 'News agency',
    location: 'Lom\u00e9, Togo',
    description:
      'Pan-African economic news agency. Covers finance, energy, agriculture, and infrastructure across Francophone and Anglophone Africa.',
  },
  'The Star': {
    type: 'Newspaper',
    location: 'Kuala Lumpur, Malaysia',
    description:
      'Malaysia\u2019s largest English-language newspaper by circulation. Covers politics, business, and regional Southeast Asian affairs.',
  },
};
