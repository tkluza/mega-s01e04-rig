import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/reader.js';

const dirs: string[] = [];
function appFor(contents: string) {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-json-'));
  dirs.push(runsDir);
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), contents);
  return {
    runsDir,
    app: createApp({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir }),
  };
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('digest JSON endpoint', () => {
  it('returns the reader contract and the same ordered jobs as HTML, including bad-line metadata', async () => {
    const { app, runsDir } = appFor([
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'zeta', status: 'fail', owner: null, error: 'failed' }),
      'broken',
      JSON.stringify({ at: '2026-10-28T23:01:00+01:00', job: 'alpha', status: 'retry', owner: 'rook' }),
    ].join('\n'));
    const response = await app.request('/api/digest/2026-10-28');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const digest = await response.json();
    expect(digest).toEqual(readNight(runsDir, '2026-10-28'));
    expect(digest.badLines).toBe(1);
    expect(digest.counts).toEqual({ ok: 0, retry: 1, fail: 1 });
    const page = await app.request('/digest/2026-10-28');
    expect(page.status).toBe(200);
    const jobs = [...(await page.text()).matchAll(/<th scope="row">([^<]+)<\/th>/g)].map((match) => match[1]);
    expect(jobs).toEqual(['alpha', 'zeta']);
    expect(digest.rows.map((row: { job: string }) => row.job)).toEqual(jobs);
  });

  it('returns an empty digest for an existing empty night', async () => {
    const { app } = appFor('');
    const response = await app.request('/api/digest/2026-10-28');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      night: '2026-10-28', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns 404 for a missing night', async () => {
    const { app } = appFor('');
    expect((await app.request('/api/digest/2026-10-27')).status).toBe(404);
  });
});
