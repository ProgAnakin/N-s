import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from '@/test/fake-supabase';
import { lastWriteTo, mountSignedIn } from '@/test/harness';

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

const { YoursSection } = await import('./YoursSection');
const { WriteFailureBanner } = await import('./WriteFailureBanner');

/**
 * Every control in this section, driven end to end.
 *
 * These were all written after the section shipped looking perfect and doing
 * nothing: the migration adding its columns had not been run, every write
 * came back rejected, and the app said nothing at all. So each test here
 * asserts two things a rendering test cannot — that the tap produced the
 * right write, and that a refused write is visible rather than silent.
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

function mount(options: Parameters<typeof mountSignedIn>[1] = {}) {
  return mountSignedIn(
    <>
      <YoursSection />
      <WriteFailureBanner />
    </>,
    options,
  );
}

describe('the week start', () => {
  it('writes the chosen day and shows it chosen', async () => {
    const user = userEvent.setup();
    const { db } = mount({ couple: { week_starts_on: 1 } });

    const sunday = await screen.findByRole('button', { name: 'Sunday' });
    expect(sunday).toHaveAttribute('aria-pressed', 'false');

    await user.click(sunday);

    await waitFor(() => {
      expect(lastWriteTo(db, 'couples')?.values).toEqual({ week_starts_on: 0 });
    });
    expect(sunday).toHaveAttribute('aria-pressed', 'true');
    expect(db.rowsOf('couples')[0]?.week_starts_on).toBe(0);
  });
});

describe('the accent', () => {
  it('writes the chosen accent and paints the page with it', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: /Jade/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'couples')?.values).toEqual({ accent: 'jade' });
    });
    expect(db.rowsOf('couples')[0]?.accent).toBe('jade');
  });

  it('offers every accent the database will accept, and no others', async () => {
    mount();
    // The CHECK constraint in 0008 lists exactly these four. A fifth chip
    // would render fine and be refused on tap.
    for (const name of ['Cinnabar', 'Jade', 'Amber', 'Ink']) {
      expect(await screen.findByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });
});

describe('the seal', () => {
  it('saves what was typed when the field is left', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    const field = await screen.findByLabelText(/What’s on the seal/);
    await user.type(field, '我们');
    // Nothing should have been written yet — saving per keystroke would be
    // one write per character.
    expect(lastWriteTo(db, 'couples')).toBeUndefined();

    await user.tab();

    await waitFor(() => {
      expect(lastWriteTo(db, 'couples')?.values).toEqual({ seal_text: '我们' });
    });
  });

  it('stores nothing rather than an empty string when cleared', async () => {
    const user = userEvent.setup();
    const { db } = mount({ couple: { seal_text: 'LY' } });

    const field = await screen.findByLabelText(/What’s on the seal/);
    await user.clear(field);
    await user.tab();

    await waitFor(() => {
      expect(lastWriteTo(db, 'couples')?.values).toEqual({ seal_text: null });
    });
  });
});

describe('the bottom bar', () => {
  it('pins in the order they were chosen', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: /Spending/ }));
    await waitFor(() => {
      expect(lastWriteTo(db, 'profiles')?.values).toEqual({ pinned: ['/spending'] });
    });

    await user.click(screen.getByRole('button', { name: /Calendar/ }));
    await waitFor(() => {
      expect(lastWriteTo(db, 'profiles')?.values).toEqual({
        pinned: ['/spending', '/calendar'],
      });
    });
  });

  it('unpins something already pinned', async () => {
    const user = userEvent.setup();
    const { db } = mount({ profile: { pinned: ['/spending', '/calendar'] } });

    await user.click(await screen.findByRole('button', { name: /Spending/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'profiles')?.values).toEqual({ pinned: ['/calendar'] });
    });
  });

  it('stops at four and says why, rather than silently ignoring the fifth', async () => {
    const user = userEvent.setup();
    const { db } = mount({
      profile: { pinned: ['/', '/vault', '/letters', '/calendar'] },
    });

    expect(await screen.findByText(/Four is the most that fits/)).toBeInTheDocument();

    const fifth = screen.getByRole('button', { name: /Spending/ });
    expect(fifth).toBeDisabled();

    await user.click(fifth);
    expect(lastWriteTo(db, 'profiles')).toBeUndefined();
  });

  it('resets to the defaults', async () => {
    const user = userEvent.setup();
    const { db } = mount({ profile: { pinned: ['/spending'] } });

    await user.click(await screen.findByRole('button', { name: /Back to the defaults/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'profiles')?.values).toEqual({ pinned: [] });
    });
  });

  it('never offers a destination the couple has switched off', async () => {
    mount({ couple: { intimacy_mode: false, distance_mode: false } });

    await screen.findByRole('button', { name: /Home/ });
    expect(screen.queryByRole('button', { name: /Together/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Distance/ })).not.toBeInTheDocument();
  });
});

describe('nudges', () => {
  it('turns off', async () => {
    const user = userEvent.setup();
    const { db } = mount({ profile: { nudges: true } });

    await user.click(await screen.findByRole('switch', { name: /Let the app nudge me/ }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'profiles')?.values).toEqual({ nudges: false });
    });
  });
});

/**
 * The failure that started all of this.
 *
 * Before the write path reported anything, this whole section rendered and
 * did nothing, and there was no way to tell that from a bug in the markup.
 */
describe('when the database has not been migrated', () => {
  it('says so, instead of appearing broken', async () => {
    const user = userEvent.setup();
    const { db } = mount();
    db.refuse('couples', 'update', FakeSupabase.missingColumn('accent'));

    await user.click(await screen.findByRole('button', { name: /Jade/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/didn’t save/i);
    expect(alert).toHaveTextContent(/migrations/i);
  });

  it('puts the control back where it was, rather than lying about the value', async () => {
    const user = userEvent.setup();
    const { db } = mount({ couple: { week_starts_on: 1 } });
    db.refuse('couples', 'update', FakeSupabase.missingColumn('week_starts_on'));

    const sunday = await screen.findByRole('button', { name: 'Sunday' });
    await user.click(sunday);

    await screen.findByRole('alert');
    expect(sunday).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('can be dismissed', async () => {
    const user = userEvent.setup();
    const { db } = mount();
    db.refuse('profiles', 'update', FakeSupabase.missingColumn('pinned'));

    await user.click(await screen.findByRole('button', { name: /Spending/ }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /Dismiss/ }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
