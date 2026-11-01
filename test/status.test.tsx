import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });

  it('links both fixture nights to rendered digests with valid-entry counts', async () => {
    const app = createApp(config);
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const [night, counts] of [
      ['2026-10-28', 'ok 10 / retry 4 / fail 1'],
      ['2026-10-27', 'ok 7 / retry 0 / fail 0'],
    ]) {
      const href = `/digest/${night}`;
      expect(html).toContain(`<a href="${href}">${night}</a> · ${counts}`);
      const digest = await app.request(href);
      expect(digest.status).toBe(200);
      expect(digest.headers.get('content-type')).toContain('text/html');
      expect(await digest.text()).toContain('rig/rotate-logs');
    }
    expect(html.indexOf('/digest/2026-10-28')).toBeLessThan(html.indexOf('/digest/2026-10-27'));
    expect(html).not.toContain('<script');
  });
});
