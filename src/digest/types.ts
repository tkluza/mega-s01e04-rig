export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  night: string;
  // One row per job, sorted by job; timestamps retain their original offsets.
  rows: DigestRow[];
  badLines: number;
  counts: Record<RunStatus, number>;
};

// null means no file; an existing empty file has empty rows and zero counts.
// counts totals valid log entries by status, not aggregated jobs.
export declare function readNight(runsDir: string, night: string): NightDigest | null;
