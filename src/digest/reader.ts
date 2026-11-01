import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, RunStatus } from './types.js';

type Run = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

function isRun(value: unknown): value is Run {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.at === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row.at) &&
    Number.isFinite(Date.parse(row.at)) &&
    typeof row.job === 'string' && row.job.length > 0 &&
    (row.status === 'ok' || row.status === 'retry' || row.status === 'fail') &&
    (row.owner === null || typeof row.owner === 'string') &&
    (row.error === undefined || typeof row.error === 'string');
}

export function readNight(runsDir: string, night: string): NightDigest | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  const date = new Date(`${night}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== night) return null;
  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  const digest: NightDigest = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const jobs = new Map<string, DigestRow>();
  const errorsAt = new Map<string, number>();
  const lines = content.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    let value: unknown;
    try { value = JSON.parse(line); } catch { digest.badLines++; continue; }
    if (!isRun(value)) { digest.badLines++; continue; }
    digest.counts[value.status]++;
    const at = Date.parse(value.at);
    let row = jobs.get(value.job);
    if (!row) {
      row = { job: value.job, owner: value.owner, runs: 0, retries: 0,
        lastStatus: value.status, lastError: null, firstAt: value.at, lastAt: value.at };
      jobs.set(value.job, row);
    }
    row.runs++;
    if (value.status === 'retry') row.retries++;
    if (at < Date.parse(row.firstAt)) row.firstAt = value.at;
    if (at >= Date.parse(row.lastAt)) {
      row.lastAt = value.at;
      row.lastStatus = value.status;
      row.owner = value.owner;
    }
    // Recovery changes status, but the last observed error still explains the retries.
    if (value.error !== undefined && at >= (errorsAt.get(value.job) ?? -Infinity)) {
      row.lastError = value.error;
      errorsAt.set(value.job, at);
    }
  }
  digest.rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
}
