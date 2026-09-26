import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZUHD_MARK_BOX, ZUHD_MARK_PATHS } from '../lib/zuhd-mark';

describe('the zuhd mark', () => {
  // The menu draws the mark from a copy of the site's paths; a copy is only
  // free while it agrees with the original.
  it('is the site’s logo, path for path, on the same box', () => {
    const svg = readFileSync(join(__dirname, '../../public/logo.svg'), 'utf8');
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    expect(paths).toEqual([...ZUHD_MARK_PATHS]);
    expect(svg).toContain(`viewBox="0 0 ${ZUHD_MARK_BOX} ${ZUHD_MARK_BOX}"`);
  });
});
