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
      'English-language newspaper founded in 1896. Covers Malaysian politics, courts, and national affairs. Malaysia does not recognize Israel and is one of the most vocal supporters of Palestine among ASEAN states.',
  },
  'Antara News': {
    type: 'News agency',
    location: 'Jakarta, Indonesia',
    description:
      'Indonesia\u2019s state-owned national news agency, established in 1937. Covers domestic politics and ASEAN affairs. Indonesia does not recognize Israel and has been a consistent supporter of Palestinian statehood.',
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
      'South African online newspaper. Its Scorpio unit has broken major stories on state capture and corruption. South Africa brought the ICJ genocide case against Israel in 2024; the country\u2019s media landscape is broadly sympathetic to the Palestinian cause.',
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
      'T\u00fcrkiye\u2019s state-run news agency. Publishes in 13 languages with extensive coverage of the Muslim world and Central Asia. T\u00fcrkiye severed all diplomatic relations with Israel; Anadolu\u2019s coverage reflects this, and its photographs and videos are widely syndicated by international outlets.',
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
      'Russian government-funded international television network. Designated a foreign agent in the US and banned in the EU. Russia has positioned itself as sympathetic to the Palestinian cause at the UN, though this is primarily geopolitical rivalry with the US rather than principled support.',
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
      'Russia\u2019s largest news agency, state-owned since 1904. Primary wire service for Russian government communications. Reflects Kremlin foreign policy, including rhetorical support for Palestinian statehood and criticism of US-backed Israeli operations.',
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
      'China\u2019s official state news agency. Largest news agency in the world by correspondents and bureaus. Reflects Chinese government positions. China has consistently supported Palestinian statehood at the UN while maintaining quiet trade and tech ties with Israel. China leverages its pro-Palestinian stance to deflect Western criticism of its treatment of Uyghur Muslims, whose coverage is entirely state-controlled.',
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

  // --- Name variants (same outlets, different feed names) ---
  'Al Jazeera Online': {
    type: 'Public broadcaster',
    location: 'Doha, Qatar',
    description:
      'English-language news network funded by the Qatari government. Extensive coverage of the Middle East, Africa, and the Global South. One of the few major international broadcasters with sustained Palestinian perspective. Israel banned Al Jazeera from operating in 2024; at least ten staff journalists and nine freelancers have been killed by Israeli strikes in Gaza. Coverage of Qatari domestic affairs is noticeably limited.',
  },
  'Al-Monitor': {
    type: 'Digital media',
    location: 'Washington, DC',
    description:
      'Covers the Middle East and North Africa with reporting from journalists based in the region. Funded by subscriptions and corporate sponsors. Founded by Jamal Daniel, a Syrian-American businessman.',
  },
  'Anadolu Ajansı': {
    type: 'News agency',
    location: 'Ankara, T\u00fcrkiye',
    description:
      'T\u00fcrkiye\u2019s state-run news agency. Publishes in 13 languages with extensive coverage of the Muslim world and Central Asia. T\u00fcrkiye severed all diplomatic relations with Israel; Anadolu\u2019s coverage reflects this, and its photographs and videos are widely syndicated by international outlets.',
  },
  'Drop Site News': {
    type: 'Investigative',
    location: 'United States',
    description:
      'Independent investigative outlet founded by journalists Jeremy Scahill and Ryan Grim. Covers national security, foreign policy, and government accountability. Has published detailed reporting on US arms transfers to Israel and their use in Gaza.',
  },
  STAT: {
    type: 'Digital media',
    location: 'Boston, US',
    description:
      'Health and medicine publication owned by Boston Globe Media. Covers pharma, biotech, and public health policy.',
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
      'English-language international channel of Turkish Radio and Television Corporation. State-funded. Covers the Muslim world, Africa, and conflict zones. Reflects Turkish government positions; openly critical of Israeli operations in Gaza and of Western inaction.',
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
      'English-language broadsheet owned by the Abu Dhabi state investment fund. Covers Gulf affairs, business, and regional politics. Editorial line reflects UAE foreign policy, including the Abraham Accords normalization with Israel.',
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
  'Euronews English': {
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
};

// Case-insensitive lookup — feed names may vary in capitalization
const _lookup = new Map<string, SourceInfo>();
for (const [key, val] of Object.entries(_SOURCES)) {
  _lookup.set(key.toLowerCase(), val);
}

export const SOURCES: Record<string, SourceInfo> = new Proxy(_SOURCES, {
  get(target, prop: string) {
    return target[prop] ?? _lookup.get(prop.toLowerCase());
  },
});
