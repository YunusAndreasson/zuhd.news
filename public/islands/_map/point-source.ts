// The features in the timeline and feed layers are 2D points with scalar properties.
import type { Feature, FeatureCollection, Point } from 'geojson'
import type { GeoJSONFeatureDiff, GeoJSONSource } from 'maplibre-gl'

type Properties = Record<string, string | number>
type MapPoint = Feature<Point, Properties>
type FeatureId = string | number

/** Each source starts empty. A recreated map/source gets its own baseline. */
export function pointSourceWriter() {
  const previous = new WeakMap<GeoJSONSource, Map<FeatureId, MapPoint> | null>()
  return (source: GeoJSONSource | undefined, collection: FeatureCollection<Point, Properties>) => {
    if (!source) return
    const last = previous.get(source)
    const next = new Map<FeatureId, MapPoint>()
    const add: MapPoint[] = []
    const update: GeoJSONFeatureDiff[] = []
    const remove: FeatureId[] = []
    for (const feature of collection.features) {
      const id = feature.id
      // Preserve all marks if a publisher supplies ambiguous ids. A complete
      // replacement is needed again when unique ids return to this source.
      if (id == null || next.has(id)) {
        previous.set(source, null)
        void source.setData(collection)
        return
      }
      next.set(id, feature)
      const old = last?.get(id)
      if (!old) {
        add.push(feature)
        continue
      }
      const change: GeoJSONFeatureDiff = { id }
      const [x, y] = feature.geometry.coordinates
      if (old.geometry.coordinates[0] !== x || old.geometry.coordinates[1] !== y) {
        change.newGeometry = feature.geometry
      }
      for (const key in feature.properties) {
        const value = feature.properties[key]
        if (value !== old.properties[key]) {
          change.addOrUpdateProperties ??= []
          change.addOrUpdateProperties.push({ key, value })
        }
      }
      for (const key in old.properties) {
        if (!(key in feature.properties)) {
          change.removeProperties ??= []
          change.removeProperties.push(key)
        }
      }
      if (change.newGeometry || change.addOrUpdateProperties || change.removeProperties) {
        update.push(change)
      }
    }
    if (last) {
      for (const id of last.keys()) {
        if (!next.has(id)) remove.push(id)
      }
    }
    previous.set(source, next)
    if (last === null) void source.setData(collection)
    else if (add.length || update.length || remove.length) void source.updateData({ add, update, remove })
  }
}
