interface SourceInfo {
  type: string;
  location: string;
  description: string;
}

const _SOURCES: Record<string, SourceInfo> = {
  'Al Jazeera': {
    type: 'Public broadcaster',
    location: 'Doha, Qatar',
    description:
      'English-language news network funded by the Qatari government. Extensive coverage of the Middle East, Africa, and the Global South. One of the few major international broadcasters with sustained Palestinian perspective. Israel banned Al Jazeera from operating in 2024; at least ten staff journalists and nine freelancers have been killed by Israeli strikes in Gaza. Coverage of Qatari domestic affairs is noticeably limited.',
  },
  'BBC World': {
    type: 'Public broadcaster',
    location: 'London, UK',
    description:
      'International news service of the BBC, funded by the UK licence fee. One of the largest global news operations. Internal guidelines avoid labelling Israeli military actions as \u201cattacks\u201d; the suppressed Balen Report on Middle East coverage bias has never been released.',
  },
  'BBC Business': {
    type: 'Public broadcaster',
    location: 'London, UK',
    description:
      'Business and economics vertical of BBC News. Covers global markets, trade, and economic policy. Subject to the same BBC editorial guidelines that have been criticized for language choices minimizing Israeli military violence.',
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
      'Germany\u2019s international broadcaster. Publishes in 30 languages with strong coverage of European politics and human rights. Fired several Arab journalists over social media posts critical of Israel; German courts later ruled at least two of the dismissals were unjustified. DW subsequently updated its code of conduct to require all employees to support Israel\u2019s right to exist.',
  },
  AllAfrica: {
    type: 'Digital media',
    location: 'Washington, DC / Nairobi',
    description:
      'Aggregator and publisher of African news from over a hundred sources across the continent. Editorial offices in Washington, Nairobi, Lagos, and Cape Town.',
  },
  'Al Monitor': {
    type: 'Digital media',
    location: 'Washington, DC',
    description:
      'Covers the Middle East and North Africa with reporting from journalists based in the region. Funded by subscriptions and corporate sponsors. Founded by Jamal Daniel, a Syrian-American businessman.',
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
      'English-language daily founded in 1878. Regarded as a paper of record in India for politics and policy. Editorially independent and often critical of the BJP government; one of the few major Indian outlets that consistently questions Hindu nationalist policies.',
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
      'Trade publication covering cryptocurrency, blockchain, and digital assets. Acquired by Bullish, a crypto exchange backed by Peter Thiel and spun out of Block.one, a controversial crypto firm \u2014 a structural conflict of interest on industry coverage.',
  },
  Bellingcat: {
    type: 'Investigative',
    location: 'The Hague, Netherlands',
    description:
      'Open-source intelligence collective using publicly available data and satellite imagery. Funded by grants including from the National Endowment for Democracy (US State Dept\u2013linked), EU, and Dutch government. Investigations have predominantly focused on Russian and Syrian targets, though since October 2023 it has applied similar methods to documenting strikes in Gaza.',
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
      'Indonesia\u2019s state-owned national news agency, established in 1937. Covers domestic politics, ASEAN affairs, and the world\u2019s largest Muslim-majority country.',
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
      'Leading English-language daily in Bangladesh. Covers politics, garment industry, and climate vulnerability. Bangladesh is one of the countries most threatened by rising sea levels.',
  },
  'South China Morning Post': {
    type: 'Newspaper',
    location: 'Hong Kong',
    description:
      'English-language newspaper covering Hong Kong, China, and Asia-Pacific. Owned by Alibaba Group since 2016. Editorial independence questioned after acquisition; coverage of mainland China has softened notably, including on the treatment of Uyghur Muslims in Xinjiang.',
  },
  'Middle East Eye': {
    type: 'Digital media',
    location: 'London, UK',
    description:
      'Online news organization covering the Middle East and North Africa. Original reporting on conflicts and human rights. Majority shareholder is a former Al Jazeera executive; Saudi Arabia, UAE, Egypt, and Bahrain accused MEE of being Qatari-funded during the 2017 diplomatic crisis, which MEE denies. Editorially sympathetic to political Islam and Palestinian causes.',
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
      'South African online newspaper. Its Scorpio investigative unit has broken major stories on state capture, corruption, and political accountability.',
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
      'News division of the Canadian Broadcasting Corporation. Covers Canadian politics, Arctic affairs, and international news. Canada has historically voted with the US at the UN on Israel-Palestine resolutions; CBC coverage generally reflects this alignment.',
  },
  'Fox News': {
    type: 'Cable news',
    location: 'New York, US',
    description:
      'American cable news network owned by Fox Corporation. Conservative editorial stance with a consistently pro-Israel position. Largest cable news audience in the US. Settled the Dominion Voting Systems defamation lawsuit over false election claims.',
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
      'Independent Egyptian news outlet founded in 2013. The government blocked its website in 2023 in apparent reprisal for reporting on Egypt\u2019s plans regarding Palestinian refugees. Chief editor Lina Atallah has been detained by security forces. One of the few Egyptian outlets that reports critically on Egypt\u2019s enforcement of the Gaza blockade.',
  },
  Medyascope: {
    type: 'Digital media',
    location: 'Istanbul, Turkey',
    description:
      'Independent Turkish digital platform. One of the few outlets providing critical news outside T\u00fcrkiye\u2019s largely government-aligned mainstream media landscape.',
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
      'T\u00fcrkiye\u2019s state-run news agency. Publishes in 13 languages with extensive coverage of the Muslim world, Central Asia, and conflict zones. Photographs and videos widely syndicated by international outlets.',
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
      'British Broadcasting Corporation. Funded by the UK licence fee. One of the largest and oldest news operations in the world. Internal editorial guidelines have been criticized for systematic language asymmetry \u2014 emotive terms used far more frequently for Israeli casualties than Palestinian ones. The Balen Report, commissioned in 2004 to examine Middle East coverage, has never been released despite Freedom of Information requests. Over 100 BBC staff signed a letter in 2024 accusing the corporation of failing to humanize Palestinians.',
  },
  'Economic Times': {
    type: 'Newspaper',
    location: 'Mumbai, India',
    description:
      'Indian financial daily owned by the Times Group. India\u2019s most widely read English-language business newspaper. The Times Group is broadly supportive of the BJP government\u2019s economic agenda.',
  },
  HuffPost: {
    type: 'Digital media',
    location: 'New York, US',
    description:
      'American online news outlet founded in 2005. Progressive editorial stance. Acquired by BuzzFeed in 2021. Has published more coverage sympathetic to Palestinian civilians than most US mainstream outlets, though editorial line is inconsistent.',
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
      'American newspaper of record founded in 1851. One of the largest newspaper bureau networks globally. Owned by the Sulzberger family. Criticized by media watchdogs for disproportionate reliance on Israeli military sources and framing that minimizes Palestinian casualties in Gaza coverage.',
  },
  RT: {
    type: 'State broadcaster',
    location: 'Moscow, Russia',
    description:
      'Russian government-funded international television network. Designated a foreign agent in the US and banned in the EU. Primary instrument of Russian state messaging abroad; amplifies Kremlin narratives on NATO, Ukraine, and Western policy.',
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
      'Russia\u2019s largest news agency, state-owned since 1904. Primary wire service for Russian government communications. Reflects Kremlin foreign policy positions on all subjects.',
  },
  'The Guardian': {
    type: 'Newspaper',
    location: 'London, UK',
    description:
      'British daily owned by the Scott Trust, guaranteeing editorial independence. No paywall; funded by reader donations and advertising. Publishes more Palestinian perspectives than most UK outlets, though staff and critics have documented instances of amplifying Israeli government narratives uncritically.',
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
      'World\u2019s largest-selling English-language daily newspaper. Flagship of the Times Group media conglomerate. Generally avoids confrontation with the BJP government; coverage of Hindu-Muslim tensions tends to reflect the ruling party\u2019s framing.',
  },
  'Yahoo News': {
    type: 'Digital media',
    location: 'Sunnyvale, US',
    description:
      'News aggregation platform combining original reporting with wire service and partner content. One of the most-visited news sites globally. Editorial voice depends on the underlying source; Yahoo\u2019s own reporting is limited.',
  },
  'Drop Site': {
    type: 'Investigative',
    location: 'United States',
    description:
      'Independent investigative outlet founded by journalists Jeremy Scahill and Ryan Grim. Covers national security, foreign policy, and government accountability. Has published detailed reporting on US arms transfers to Israel and their use in Gaza.',
  },
  OCCRP: {
    type: 'Investigative',
    location: 'Amsterdam, Netherlands',
    description:
      'Organised Crime and Corruption Reporting Project. Global network of investigative journalists exposing kleptocracy, money laundering, and state capture. Received over half its budget from USAID until 2025 when the Trump administration froze funding, triggering major layoffs. Soros foundations also contribute. Investigations have primarily targeted non-Western governments.',
  },
  Reuters: {
    type: 'News agency',
    location: 'London, UK',
    description:
      'Global wire service owned by Thomson Reuters. One of the two largest international news agencies alongside Associated Press. Trust Principles nominally guarantee editorial independence. Criticized for sanitized language around Israeli military operations that is then adopted by thousands of downstream outlets.',
  },
  'Al Arabiya': {
    type: 'Broadcaster',
    location: 'Riyadh, Saudi Arabia',
    description:
      'Saudi-owned Arabic news channel, part of MBC Group. Saudi Arabia\u2019s sovereign wealth fund acquired majority ownership of MBC in 2025. Editorial perspective aligned with Saudi foreign policy, which has increasingly aligned with Israeli interests against Iran through normalization efforts. Algeria suspended Al Arabiya operations over bias in Gaza coverage.',
  },
  'The Intercept': {
    type: 'Investigative',
    location: 'New York, US',
    description:
      'Digital publication focused on national security, civil liberties, and government surveillance. Founded in 2014 by Pierre Omidyar\u2019s First Look Media to publish the Snowden documents; spun off as an independent nonprofit in 2023 after Omidyar ended funding. Has faced financial difficulty, with its CEO citing Israel-Palestine coverage as a barrier to philanthropic donations. One of the few US outlets that consistently reports on Israeli military operations with the same scrutiny applied to other militaries.',
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
      'China\u2019s official state news agency. Largest news agency in the world by correspondents and bureaus. Reflects Chinese government positions on trade, territorial claims, and multilateral affairs. Coverage of domestic issues including Xinjiang and Tibet is entirely state-controlled.',
  },
  'The Washington Post': {
    type: 'Newspaper',
    location: 'Washington, DC',
    description:
      'American broadsheet known for political coverage and investigative journalism. Owned by Jeff Bezos since 2013. Bezos\u2019s Amazon holds a major cloud computing contract with the Israeli government (Project Nimbus). In 2024, Bezos blocked the paper from endorsing a presidential candidate, triggering mass subscriber cancellations and columnist resignations.',
  },
  'Financial Times': {
    type: 'Newspaper',
    location: 'London, UK',
    description:
      'Global business daily owned by Nikkei. Authoritative coverage of finance, economics, and international trade. Reflects the perspective of global financial elites; political coverage generally aligns with Western establishment consensus.',
  },
  'The Economist': {
    type: 'Magazine',
    location: 'London, UK',
    description:
      'Weekly magazine covering international affairs, politics, business, and economics. Known for unsigned editorial voice. Reflects a liberal internationalist worldview rooted in free-market economics; coverage of Israel-Palestine has varied but generally operates within a Western establishment framework. Skeptical of political Islam.',
  },
  'Le Monde': {
    type: 'Newspaper',
    location: 'Paris, France',
    description:
      'France\u2019s newspaper of record. Independent editorial line covering French and international politics. Coverage of Muslim communities in France is filtered through the la\u00efcit\u00e9 (secularism) framework, which often frames religious practice as a problem to be managed.',
  },
  'Der Spiegel': {
    type: 'Magazine',
    location: 'Hamburg, Germany',
    description:
      'Germany\u2019s largest news magazine. Known for investigative reporting and its role in exposing political scandals. Operates within Germany\u2019s political consensus that treats support for Israel as a state obligation rooted in Holocaust responsibility, which constrains critical coverage of Israeli military operations.',
  },

  'Bloomberg Business': {
    type: 'News agency',
    location: 'New York, US',
    description:
      'Financial news division of Bloomberg LP, founded by Michael Bloomberg. One of the most influential business wire services globally. Bloomberg has donated tens of millions to Israeli causes and was awarded the Genesis Prize for commitment to Jewish values and Israel. Coverage generally reflects US establishment framing on the conflict.',
  },
  'ABP Live': {
    type: 'Digital media',
    location: 'New Delhi, India',
    description:
      'English-language digital arm of ABP News Network. Covers Indian politics, business, and technology. ABP\u2019s Hindi-language channels have faced criticism for amplifying BJP nationalist narratives, though the English arm is more restrained.',
  },
  MoneyControl: {
    type: 'Financial data',
    location: 'Mumbai, India',
    description:
      'Indian financial news platform owned by Network18 (Reliance Industries). Covers markets, mutual funds, and economic policy. Network18 staff have reported that criticism of the Modi government or Reliance is prohibited in the newsroom.',
  },
  News18: {
    type: 'Digital media',
    location: 'New Delhi, India',
    description:
      'Indian news portal owned by Network18 (Reliance Industries). Covers politics, business, and entertainment. One of the most explicitly pro-BJP outlets in the Network18 stable; frequently amplifies Hindu nationalist talking points.',
  },
  'Game Rant': {
    type: 'Digital media',
    location: 'United States',
    description:
      'Gaming and entertainment news site owned by Valnet Inc. Covers game releases, reviews, and industry news.',
  },
  GamesRadar: {
    type: 'Digital media',
    location: 'Bath, UK',
    description:
      'Gaming and entertainment publication owned by Future plc. Covers games, film, and TV.',
  },
  'Investing.com South Africa': {
    type: 'Financial data',
    location: 'Nicosia, Cyprus',
    description:
      'South African edition of the global financial markets platform. Provides real-time data, analysis, and news on markets and commodities.',
  },
  'The Register': {
    type: 'Digital media',
    location: 'London, UK',
    description:
      'British technology news site founded in 1994. Known for irreverent tone and detailed coverage of enterprise IT, security, and science.',
  },
  'Ukrainska Pravda': {
    type: 'Digital media',
    location: 'Kyiv, Ukraine',
    description:
      'Ukraine\u2019s most-read online newspaper, founded in 2000 by Georgiy Gongadze, who was murdered months later by state agents. Covers politics, war, and corruption. Essential source on the Russia-Ukraine conflict from the Ukrainian perspective.',
  },
  news24: {
    type: 'Digital media',
    location: 'Cape Town, South Africa',
    description:
      'South Africa\u2019s largest online news publisher, owned by Media24 (Naspers). Covers politics, crime, and sport.',
  },
  '+972 Magazine': {
    type: 'Digital media',
    location: 'Israel/Palestine',
    description:
      'Independent, nonprofit magazine run by Israeli and Palestinian journalists. Named after the shared telephone country code. Critical coverage of the occupation, military policy, and settler violence.',
  },
  'Daily Mail Online': {
    type: 'Tabloid',
    location: 'London, UK',
    description:
      'Most-visited English-language newspaper website globally. Known for sensationalist framing and clickbait. Consistently pro-Israel editorial line; coverage of Palestinian casualties is typically minimal and framed through Israeli security narratives.',
  },
  'SciDev.Net': {
    type: 'Nonprofit',
    location: 'London, UK',
    description:
      'Covers science and technology for the developing world. Funded by international development agencies. One of the few outlets bridging scientific research and Global South policy.',
  },

  // --- Sources appearing in feed without prior entries ---
  'TRT World': {
    type: 'State broadcaster',
    location: 'Istanbul, T\u00fcrkiye',
    description:
      'English-language international channel of Turkish Radio and Television Corporation. State-funded. Covers the Muslim world, Africa, and conflict zones. Reflects Turkish government foreign policy positions.',
  },
  'Nikkei Asia': {
    type: 'Digital media',
    location: 'Tokyo, Japan',
    description:
      'English-language outlet of Nikkei Inc., which also owns the Financial Times. Covers Asian business, politics, and economics with a focus on the China-Japan-Korea triangle.',
  },
  'The New Arab': {
    type: 'Digital media',
    location: 'London, UK',
    description:
      'English-language outlet covering the Middle East, North Africa, and the wider Muslim world. Funded by Qatari interests. Provides a platform for Arab and Muslim voices underrepresented in Western media.',
  },
  'The National': {
    type: 'Newspaper',
    location: 'Abu Dhabi, UAE',
    description:
      'English-language broadsheet owned by the Abu Dhabi state investment fund. Covers Gulf affairs, business, and regional politics. Editorial line reflects UAE foreign policy interests.',
  },
  'Mehr News Agency': {
    type: 'News agency',
    location: 'Tehran, Iran',
    description:
      'Semi-official Iranian news agency whose director is appointed by Iran\u2019s Supreme Leader. Affiliated with the Islamic Development Organization, which also operates the Tehran Times and Tasnim News Agency. Publishes in six languages.',
  },
  Euronews: {
    type: 'Broadcaster',
    location: 'Lyon, France',
    description:
      'Pan-European multilingual news channel. Since 2022, majority-owned by Alpac Capital, a Portuguese firm with documented ties to Hungarian PM Viktor Orb\u00e1n, who contributed at least a third of the acquisition funding. Mass layoffs eliminated two-thirds of journalists. Editorial independence under serious question.',
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
      'India\u2019s most widely read English-language news magazine. Covers politics, economy, and society across the subcontinent. Owned by the India Today Group; editorial tone has shifted toward the BJP government under current management.',
  },
  'The Independent': {
    type: 'Digital media',
    location: 'London, UK',
    description:
      'British online newspaper. Originally a broadsheet, now digital-only since 2016. Owned by Saudi investor Sultan Muhammad Abuljadayel through the Lebedev family. Ownership has not visibly shifted editorial line, which remains broadly liberal.',
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
      'Indian business daily published by HT Media, controlled by the Birla family. Covers markets, policy, and technology. Financial reporting is generally straightforward, though HT Media\u2019s ownership maintains relationships across India\u2019s political spectrum.',
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
      'Malaysia\u2019s largest English-language newspaper by circulation. Covers politics, business, and regional Southeast Asian affairs. Owned by the Malaysian Chinese Association; reflects a more business-oriented perspective than Malay-language media.',
  },
  Rappler: {
    type: 'Digital media',
    location: 'Manila, Philippines',
    description:
      'Filipino online news outlet co-founded by Maria Ressa, the first journalist to receive the Nobel Peace Prize since 1935. Ressa was convicted of cyber-libel for investigating Duterte\u2019s war on drugs. Known for reporting on extrajudicial killings and disinformation.',
  },
  'CBS News': {
    type: 'Broadcaster',
    location: 'New York, US',
    description:
      'News division of CBS, one of the three major US broadcast networks. Coverage of the Middle East generally reflects US bipartisan consensus, which has historically been supportive of Israel.',
  },

  // --- New sources ---
  'Haberler.com': {
    type: 'Digital media',
    location: 'Istanbul, Türkiye',
    description:
      'One of Türkiye\u2019s most-visited news aggregation platforms. Compiles content from Turkish media outlets. Reflects the range of the Turkish media landscape, which is largely aligned with the government.',
  },
  TimesNow: {
    type: 'Broadcaster',
    location: 'Mumbai, India',
    description:
      'English-language Indian news channel owned by Times Network (part of the Times Group). Known for aggressive, opinion-heavy prime-time programming. Broadly supportive of the BJP government and Hindu nationalist narratives.',
  },
  'Salaam Gateway': {
    type: 'Digital media',
    location: 'Dubai, UAE',
    description:
      'Platform covering the global Islamic economy — halal industry, Islamic finance, modest fashion, and Muslim consumer markets. Operated by Refinitiv (LSEG).',
  },
  'The Daily Tribune': {
    type: 'Newspaper',
    location: 'Manila, Philippines',
    description:
      'Filipino English-language broadsheet covering politics, business, and regional affairs in the Philippines and Southeast Asia.',
  },
  Aol: {
    type: 'Digital media',
    location: 'New York, US',
    description:
      'Legacy internet portal now operating as a news aggregator under Yahoo. Content is largely syndicated from wire services and partner outlets.',
  },
  USGS: {
    type: 'Government agency',
    location: 'Reston, US',
    description:
      'United States Geological Survey. Federal science agency providing data on natural hazards, earthquakes, water resources, and ecosystems. Primary global source for real-time earthquake monitoring and volcanic activity alerts.',
  },
  'S&P Global PMI': {
    type: 'Financial data',
    location: 'New York, US',
    description:
      'Purchasing Managers\u2019 Index surveys published by S&P Global. Widely tracked leading indicators of manufacturing and services activity. PMI readings above 50 signal expansion; below 50 signal contraction.',
  },
  'Ministry of Foreign Affairs PRC': {
    type: 'Government',
    location: 'Beijing, China',
    description:
      'Official communications arm of the People\u2019s Republic of China\u2019s foreign ministry. Statements reflect Chinese Communist Party foreign policy positions on trade, territorial disputes, and multilateral diplomacy.',
  },
  'Chosun.com': {
    type: 'Newspaper',
    location: 'Seoul, South Korea',
    description:
      'Digital arm of the Chosun Ilbo, South Korea\u2019s largest-circulation newspaper. Conservative editorial stance, broadly supportive of the US-South Korea alliance. Historically close to South Korean business and political establishment.',
  },
  'Hindustan Times': {
    type: 'Newspaper',
    location: 'New Delhi, India',
    description:
      'Major English-language Indian daily owned by the Birla family via HT Media. One of the oldest newspapers in India, founded during the independence movement. Editorial line is more centrist than the Times Group papers but has shifted toward accommodation of the BJP government.',
  },
  'IGN India': {
    type: 'Digital media',
    location: 'Mumbai, India',
    description:
      'Indian edition of the global gaming and entertainment site. Covers games, tech, and pop culture for the Indian market.',
  },
  'RTE.ie': {
    type: 'Public broadcaster',
    location: 'Dublin, Ireland',
    description:
      'Ireland\u2019s national public broadcaster, funded by licence fee and advertising. Covers Irish politics, EU affairs, and international news. Ireland has been among the most outspoken EU members on Palestinian rights, including recognizing the State of Palestine in 2024.',
  },
  'Radio Dabanga': {
    type: 'Nonprofit',
    location: 'Amsterdam, Netherlands',
    description:
      'Independent radio station covering Sudan, broadcasting in Arabic and local languages from the Netherlands since 2008. One of the few outlets providing consistent reporting from Darfur and conflict zones within Sudan, where most international media cannot operate.',
  },
  'cnbctv18.com': {
    type: 'Broadcaster',
    location: 'Mumbai, India',
    description:
      'Indian business news channel, a joint venture between Network18 (Reliance Industries) and NBCUniversal. Covers Indian markets, corporate news, and economic policy. Operates under the same Reliance ownership structure as MoneyControl and News18.',
  },

  // --- New sources from feed ---
  AFP: {
    type: 'News agency',
    location: 'Paris, France',
    description:
      'Agence France-Presse, the world\u2019s third-largest wire service after AP and Reuters. Founded in 1835, making it the oldest news agency still in operation. French government-funded but editorially independent by statute since 1957. Wire copy adopted by thousands of outlets globally.',
  },
  Axios: {
    type: 'Digital media',
    location: 'Arlington, US',
    description:
      'American news site founded in 2017 by former Politico journalists. Known for bullet-point \u201cSmart Brevity\u201d format. Acquired by Cox Enterprises in 2022. Covers politics, tech, and business with a Washington insider perspective.',
  },
  'Business Insider': {
    type: 'Digital media',
    location: 'New York, US',
    description:
      'Business and tech news site owned by Axel Springer. Rebranded from Business Insider to Insider and back. Covers markets, tech, and corporate news with a mix of reporting and aggregation.',
  },
  CNBC: {
    type: 'Broadcaster',
    location: 'Englewood Cliffs, US',
    description:
      'American business news channel owned by NBCUniversal (Comcast). Primary US channel for real-time market coverage. Editorial perspective reflects Wall Street consensus.',
  },
  'Middle East Monitor': {
    type: 'Digital media',
    location: 'London, UK',
    description:
      'Online news outlet covering the Middle East and North Africa. Editorially sympathetic to Palestinian rights and critical of Israeli policy. Founded in 2009. Critics, particularly pro-Israel groups, accuse it of bias toward Hamas and the Muslim Brotherhood; MEMo describes itself as advocating for press freedom and human rights.',
  },
  Mirror: {
    type: 'Tabloid',
    location: 'London, UK',
    description:
      'British tabloid newspaper owned by Reach plc. Left-leaning editorial stance by tabloid standards. Covers politics, crime, and entertainment.',
  },
  'Nature Communications': {
    type: 'Scientific journal',
    location: 'London, UK',
    description:
      'Open-access multidisciplinary journal in the Nature portfolio. Publishes peer-reviewed research across the natural sciences, including biology, chemistry, physics, and earth sciences.',
  },
  'Nature npj Digital Medicine': {
    type: 'Scientific journal',
    location: 'London, UK',
    description:
      'Open-access journal in the Nature portfolio covering digital health, AI in medicine, and clinical informatics. Peer-reviewed under the Nature brand.',
  },
  NDTV: {
    type: 'Broadcaster',
    location: 'New Delhi, India',
    description:
      'Indian news channel acquired by the Adani Group in 2022. Previously regarded as one of India\u2019s more independent broadcasters. Since the Adani acquisition, staff and media analysts have documented a shift away from critical coverage of the BJP government and Adani business interests.',
  },
  Newsweek: {
    type: 'Magazine',
    location: 'New York, US',
    description:
      'American weekly news magazine founded in 1933. Now primarily digital. Acquired in 2013 by IBT Media, then by Dev Pragad\u2019s group. Editorial direction has shifted rightward under current ownership. Still carries legacy brand recognition.',
  },
  NPR: {
    type: 'Public broadcaster',
    location: 'Washington, DC',
    description:
      'National Public Radio, a nonprofit US media organization. Funded by member stations, corporate sponsors, and listener donations. Coverage of the Middle East has been criticized by internal staff and external watchdogs for systematically underreporting Palestinian casualties.',
  },
  'Punch Newspapers': {
    type: 'Newspaper',
    location: 'Lagos, Nigeria',
    description:
      'Nigeria\u2019s most widely read newspaper. Independent editorial stance with strong coverage of governance, corruption, and social affairs. Has repeatedly clashed with the Nigerian government over press freedom.',
  },
  'Sahara Reporters': {
    type: 'Digital media',
    location: 'New York / Lagos',
    description:
      'Nigerian citizen journalism platform founded by Omoyele Sowore. Covers corruption, human rights abuses, and government accountability. Sowore was detained by Nigeria\u2019s secret police in 2019 after calling for protests.',
  },
  'The Financial Express': {
    type: 'Newspaper',
    location: 'New Delhi, India',
    description:
      'Indian financial daily owned by the Indian Express Group. Covers markets, economic policy, and business. Editorially more independent than the Times Group or Network18 papers.',
  },
  'The Irrawaddy': {
    type: 'Digital media',
    location: 'Chiang Mai, Thailand',
    description:
      'Independent Myanmar news outlet operating in exile from Thailand since 1993. One of the few outlets providing consistent English-language coverage of Myanmar\u2019s military junta, civil resistance, and the Rohingya crisis.',
  },
  'The Kyiv Independent': {
    type: 'Digital media',
    location: 'Kyiv, Ukraine',
    description:
      'English-language Ukrainian news outlet founded in 2021 by journalists who left the Kyiv Post over editorial independence concerns. Primary English-language source on the Russia-Ukraine war from the Ukrainian side. Funded by reader subscriptions and European grants.',
  },
  'The Manila Times': {
    type: 'Newspaper',
    location: 'Manila, Philippines',
    description:
      'One of the oldest newspapers in the Philippines, founded in 1898. Covers politics, business, and regional Southeast Asian affairs.',
  },
  'The Straits Times': {
    type: 'Newspaper',
    location: 'Singapore',
    description:
      'Singapore\u2019s English-language newspaper of record, owned by Singapore Press Holdings. Covers Southeast Asian politics, trade, and regional security. Operates within Singapore\u2019s media environment, which ranks low on press freedom indices due to government licensing controls.',
  },
  'The Times of Israel': {
    type: 'Digital media',
    location: 'Tel Aviv, Israel',
    description:
      'Online newspaper founded in 2012. Covers Israeli news, Middle East affairs, and Jewish world. Broadly Zionist editorial line. Publishes IDF-sourced material, sometimes without independent verification.',
  },
  'U.S. News & World Report': {
    type: 'Digital media',
    location: 'Washington, DC',
    description:
      'American media company best known for its rankings of colleges, hospitals, and cities. News coverage is primarily aggregated. Digital-only since 2010.',
  },
  Vanguard: {
    type: 'Newspaper',
    location: 'Lagos, Nigeria',
    description:
      'Nigerian daily newspaper. Covers politics, business, and security. One of Nigeria\u2019s largest-circulation English-language papers.',
  },
  IOL: {
    type: 'Digital media',
    location: 'Cape Town, South Africa',
    description:
      'South African online news portal owned by Sekunjalo Group. Covers politics, crime, and business. Parent company\u2019s chairman Iqbal Survé has been accused of using the outlet to advance political and business interests.',
  },
  LatestLY: {
    type: 'Digital media',
    location: 'Mumbai, India',
    description:
      'Indian digital news aggregator operated by LatestLY Media. Covers trending news, entertainment, and sports across India.',
  },
  'Markets Insider': {
    type: 'Financial data',
    location: 'New York, US',
    description:
      'Financial markets section of Business Insider, providing real-time stock quotes, market data, and analysis. Owned by Axel Springer.',
  },
  'Global Banking & Finance Review': {
    type: 'Digital media',
    location: 'London, UK',
    description:
      'Online publication covering banking, finance, and financial technology news globally.',
  },
  Autocar: {
    type: 'Magazine',
    location: 'London, UK',
    description:
      'British automotive magazine founded in 1895, the world\u2019s oldest car publication. Covers vehicle reviews, industry news, and the transition to electric vehicles. Owned by Haymarket Media Group.',
  },
  'Azeri - Press Informasiya Agentliyi': {
    type: 'News agency',
    location: 'Baku, Azerbaijan',
    description:
      'Azerbaijan\u2019s state news agency, commonly known as APA. Reflects Azerbaijani government positions on the Nagorno-Karabakh conflict, energy policy, and regional affairs.',
  },
  'Al-Ahram': {
    type: 'Newspaper',
    location: 'Cairo, Egypt',
    description:
      'Egypt\u2019s oldest and most widely circulated newspaper, founded in 1875. State-owned. Editorial line reflects Egyptian government positions. Coverage of Gaza and Palestinian affairs aligns with Cairo\u2019s political stance.',
  },
  'Yahoo! Finance': {
    type: 'Financial data',
    location: 'Sunnyvale, US',
    description:
      'Financial news and data platform under Yahoo. Provides market data, stock quotes, and business news. One of the most-visited financial sites globally.',
  },
};

