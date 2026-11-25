const fs = require('node:fs');
const path = require('node:path');
const { IOSConfig, withXcodeProject, withFinalizedMod } = require('expo/config-plugins');

module.exports = function withBriefingGallery(config) {
  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, 'Resources');
    for (const name of [
      'widget/example-chart.png',
      'widget/briefing-cover.jpg',
      'android-icon-monochrome.png',
    ]) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: '../assets/' + name,
        groupName: 'Resources',
        project,
        isBuildFile: true,
      });
    }
    return mod;
  });
  return withFinalizedMod(config, [
    'android',
    (mod) => {
      const res = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
      const assets = path.join(mod.modRequest.projectRoot, 'assets/widget');
      const dir = path.join(res, 'drawable-nodpi');
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(
        path.join(assets, 'daily_briefing_preview.png'),
        path.join(dir, 'daily_briefing_preview.png'),
      );
      const xml = path.join(res, 'xml/daily_briefing_info.xml');
      const provider = fs.readFileSync(xml, 'utf8');
      if (!provider.includes('android:previewImage')) {
        fs.writeFileSync(
          xml,
          provider.replace(
            'android:initialLayout=',
            'android:previewImage="@drawable/daily_briefing_preview"\n  android:initialLayout=',
          ),
        );
      }
      for (const name of ['briefing_play', 'briefing_check', 'briefing_book']) {
        fs.copyFileSync(
          path.join(assets, name + '.xml'),
          path.join(res, 'drawable', name + '.xml'),
        );
      }
      const raw = path.join(res, 'raw');
      fs.mkdirSync(raw, { recursive: true });
      fs.writeFileSync(
        path.join(raw, 'briefing_keep.xml'),
        '<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="@drawable/briefing_play,@drawable/briefing_check,@drawable/briefing_book" />\n',
      );
      return mod;
    },
  ]);
};
