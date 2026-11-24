import type { RegistrationReason, RegistrationStatus } from '../constants/analytics';
import { createListeners } from './store-plumbing';
import { DAY_MS } from './time';

export const REFRESH_AFTER = 80 * DAY_MS;
export interface PublisherDelivery {
  briefing: boolean;
  breaking: boolean;
}
export const noDelivery: PublisherDelivery = { briefing: false, breaking: false };
export const publisherChanges = createListeners();
let state = {
  status: 'removed' as RegistrationStatus,
  reason: 'refresh' as RegistrationReason,
  delivery: noDelivery,
  deliveryChecked: false,
  acceptedAt: 0,
};

export function publisherSnapshot() {
  return state;
}
export function setRegistration(
  status: RegistrationStatus,
  reason: RegistrationReason,
  acceptedAt = 0,
) {
  if (state.status === status && state.acceptedAt === acceptedAt) return;
  state = { ...state, status, reason, acceptedAt };
  publisherChanges.emit();
}
export function setDelivery(delivery: PublisherDelivery) {
  if (
    state.deliveryChecked &&
    state.delivery.briefing === delivery.briefing &&
    state.delivery.breaking === delivery.breaking
  )
    return;
  state = { ...state, delivery, deliveryChecked: true };
  publisherChanges.emit();
}
export function publisherEnabled(
  consent: boolean,
  snapshot: Pick<typeof state, 'status' | 'acceptedAt' | 'delivery'> = state,
  now = Date.now(),
): boolean {
  return (
    consent &&
    snapshot.status === 'accepted' &&
    snapshot.acceptedAt <= now &&
    snapshot.acceptedAt > now - 90 * DAY_MS &&
    (snapshot.delivery.briefing || snapshot.delivery.breaking)
  );
}