// Manual aliases for names that can't be derived by normalization (non-Latin script, completely different names)
const ALIASES: Record<string, string> = {
  'Anadolu Ajansı': 'Anadolu Agency',
  'Українська правда': 'Ukrainska Pravda',
  'جريدة الأهرام': 'Al-Ahram',
  'Premium Times Nigeria': 'Premium Times',
  Bloomberg: 'Bloomberg Business',
};

// Fuzzy lookup: case-insensitive, strips "The " prefix, trailing noise words,
// and normalizes hyphens to spaces — so "The New York Times" finds "New York Times",
// "Al-Monitor" finds "Al Monitor", "Drop Site News" finds "Drop Site", etc.
const NOISE_SUFFIXES = /\s+(Online|English|News|News Agency|Agency)$/i;

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(NOISE_SUFFIXES, '')
    .replace(/-/g, ' ')
    .trim();
}

const _exact = new Map<string, SourceInfo>(); // lowercased exact keys
const _fuzzy = new Map<string, SourceInfo>(); // normalized keys

for (const [key, val] of Object.entries(_SOURCES)) {
  _exact.set(key.toLowerCase(), val);
  _fuzzy.set(normalize(key), val);
}
for (const [alias, canonical] of Object.entries(ALIASES)) {
  const target = _exact.get(canonical.toLowerCase());
  if (target) {
    _exact.set(alias.toLowerCase(), target);
    _fuzzy.set(normalize(alias), target);
  }
}

export const SOURCES: Record<string, SourceInfo> = new Proxy(_SOURCES, {
  // prop can be a symbol (dev-tools inspection), and bare `target[prop]` would
  // surface inherited Object.prototype members for keys like 'constructor' —
  // guard both so misses always fall through to undefined.
  get(target, prop) {
    if (typeof prop !== 'string') return undefined;
    const own = Object.hasOwn(target, prop) ? target[prop] : undefined;
    return own ?? _exact.get(prop.toLowerCase()) ?? _fuzzy.get(normalize(prop));
  },
});
