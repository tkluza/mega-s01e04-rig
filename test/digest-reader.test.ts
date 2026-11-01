import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const dirs: string[] = [];
function nightFile(contents: string) {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  dirs.push(dir);
  writeFileSync(join(dir, '2026-10-28.jsonl'), contents);
  return dir;
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('readNight', () => {
  it('reads the real night without losing null owners or the last error after recovery', () => {
    const digest = readNight('runs', '2026-10-28')!;
    expect(digest.badLines).toBe(1);
    expect(digest.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest.rows[0].owner).toBeNull();
    expect(digest.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('distinguishes an empty file from a missing file', () => {
    const dir = nightFile('');
    expect(readNight(dir, '2026-10-28')).toEqual({
      night: '2026-10-28', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
    expect(readNight(dir, '2026-10-27')).toBeNull();
  });

  it('counts malformed JSON and invalid records while preserving valid records', () => {
    const valid = { at: '2026-10-28T23:00:00+01:00', job: 'ok', status: 'ok', owner: null };
    const dir = nightFile([
      'broken', 'null', '[]', JSON.stringify({ ...valid, status: 'unknown' }),
      JSON.stringify({ ...valid, owner: 1 }), JSON.stringify({ ...valid, at: 'bad' }),
      JSON.stringify({ ...valid, error: 2 }), JSON.stringify(valid), '',
    ].join('\n'));
    const digest = readNight(dir, '2026-10-28')!;
    expect(digest.badLines).toBe(7);
    expect(digest.rows).toHaveLength(1);
    expect(digest.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('uses chronological times and status while retaining original offsets', () => {
    const dir = nightFile([
      { at: '2026-10-29T02:00:00+02:00', job: 'job', status: 'ok', owner: null },
      { at: '2026-10-29T00:30:00+01:00', job: 'job', status: 'fail', owner: 'earlier', error: 'old error' },
    ].map((event) => JSON.stringify(event)).join('\n'));
    expect(readNight(dir, '2026-10-28')!.rows[0]).toEqual({
      job: 'job', owner: null, runs: 2, retries: 0, lastStatus: 'ok', lastError: 'old error',
      firstAt: '2026-10-29T00:30:00+01:00', lastAt: '2026-10-29T02:00:00+02:00',
    });
  });

  it('rejects paths and invalid calendar nights before filesystem access', () => {
    for (const night of ['../secret', '2026-02-30', '2026-13-01', '2026-1-01']) {
      expect(readNight('runs', night)).toBeNull();
    }
  });
});
