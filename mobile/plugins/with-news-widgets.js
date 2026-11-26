const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withFinalizedMod } = require('expo/config-plugins');
const { default: withWidgets } = require('expo-widgets/app.plugin.js');
const paper = require('../constants/paper-colors.json');
const parameters = require('../widgets/news-options.json');

const configurationActivity = 'expo.modules.widgets.NewsWidgetConfigurationActivity';

module.exports = function withNewsWidgets(config, props) {
  config = withWidgets(config, {
    ...props,
    widgets: [
      ...props.widgets,
      {
        name: 'LatestNews',
        displayName: 'Latest news',
        description: 'Read the newest headlines from all sections or from a section you choose.',
        ios: {
          supportedFamilies: ['systemSmall', 'systemMedium', 'systemLarge'],
          contentMarginsDisabled: true,
          initialLayout: './widgets/LatestNews.ios.tsx',
          configuration: { title: 'Latest news', parameters },
        },
        android: {
          minWidth: 112,
          minHeight: 110,
          targetCellWidth: 4,
          targetCellHeight: 2,
          resizeMode: 'both',
          initialLayout: './widgets/LatestNews.android.tsx',
        },
      },
    ],
  });
  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.activity ??= [];
    if (!application.activity.some((activity) => activity.$['android:name'] === configurationActivity)) {
      application.activity.push({
        $: {
          'android:name': configurationActivity,
          'android:exported': 'true',
          'android:label': '@string/latest_news_display_name',
          'android:theme': '@style/ZuhdWidgetEditor',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_CONFIGURE' } }] }],
      });
    }
    return mod;
  });
  return withFinalizedMod(config, [
    'android',
    (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
      const widget = path.join(dir, 'xml/latest_news_info.xml');
      const xml = fs.readFileSync(widget, 'utf8')
        .replace(/\s+android:configure="[^"]+"|\s+android:widgetFeatures="[^"]+"/g, '')
        .replace('android:updatePeriodMillis="0"', 'android:updatePeriodMillis="1800000"');
      fs.writeFileSync(
        widget,
        xml.replace(
          'android:initialLayout=',
          `android:configure="${configurationActivity}"\n  android:widgetFeatures="reconfigurable"\n  android:previewLayout="@layout/zuhd_widget_preview"\n  android:initialLayout=`,
        ),
      );
      const fonts = path.join(dir, 'font');
      const layouts = path.join(dir, 'layout');
      fs.mkdirSync(fonts, { recursive: true });
      fs.mkdirSync(layouts, { recursive: true });
      for (const [weight, file] of [['regular', 'Regular'], ['bold', 'SemiBold']]) {
        fs.copyFileSync(
          path.join(mod.modRequest.projectRoot, `assets/fonts/SourceSans3-${file}.ttf`),
          path.join(fonts, `widget_source_sans_${weight}.ttf`),
        );
        // Launchers inflate RemoteViews in a restricted context and may only
        // load the system font. Set its weight explicitly too.
        const headlineWeight =
          weight === 'bold' ? '\n  android:textStyle="bold"\n  android:textFontWeight="600"' : '';
        fs.writeFileSync(
          path.join(layouts, `zuhd_widget_text_${weight}.xml`),
          `<TextView xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/zuhd_widget_text"
  android:layout_width="match_parent"
  android:layout_height="wrap_content"
  android:fontFamily="@font/widget_source_sans_${weight}"${headlineWeight}
  android:includeFontPadding="false"
  android:gravity="start"
  android:ellipsize="end" />
`,
        );
      }
      fs.copyFileSync(
        path.join(mod.modRequest.projectRoot, 'assets/widget/latest-news-preview.xml'),
        path.join(layouts, 'zuhd_widget_preview.xml'),
      );
      const drawables = path.join(dir, 'drawable-nodpi');
      fs.mkdirSync(drawables, { recursive: true });
      fs.copyFileSync(
        path.join(mod.modRequest.projectRoot, 'assets/android-icon-monochrome.png'),
        path.join(drawables, 'zuhd_widget_mark.png'),
      );
      const values = path.join(dir, 'values');
      fs.writeFileSync(
        path.join(values, 'zuhd_widget_editor.xml'),
        `<resources>
  <style name="ZuhdWidgetEditor" parent="Theme.Material3.DayNight.NoActionBar" />
</resources>
`,
      );
      const raw = path.join(dir, 'raw');
      fs.mkdirSync(raw, { recursive: true });
      fs.writeFileSync(path.join(raw, 'news_widget_options.json'), JSON.stringify({ parameters, paper }));
      fs.writeFileSync(
        path.join(raw, 'news_widget_keep.xml'),
        '<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="@drawable/zuhd_widget_mark,@raw/news_widget_options,@layout/zuhd_widget_text_regular,@layout/zuhd_widget_text_bold" />',
      );
      return mod;
    },
  ]);
};
