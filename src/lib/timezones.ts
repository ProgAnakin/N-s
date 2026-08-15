/**
 * Two clocks.
 *
 * The single most constant friction in a relationship spread across eleven
 * time zones is not distance — it is arithmetic. "Is she awake? Is this a
 * terrible hour to call? If I ring after dinner, what is that for her?" It
 * gets computed wrong, or not at all, several times a day, and the cost of
 * getting it wrong is waking someone at 4am or letting a day pass without
 * talking because the window was missed.
 *
 * So this module answers three questions: what time is it there, are they
 * probably awake, and when are you both awake at once.
 *
 * Offsets are passed in as minutes rather than read from a timezone
 * database, which keeps the whole module pure and testable and means a
 * Flutter port carries none of this logic across the wire.
 */

/** Hours are local and may wrap past midnight: `{ start: 8, end: 23 }`. */
export interface AwakeWindow {
  start: number;
  end: number;
}

export const DEFAULT_AWAKE: AwakeWindow = { start: 8, end: 23 };

const MINUTES_PER_DAY = 24 * 60;

function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/**
 * Whether a local hour falls inside a waking window.
 *
 * A window that ends before it starts has wrapped past midnight — someone
 * who is up from 22:00 to 06:00 is a real person, not bad input.
 */
export function isAwakeAt(localHour: number, window: AwakeWindow = DEFAULT_AWAKE): boolean {
  const hour = wrapHour(localHour);
  const start = wrapHour(window.start);
  const end = wrapHour(window.end);
  if (start === end) return true;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export interface LocalClock {
  hour: number;
  minute: number;
  /** How many days ahead (+1) or behind (−1) their calendar date is. */
  dayOffset: number;
}

/** The wall clock at a given UTC offset, from a UTC instant. */
export function clockAt(utcMinutesOfDay: number, offsetMinutes: number): LocalClock {
  const raw = utcMinutesOfDay + offsetMinutes;
  const dayOffset = Math.floor(raw / MINUTES_PER_DAY);
  const local = raw - dayOffset * MINUTES_PER_DAY;
  return { hour: Math.floor(local / 60), minute: local % 60, dayOffset };
}

export interface CallWindow {
  /** Start and end in each person's own local hours, end exclusive. */
  yourStart: number;
  yourEnd: number;
  theirStart: number;
  theirEnd: number;
  hours: number;
}

/**
 * The stretches when both of you are awake.
 *
 * Walked hour by hour through a UTC day and reported in *both* local clocks,
 * because "we can talk between 8 and 11" means two completely different
 * things to the two people reading it, and that ambiguity is exactly what
 * causes the missed call.
 *
 * Returns an empty list when the windows genuinely never meet — which is a
 * real answer worth showing plainly rather than papering over.
 */
export function callWindows(input: {
  yourOffsetMinutes: number;
  theirOffsetMinutes: number;
  yourAwake?: AwakeWindow;
  theirAwake?: AwakeWindow;
}): CallWindow[] {
  const {
    yourOffsetMinutes,
    theirOffsetMinutes,
    yourAwake = DEFAULT_AWAKE,
    theirAwake = DEFAULT_AWAKE,
  } = input;

  const shared: boolean[] = [];
  for (let utcHour = 0; utcHour < 24; utcHour += 1) {
    const yours = clockAt(utcHour * 60, yourOffsetMinutes);
    const theirs = clockAt(utcHour * 60, theirOffsetMinutes);
    shared.push(isAwakeAt(yours.hour, yourAwake) && isAwakeAt(theirs.hour, theirAwake));
  }

  if (shared.every(Boolean)) {
    // Awake around the clock together: one window, not twenty-four.
    const start = clockAt(0, yourOffsetMinutes);
    const theirStart = clockAt(0, theirOffsetMinutes);
    return [
      {
        yourStart: start.hour,
        yourEnd: start.hour,
        theirStart: theirStart.hour,
        theirEnd: theirStart.hour,
        hours: 24,
      },
    ];
  }

  const windows: CallWindow[] = [];
  // Start from the first UTC hour that is not shared, so a run crossing
  // midnight UTC is reported once rather than split in two.
  const firstGap = shared.indexOf(false);
  if (firstGap === -1) return windows;

  let runStart: number | null = null;
  for (let step = 0; step <= 24; step += 1) {
    const utcHour = (firstGap + step) % 24;
    const active = step < 24 && shared[utcHour];

    if (active && runStart === null) runStart = utcHour;

    if (!active && runStart !== null) {
      const yourFrom = clockAt(runStart * 60, yourOffsetMinutes);
      const theirFrom = clockAt(runStart * 60, theirOffsetMinutes);
      const yourTo = clockAt(utcHour * 60, yourOffsetMinutes);
      const theirTo = clockAt(utcHour * 60, theirOffsetMinutes);
      windows.push({
        yourStart: yourFrom.hour,
        yourEnd: yourTo.hour,
        theirStart: theirFrom.hour,
        theirEnd: theirTo.hour,
        hours: (utcHour - runStart + 24) % 24,
      });
      runStart = null;
    }
  }

  return windows;
}

/** Total hours a day the two of you are both up. */
export function overlapHours(windows: readonly CallWindow[]): number {
  return windows.reduce((total, window) => total + window.hours, 0);
}

export function formatHour(hour: number, minute = 0): string {
  return `${String(wrapHour(hour)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * The one impure edge: asking the platform for an offset
 * ------------------------------------------------------------------ */

/**
 * Minutes east of UTC for an IANA zone at a given instant.
 *
 * Derived from `Intl` rather than a shipped timezone table, so daylight
 * saving is always current — Brazil abolished it in 2019, China has not
 * observed it since 1991, but the couple travels and the app should not be
 * the thing that is wrong about it.
 */
export function zoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);

    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
    const asUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour') % 24,
      read('minute'),
      read('second'),
    );
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** The zone the device is in, for a sensible default. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function utcMinutesOfDay(at: Date = new Date()): number {
  return at.getUTCHours() * 60 + at.getUTCMinutes();
}
