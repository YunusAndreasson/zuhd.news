/** Module-scoped slug from a tapped push notification, consumed by index.tsx */
let pendingSlug: string | null = null;

export const get = (): string | null => pendingSlug;
export const set = (slug: string): void => {
  pendingSlug = slug;
};
export const clear = (): void => {
  pendingSlug = null;
};
