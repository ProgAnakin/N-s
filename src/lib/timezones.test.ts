import { describe, expect, it } from 'vitest';
import {
  callWindows,
  clockAt,
  DEFAULT_AWAKE,
  formatHour,
  isAwakeAt,
  overlapHours,
  zoneOffsetMinutes,
} from './timezones';

// The pair this app was built for.
const SAO_PAULO = -3 * 60;
const SHANGHAI = 8 * 60;

describe('isAwakeAt', () => {
  it('covers an ordinary day', () => {
    expect(isAwakeAt(9)).toBe(true);
    expect(isAwakeAt(3)).toBe(false);
  });

  it('excludes the closing hour and includes the opening one', () => {
    expect(isAwakeAt(8, { start: 8, end: 23 })).toBe(true);
    expect(isAwakeAt(23, { start: 8, end: 23 })).toBe(false);
  });

  it('handles a window that wraps past midnight', () => {
    const nightOwl = { start: 22, end: 6 };
    expect(isAwakeAt(23, nightOwl)).toBe(true);
    expect(isAwakeAt(2, nightOwl)).toBe(true);
    expect(isAwakeAt(12, nightOwl)).toBe(false);
  });

  it('treats an empty window as always awake rather than never', () => {
    expect(isAwakeAt(4, { start: 9, end: 9 })).toBe(true);
  });

  it('wraps hours outside 0–23 instead of returning nonsense', () => {
    expect(isAwakeAt(25, { start: 0, end: 3 })).toBe(true);
    expect(isAwakeAt(-1, { start: 22, end: 24 })).toBe(true);
  });
});

describe('clockAt', () => {
  it('reads the wall clock at an offset', () => {
    expect(clockAt(12 * 60, SAO_PAULO)).toEqual({ hour: 9, minute: 0, dayOffset: 0 });
    expect(clockAt(12 * 60, SHANGHAI)).toEqual({ hour: 20, minute: 0, dayOffset: 0 });
  });

  it('reports being on tomorrow’s date', () => {
    // 20:00 UTC is 04:00 the next day in Shanghai.
    expect(clockAt(20 * 60, SHANGHAI)).toEqual({ hour: 4, minute: 0, dayOffset: 1 });
  });

  it('reports being on yesterday’s date', () => {
    // 01:00 UTC is 22:00 the previous day in São Paulo.
    expect(clockAt(60, SAO_PAULO)).toEqual({ hour: 22, minute: 0, dayOffset: -1 });
  });

  it('keeps the minutes', () => {
    expect(clockAt(12 * 60 + 45, SHANGHAI).minute).toBe(45);
  });
});

