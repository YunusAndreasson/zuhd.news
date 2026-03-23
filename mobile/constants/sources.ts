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
      'French government-funded international news channel. Broadcasts in four languages with depth on Francophone Africa.',
  },
  'Deutsche Welle': {
    type: 'Public broadcaster',
    location: 'Bonn, Germany',
    description:
      'Germany\u2019s international broadcaster. Publishes in 30 languages with strong coverage of European politics and human rights.',
  },
  AllAfrica: {
    type: 'Digital media',
    location: 'Cape Town, South Africa',
    description:
      'Aggregator and publisher of African news from over 100 sources across the continent.',
  },
  'Al Monitor': {
    type: 'Digital media',
    location: 'Washington, DC',
    description:
      'Covers the Middle East and North Africa with reporting from journalists based in the region.',
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
    description: 'Trade publication covering cryptocurrency, blockchain, and digital assets.',
  },
  Bellingcat: {
    type: 'Investigative',
    location: 'The Hague, Netherlands',
    description:
      'Open-source intelligence collective using publicly available data and satellite imagery. Grant-funded.',
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
      'Pakistan\u2019s oldest English-language newspaper, founded in 1941 by Muhammad Ali Jinnah. Editorially independent.',
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
      'English-language newspaper covering Hong Kong, China, and Asia-Pacific. Owned by Alibaba Group.',
  },
  'Middle East Eye': {
    type: 'Digital media',
    location: 'London, UK',
    description:
      'Online news organization covering the Middle East and North Africa. Original reporting on conflicts and human rights.',
  },
  'Sveriges Radio': {
    type: 'Public broadcaster',
    location: 'Stockholm, Sweden',
    description:
      'Sweden\u2019s public radio broadcaster with legally mandated editorial independence.',
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
      'American cable news network owned by Fox Corporation. Largest cable news audience in the US.',
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
      'American nonprofit news cooperative founded in 1846. One of the two major global wire services alongside Reuters.',
  },
  BBC: {
    type: 'Public broadcaster',
    location: 'London, UK',
    description:
      'British Broadcasting Corporation. Funded by the UK licence fee. One of the largest and oldest news operations in the world.',
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
      'American online news aggregator and blog founded in 2005. Covers US politics, culture, and social issues.',
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
      'American newspaper of record founded in 1851. Extensive international bureau network. Owned by the Sulzberger family.',
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
      'British daily owned by the Scott Trust, guaranteeing editorial independence. Known for investigative journalism and progressive editorial stance.',
  },
  'The Jerusalem Post': {
    type: 'Newspaper',
    location: 'Tel Aviv, Israel',
    description:
      'English-language Israeli newspaper founded in 1932. Centre-right editorial line. Widely read internationally for Israeli perspective.',
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
      'Online newspaper founded in 2012. Covers Israeli news, Middle East affairs, and Jewish world. Centrist editorial line.',
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
      'Global wire service owned by Thomson Reuters. One of the two largest international news agencies alongside Associated Press.',
  },
  'Al Arabiya': {
    type: 'Broadcaster',
    location: 'Dubai, UAE',
    description:
      'Saudi-owned Arabic news channel. Covers Middle East affairs with editorial perspective aligned with Saudi foreign policy.',
  },
  'The Intercept': {
    type: 'Investigative',
    location: 'New York, US',
    description:
      'Digital publication focused on national security, civil liberties, and government surveillance. Founded on the Snowden archive.',
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
      'American broadsheet known for political coverage and investigative journalism. Owned by Jeff Bezos since 2013.',
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
};
