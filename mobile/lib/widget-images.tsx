import { Asset } from 'expo-asset';
import { Directory, File } from 'expo-file-system';
import { widgetsDirectory } from 'expo-widgets';
import { Circle, Group, Path } from 'react-native-skia';
import { bakeSprite } from '../components/globe/sprite-bake';
import { sparkPoints } from './cards/spark';
import type { Edition, WidgetFace } from './daily-widget';

function publish(file: File, bytes: Uint8Array) {
  if (file.exists) return;
  const part = new File(file.parentDirectory, file.name + '.part');
  part.writeSync(bytes);
  part.moveSync(file, { overwrite: true });
}
export async function widgetImages(edition: Edition): Promise<Partial<WidgetFace>> {
  if (!widgetsDirectory) return {};
  const dir = new Directory(widgetsDirectory);
  dir.create({ idempotent: true, intermediates: true });
  const cover = new File(dir, 'briefing-orbit-v1.jpg');
  if (!cover.exists) {
    const asset = await Asset.fromModule(
      require('../assets/widget/briefing-cover.jpg'),
    ).downloadAsync();
    if (asset.localUri) publish(cover, await new File(asset.localUri).bytes());
  }
  const assets: Partial<WidgetFace> = cover.exists ? { cover: cover.uri } : {};
  const c = edition.close,
    obs = c?.observations;
  if (!c || !obs?.length) return assets;
  const first = obs[0]!.value;
  const points = sparkPoints(
    {
      days: obs.map((p) => Date.parse(p.date) / 86400000),
      values: obs.map((p) => (p.value / first - 1) * 100),
    },
    279,
    126,
    7,
  );
  const down = c.value < first;
  for (const [key, color] of [
    ['chartLight', down ? '#963c43' : '#35684a'],
    ['chartDark', down ? '#e8a2aa' : '#9ac6a9'],
    ['chartMono', '#aaaaaa'],
  ] as const) {
    const file = new File(dir, `close-${c.sourceRevision}-${key}.png`);
    if (!file.exists) {
      const last = points.at(-1);
      if (!last) continue;
      const path = points.map((point, i) => `${i ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
      const image = await bakeSprite(
        <Group>
          <Path
            path={path}
            color={color}
            style="stroke"
            strokeWidth={4}
            strokeJoin="round"
            strokeCap="round"
          />
          <Circle cx={last.x} cy={last.y} r={5} color={color} />
        </Group>,
        { width: 279, height: 126 },
      );
      if (!image) continue;
      try {
        publish(file, await image.encodeToBytes());
      } finally {
        image.dispose();
      }
    }
    assets[key] = file.uri;
  }
  // Timeline entries age out after seven days. Keep their files until then.
  for (const file of dir.list())
    if (
      file instanceof File &&
      file.name.startsWith('close-') &&
      !Object.values(assets).includes(file.uri) &&
      file.lastModified &&
      file.lastModified < Date.now() - 8 * 86400000
    )
      file.delete();
  return assets;
}
export function removeWidgetImages() {
  if (!widgetsDirectory) return;
  const dir = new Directory(widgetsDirectory);
  if (dir.exists)
    for (const f of dir.list())
      if (f instanceof File && /^(close-|briefing-orbit-)/.test(f.name)) f.delete();
}
