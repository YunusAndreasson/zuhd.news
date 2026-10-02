// The repository root, for the scripts run by name from `run-cycle.sh`.
//
// Forty copies of `new URL('..', import.meta.url).pathname`, three spelled
// differently. That form returns the URL's *encoded* path — a checkout under
// `/home/me/my repo` yields `/home/me/my%20repo/`, and every `join(ROOT, …)`
// built on it names a directory that does not exist. `fileURLToPath` decodes.

import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../..', import.meta.url))