describe('callWindows', () => {
  it('finds the real overlap between São Paulo and Shanghai', () => {
    const windows = callWindows({
      yourOffsetMinutes: SAO_PAULO,
      theirOffsetMinutes: SHANGHAI,
    });

    // Eleven hours apart on a 08:00–23:00 day leaves *two* windows a day,
    // not one — which is the useful and slightly surprising answer, and the
    // reason this is computed rather than guessed at.
    expect(windows).toHaveLength(2);
    expect(overlapHours(windows)).toBe(6);

    // His morning is her evening: 08:00–12:00 there, 19:00–23:00 here.
    expect(windows[0]).toMatchObject({
      yourStart: 8,
      yourEnd: 12,
      theirStart: 19,
      theirEnd: 23,
      hours: 4,
    });

    // And his late evening catches her first thing.
    expect(windows[1]).toMatchObject({
      yourStart: 21,
      yourEnd: 23,
      theirStart: 8,
      theirEnd: 10,
      hours: 2,
    });
  });

  it('reports each side in its own clock, since that is the whole point', () => {
    const [window] = callWindows({
      yourOffsetMinutes: SAO_PAULO,
      theirOffsetMinutes: SHANGHAI,
    });
    expect(window.yourStart).not.toBe(window.theirStart);
  });

  it('gives a full day when both are in the same zone', () => {
    const windows = callWindows({ yourOffsetMinutes: 0, theirOffsetMinutes: 0 });
    expect(overlapHours(windows)).toBe(15);
  });

  it('returns nothing when the windows genuinely never meet', () => {
    // Twelve hours apart, each awake only in their own morning.
    const windows = callWindows({
      yourOffsetMinutes: 0,
      theirOffsetMinutes: 12 * 60,
      yourAwake: { start: 8, end: 12 },
      theirAwake: { start: 8, end: 12 },
    });
    expect(windows).toEqual([]);
    expect(overlapHours(windows)).toBe(0);
  });

  it('reports a run crossing midnight UTC as one window, not two', () => {
    const windows = callWindows({
      yourOffsetMinutes: 0,
      theirOffsetMinutes: 0,
      yourAwake: { start: 22, end: 4 },
      theirAwake: { start: 22, end: 4 },
    });
    expect(windows).toHaveLength(1);
    expect(windows[0].hours).toBe(6);
  });

  it('collapses a permanent overlap into one window rather than 24', () => {
    const windows = callWindows({
      yourOffsetMinutes: 0,
      theirOffsetMinutes: 0,
      yourAwake: { start: 0, end: 0 },
      theirAwake: { start: 0, end: 0 },
    });
    expect(windows).toHaveLength(1);
    expect(windows[0].hours).toBe(24);
  });

  it('is symmetric in total overlap', () => {
    const forward = callWindows({ yourOffsetMinutes: SAO_PAULO, theirOffsetMinutes: SHANGHAI });
    const back = callWindows({ yourOffsetMinutes: SHANGHAI, theirOffsetMinutes: SAO_PAULO });
    expect(overlapHours(forward)).toBe(overlapHours(back));
  });

  it('respects a night owl on one side widening the window', () => {
    const strict = callWindows({ yourOffsetMinutes: SAO_PAULO, theirOffsetMinutes: SHANGHAI });
    const owl = callWindows({
      yourOffsetMinutes: SAO_PAULO,
      theirOffsetMinutes: SHANGHAI,
      theirAwake: { start: 7, end: 25 },
    });
    expect(overlapHours(owl)).toBeGreaterThan(overlapHours(strict));
  });
});

describe('formatHour', () => {
  it('pads to a wall-clock string', () => {
    expect(formatHour(9)).toBe('09:00');
    expect(formatHour(19, 30)).toBe('19:30');
  });

  it('wraps rather than printing 24 or −1', () => {
    expect(formatHour(24)).toBe('00:00');
    expect(formatHour(-1)).toBe('23:00');
  });
});

describe('zoneOffsetMinutes', () => {
  it('reads real zones', () => {
    const midYear = new Date('2026-07-01T12:00:00Z');
    expect(zoneOffsetMinutes('UTC', midYear)).toBe(0);
    expect(zoneOffsetMinutes('Asia/Shanghai', midYear)).toBe(480);
    // Brazil abolished daylight saving in 2019, so this holds year-round.
    expect(zoneOffsetMinutes('America/Sao_Paulo', midYear)).toBe(-180);
  });

  it('follows daylight saving where it still exists', () => {
    const winter = zoneOffsetMinutes('Europe/Lisbon', new Date('2026-01-15T12:00:00Z'));
    const summer = zoneOffsetMinutes('Europe/Lisbon', new Date('2026-07-15T12:00:00Z'));
    expect(summer - winter).toBe(60);
  });

  it('falls back to UTC on a bad zone instead of throwing', () => {
    expect(zoneOffsetMinutes('Not/AZone')).toBe(0);
  });
});

describe('DEFAULT_AWAKE', () => {
  it('is a plausible waking day', () => {
    expect(DEFAULT_AWAKE.start).toBeLessThan(DEFAULT_AWAKE.end);
    expect(DEFAULT_AWAKE.end - DEFAULT_AWAKE.start).toBeGreaterThanOrEqual(12);
  });
});
