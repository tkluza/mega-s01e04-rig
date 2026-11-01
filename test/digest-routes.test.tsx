import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

describe('digest HTML routes', () => {
  let runsDir: string;
  beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-')); });
  afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

  function appFor(contents: string) {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), contents);
    return createApp({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir });
  }

  it('renders valid rows despite a bad line, with placeholders, offsets and warning boundaries', async () => {
    const firstAt = '2026-10-29T01:00:00+02:00';
    const lastAt = '2026-10-29T01:30:00+01:00';
    const app = appFor([
      { at: firstAt, job: 'zeta', status: 'fail', owner: null, error: 'upstream failed' },
      ...Array.from({ length: 3 }, () => ({ at: firstAt, job: 'alpha', status: 'retry', owner: 'rook' })),
      { at: lastAt, job: 'alpha', status: 'ok', owner: 'rook' },
      ...Array.from({ length: 2 }, () => ({ at: firstAt, job: 'beta', status: 'retry', owner: 'rook' })),
      { at: lastAt, job: 'beta', status: 'ok', owner: 'rook' },
    ].map((event) => JSON.stringify(event)).concat('malformed JSON').join('\n'));
    const page = await app.request('/digest/2026-10-28');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const html = await page.text();
    const response = await app.request('/api/digest/2026-10-28');
    expect(response.status).toBe(200);
    const digest: NightDigest = await response.json();
    const rows = [...html.matchAll(/<tr><th scope="row">([^<]+)<\/th>(.*?)<\/tr>/g)];
    expect(rows.map((row) => row[1])).toEqual(['alpha', 'beta', 'zeta']);
    expect(rows.map((row) => row[1])).toEqual(digest.rows.map((row) => row.job));
    expect(html).toContain('<p class="warn">bad lines: 1</p>');
    expect(rows[0][2]).toContain('<td>4</td><td class="warn">3</td><td>ok</td>');
    expect(rows[1][2]).toContain('<td>3</td><td>2</td><td>ok</td>');
    expect(rows[1][2]).not.toContain('class="warn"');
    expect(rows[2][2]).toContain('<td>—</td><td>1</td><td>0</td><td class="warn">fail</td>');
    expect(rows[2][2]).toContain('<td>upstream failed</td>');
    expect(digest.rows[2].owner).toBeNull();
    expect(digest.rows[0]).toMatchObject({ firstAt, lastAt });
    expect(rows[0][2]).toContain(`<td>${firstAt}</td><td>${lastAt}</td>`);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(html).toContain('.warn {');
    expect(html).not.toMatch(/<script\b|<link\b|\bsrc\s*=|@import\b|url\s*\(/i);
  });

  it('renders nothing ran for an existing empty night', async () => {
    const response = await appFor('').request('/digest/2026-10-28');
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('nothing ran');
    expect(html).toContain('bad lines: 0');
    expect(html).not.toContain('<table');
  });

  it('returns 404 for HTML when the night file is absent', async () => {
    const response = await appFor('').request('/digest/2026-10-27');
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('nothing ran');
  });
});
