import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSignedIn } from '@/test/harness';
import { resetWriteFailure } from '@/data/write-status';

vi.mock('@/data/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/client')>();
  const { fakeClient } = await import('@/test/client-mock');
  return {
    ...actual,
    isConfigured: true,
    get supabase() {
      return fakeClient();
    },
    requireClient: () => fakeClient(),
  };
});

const { TwoClocks } = await import('./TwoClocks');

/**
 * Two clocks.
 *
 * The daily question in a relationship spread across a hemisphere is not
 * "how far away are they" — it is "can I call right now". Everything here
 * exists to answer that in one glance, which means the two failures that
 * matter are showing a window in only one person's clock (useless to the
 * other) and appearing at all when there is nothing to compare.
 *
 * Time is frozen so these are about the arithmetic, never about the hour it
 * happens to be when the suite runs.
 */

/** 2026-08-12, 09:00 UTC — a Wednesday morning in Europe, afternoon in Asia. */
const FROZEN = new Date('2026-08-12T09:00:00.000Z');

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN);
});

afterEach(() => {
  vi.useRealTimers();
});

function mount(options: Parameters<typeof mountSignedIn>[1] = {}) {
  return mountSignedIn(<TwoClocks />, { ...options, seed: () => {} });
}

describe('when it says nothing at all', () => {
  it('is invisible before the second person joins', async () => {
    const { view } = mount({ partner: null });
    await Promise.resolve();
    expect(view.container).toBeEmptyDOMElement();
  });

  /**
   * Same city, same clock. Two identical numbers side by side is not
   * information, it is furniture.
   */
  it('is invisible when both of them are in the same zone', async () => {
    const { view } = mount({
      profile: { time_zone: 'Europe/Lisbon' },
      partner: { time_zone: 'Europe/Lisbon' },
    });
    await Promise.resolve();
    expect(view.container).toBeEmptyDOMElement();
  });
});

describe('the two clocks', () => {
  it('shows each of their local times, and how far apart they are', async () => {
    mount({
      profile: { time_zone: 'Europe/Lisbon', display_name: 'Léo' },
      partner: { time_zone: 'Asia/Shanghai', display_name: 'Yan' },
    });

    await screen.findByText('Two clocks');
    // 09:00 UTC is 10:00 in Lisbon and 17:00 in Shanghai.
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('17:00')).toBeInTheDocument();
    expect(screen.getByText('7 hours apart')).toBeInTheDocument();
  });

  it('says when their day is a different day from yours', async () => {
    // 23:00 UTC is 16:00 in Los Angeles and 11:00 the next morning in
    // Auckland — the case where the hour alone would be actively misleading.
    vi.setSystemTime(new Date('2026-08-12T23:00:00.000Z'));
    mount({
      profile: { time_zone: 'America/Los_Angeles' },
      partner: { time_zone: 'Pacific/Auckland' },
    });

    await screen.findByText('Two clocks');
    expect(screen.getByText('16:00')).toBeInTheDocument();
    expect(screen.getByText('11:00')).toBeInTheDocument();
    expect(screen.getByText('· tomorrow')).toBeInTheDocument();
  });
});

describe('when you can actually talk', () => {
  /**
   * The point of the whole component: a window stated in one person's clock
   * is useless to the other, so both are always given.
   */
  it('gives every window in both clocks, named', async () => {
    mount({
      profile: { time_zone: 'Europe/Lisbon', awake_start: 8, awake_end: 23 },
      partner: { time_zone: 'Asia/Shanghai', awake_start: 8, awake_end: 23, display_name: 'Yan' },
    });

    await screen.findByText('Two clocks');
    // Shanghai is +7 on Lisbon, so both are up from 08:00–16:00 Lisbon time,
    // which is 15:00–23:00 for her.
    expect(screen.getByText(/08:00–16:00 for you — 15:00–23:00 for Yan/)).toBeInTheDocument();
    expect(screen.getByText(/hours a day you’re both up/)).toBeInTheDocument();
  });

  /**
   * The unhappy case has to be handled kindly rather than left blank: two
   * people whose hours do not meet need the fix, not the bad news.
   */
  it('says so, and suggests the fix, when the hours do not meet', async () => {
    mount({
      profile: { time_zone: 'Europe/Lisbon', awake_start: 8, awake_end: 12 },
      partner: { time_zone: 'Asia/Shanghai', awake_start: 22, awake_end: 23 },
    });

    await screen.findByText('Two clocks');
    expect(screen.getByText(/don’t currently overlap at all/)).toBeInTheDocument();
    expect(screen.getByText(/Widening one of them in Settings/)).toBeInTheDocument();
  });
});
