/**
 * `work`, then `after` however it ended, as `try…finally` would.
 *
 * A function of its own because of where it is called from. React Compiler
 * does not lower a `try` that has a `finally`, and skips the whole component
 * that holds one, in silence: its handlers were then new on every render and
 * nothing in it was cached.
 */
export async function afterwards<T>(work: () => Promise<T>, after: () => void): Promise<T> {
  try {
    return await work();
  } finally {
    after();
  }
}
