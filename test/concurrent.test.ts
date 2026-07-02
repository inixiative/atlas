import { describe, expect, test } from 'bun:test';
import { mapLimit } from '../src/fs/concurrent.ts';

describe('mapLimit', () => {
  test('preserves input order in the results', async () => {
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  test('never runs more than `limit` tasks concurrently', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async (n) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
        return n;
      },
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // actually parallel, not serial
  });

  test('handles an empty list', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
  });
});
