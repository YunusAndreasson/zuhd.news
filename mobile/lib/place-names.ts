/**
 * Re-export of the shared place-name display layer.
 *
 * The rules moved to `shared/place-names.ts` so the web map applies exactly the
 * same ones — a country label reading "W. Sahara" on the site and "Western
 * Sahara" in the app is the kind of drift a single source of truth exists to
 * prevent. This file stays so the app's existing import paths keep working.
 */
export {
  displayCountryName,
  displayLocation,
  wrapCountryLabel,
} from '@shared/place-names';
