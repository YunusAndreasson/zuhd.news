import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { Directory, File } from 'expo-file-system';
import { widgetsDirectory } from 'expo-widgets';
import { Circle, Fill, Group, Path } from 'react-native-skia';
import { countries } from '../components/globe/shared';
import { bakeSprite } from '../components/globe/sprite-bake';
import { DARK_COLORS as colors } from '../constants/theme';
import type { NewsWidgetProps } from './news-widget';
import { publishWidgetImage, validWidgetImage } from './widget-images';

const SIZE = 256;
const CENTER = SIZE / 2;
const RETENTION = 3 * 86_400_000;
const grid = geoGraticule10();

async function saveMap(directory: Directory, place: readonly [number, number]) {
  const longitude = Math.round(place[0]);
  const latitude = Math.round(place[1]);
  const file = new File(directory, `news-map-v1-${longitude}-${latitude}.png`);
  if (await validWidgetImage(file)) return file.uri;
  const path = geoPath(
    geoOrthographic()
      .rotate([-longitude, -latitude, 0])
      .clipAngle(90)
      .translate([CENTER, CENTER])
      .scale(SIZE * 0.66),
  );
  const land = path(countries);
  const graticule = path(grid);
  if (!land || !graticule) return;
  const image = await bakeSprite(
    <Group>
      <Fill color={colors.bg} />
      <Path path={land} color={colors.atmosphere} />
      <Path path={graticule} style="stroke" strokeWidth={0.75} color={colors.rule} />
      <Circle cx={CENTER} cy={CENTER} r={11} color={colors.bg} />
      <Circle cx={CENTER} cy={CENTER} r={6} color={colors.dome} />
    </Group>,
    { width: SIZE, height: SIZE },
  );
  if (!image) return;
  try {
    publishWidgetImage(file, await image.encodeToBytes());
    return file.uri;
  } finally {
    image.dispose();
  }
}

export async function newsWidgetImages(props: NewsWidgetProps) {
  if (!widgetsDirectory) return props;
  const directory = new Directory(widgetsDirectory);
  directory.create({ idempotent: true, intermediates: true });
  const keep = new Set<string>();
  for (const rows of Object.values(props.stories ?? {})) {
    const lead = rows?.[0];
    if (!lead?.place) continue;
    try {
      lead.image = await saveMap(directory, lead.place);
      if (lead.image) keep.add(lead.image);
    } catch {
      // Stories still work when their illustration can't be drawn or written.
    }
  }
  for (const file of directory.list()) {
    if (
      file instanceof File &&
      file.name.startsWith('news-map-') &&
      !keep.has(file.uri) &&
      file.lastModified &&
      file.lastModified < Date.now() - RETENTION
    )
      file.delete();
  }
  return props;
}
