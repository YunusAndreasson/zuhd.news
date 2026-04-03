/** Module-scoped slug from a tapped push notification, consumed by index.tsx */
let pendingSlug: string | null = null;

export const get = () => pendingSlug;
export const set = (slug: string) => { pendingSlug = slug; };
export const clear = () => { pendingSlug = null; };
