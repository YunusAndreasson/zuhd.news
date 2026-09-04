import type { VesselField } from '@shared/types';

/**
 * The PortWatch vessel classes, named once.
 *
 * `label` is the table form the chokepoint sheet has always used; `plural` is
 * the prose form a card row needs — "tankers", "container ships". Held in
 * `lib/` rather than in the sheet because a card builder is a pure function
 * and must not import a component to learn what `n_tanker` is called.
 * `n_total` is deliberately absent: it is the reading, not a class of it.
 */
export interface VesselClass {
  field: VesselField;
  label: string;
  plural: string;
}

export const VESSEL_CLASSES: readonly VesselClass[] = [
  { field: 'n_tanker', label: 'Tanker', plural: 'tankers' },
  { field: 'n_container', label: 'Container', plural: 'container ships' },
  { field: 'n_dry_bulk', label: 'Dry bulk', plural: 'dry bulk carriers' },
  { field: 'n_cargo', label: 'Cargo', plural: 'cargo ships' },
  { field: 'n_general_cargo', label: 'General cargo', plural: 'general cargo ships' },
  { field: 'n_roro', label: 'Ro-Ro', plural: 'ro-ro ships' },
];

export function vesselClass(field: VesselField): VesselClass | undefined {
  return VESSEL_CLASSES.find((v) => v.field === field);
}
