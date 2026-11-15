No accounts. The website has no cookies, no analytics and no third-party scripts. The app has no ads. It sends usage statistics and crash reports, and has one optional measure of our own advertising, on Android only.

zuhd.news does not collect personal data on the website. In the mobile app it holds the push token, and only if you turn on notifications. The app also sends usage statistics to Mixpanel and crash reports to Sentry, as described below. If you agree to ad measurement on Android, Meta receives the data described below.

## Website

Your browser remembers which articles you have read. That data stays on your device. Fonts are self-hosted. Nothing loads from outside.

## Mobile app

The app fetches articles from zuhd-news.pages.dev over HTTPS. Those requests carry no identifier and no usage data. Read history and preferences are stored on your device and never leave it.

### Usage statistics

The app sends usage events to Mixpanel to show how the app is used: which screen is opened and a few actions, such as starting a briefing, opening the share sheet and answering the notification question. The events do not include which story you read.

The events are linked to a random ID created on your device. The app does not send your name, email or an account. Mixpanel derives an approximate location (city, region, country) from your IP address. The app does not send your device's location. Mixpanel stores the data in the EU.

There is no setting to turn this off. Erasing local data, under settings, then privacy, replaces the random ID with a new one.

### Crash reports

When the app crashes or hits an error, it sends a report to Sentry. A report contains the error and where in the code it happened, the device model, the operating system and the app version. Sentry also records app sessions and the timing of a sample of app starts. Reports are linked to a random ID that Sentry creates for this install. They contain no screenshots and no web addresses, so they do not show which story you were reading. Sentry stores the data in the US. There is no setting to turn this off.

### Updates

When it opens, the app asks Expo, the service that delivers its updates, whether one is available. That request sends the app's version and a random number for this install. It says nothing about what you read.

### Notifications

If you turn on notifications, the app gets a push token from Expo, the service that delivers them, and sends it to zuhd.news. The token identifies your installation of the app, not you. It is stored for up to 90 days after the app last registered it, passed to Expo when a notification goes out, and used for nothing else. Turning notifications off deletes it.

### Ad measurement (Android only)

We advertise the app on Facebook and Instagram. A new reader on Android is asked once whether to allow ad measurement. If you say yes, the app runs Meta's SDK, which tells Meta the app was installed and opened and sends your phone's advertising ID and basic device details, so we can see which ads bring readers. Meta and zuhd.news are joint controllers of that collection, and Meta may combine it with what it already holds about you, under [its own policy](https://www.facebook.com/privacy/policy).

The app sends Meta nothing about what you read, and no name, email or account. Say no, or dismiss the question, and none of this runs. You can change your answer at any time in the app under settings, then privacy. Your phone's own settings can also reset or delete its advertising ID. Meta holds no name or account from us, so to delete what Meta holds, use the tools in your Facebook account or write to Meta.

The iPhone app does not contain this SDK.

Apart from Meta's SDK, the app uses no advertising framework.

## Who else handles data

- Expo: update checks and push notifications.
- Mixpanel: usage statistics, stored in the EU.
- Sentry: crash reports, stored in the US.
- Meta: ad measurement, on Android only and only if you agree.
- Google: generates the audio briefings from the text. It receives no user data.

We do not sell data. Mixpanel and Sentry data is not used for advertising or shared with advertisers.

## Audio briefings

Audio briefings are generated using Google's text-to-speech and hosted on zuhd.news. The app downloads them directly. No user data is shared with Google or any other party.

## Contact

Questions about this policy: [contact@zuhd.news](mailto:contact@zuhd.news)
