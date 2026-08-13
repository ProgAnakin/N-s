import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, HIM_ID, mountSignedIn } from '@/test/harness';
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

const { EraseSection } = await import('./EraseSection');

/**
 * The one control in the app that destroys something.
 *
 * Everything else here can be undone by typing it again. This cannot, and
 * there is no grace period, so the tests are about the two things that go
 * wrong with a delete button: it does more than it said it would, or it
 * does it before the person meant it.
 *
 * The line it must hold is the one migration 0014 writes into the policies:
 * what is yours alone goes when you say so; what belonged to both of you
 * survives while the other person is still there. A partner who is still
 * using the space must not lose the photographs because you left.
 */

function photoRow(path: string) {
  return {
    id: `p-${path}`,
    couple_id: COUPLE_ID,
    memory_id: 'm1',
    path,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function wishRow(path: string) {
  return {
    id: `w-${path}`,
    couple_id: COUPLE_ID,
    profile_id: HIM_ID,
    slot: 1,
    title: 'A good coat',
    note: null,
    photo_path: path,
    granted_on: null,
    granted_by: null,
    granted_note: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function mount(options: Parameters<typeof mountSignedIn>[1] = {}) {
  const scene = mountSignedIn(<EraseSection />, {
    ...options,
    seed: (db) => {
      db.seed('memory_photos', [photoRow('couples/33/photo-a.jpg')]);
      db.seed('phrases', []);
      db.seed('trip_items', []);
      db.seed('wishes', [wishRow('couples/33/wish-a.jpg')]);
      db.rpcs.set('delete_my_data', () => ({
        data: { private: 4, shared: 0 },
        error: null,
      }));
      options.seed?.(db);
    },
  });
  return scene;
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('what it tells you before you decide', () => {
  /**
   * "This cannot be undone" is not information. The list is.
   */
  it('names what goes and what survives, before the button', async () => {
    mount();
    expect(await screen.findByText(/What goes, whatever happens/)).toBeInTheDocument();
    expect(screen.getByText(/Your private notes/)).toBeInTheDocument();
    expect(screen.getByText(/What stays, because Yan is still here/)).toBeInTheDocument();
    expect(screen.getByText(/Memories and photographs/)).toBeInTheDocument();
  });

  it('says something different when nobody else is left', async () => {
    mount({ partner: null });
    expect(await screen.findByText(/because nobody else is left/)).toBeInTheDocument();
    expect(screen.getByText(/The whole space/)).toBeInTheDocument();
    expect(screen.queryByText(/is still here/)).not.toBeInTheDocument();
  });

  /**
   * The way out, offered before the way through.
   *
   * Found by sweeping for i18n keys nothing referenced: the copy for this
   * had been written and wired to nothing, so the only irreversible action
   * in the app sat here with no mention of the keepsake at all.
   */
  it('offers the keepsake before the button that destroys it', async () => {
    mount();
    const link = await screen.findByRole('link', { name: /download the keepsake first/i });
    expect(link).toHaveAttribute('href', '#keepsake');
  });
});

describe('it does not happen on one tap', () => {
  it('asks, and does nothing until the answer is yes', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: /Delete what’s mine/ }));
    expect(await screen.findByText(/Delete your things\?/)).toBeInTheDocument();
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('changes nothing at all when the answer is no', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: /Delete what’s mine/ }));
    await user.click(await screen.findByRole('button', { name: /Cancel|Keep/i }));

    expect(db.rpcCalls).toHaveLength(0);
    expect(db.removedPaths).toEqual([]);
  });
});

describe('what it actually removes', () => {
  it('calls the one function that knows the rules', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: /Delete what’s mine/ }));
    await user.click(await screen.findByRole('button', { name: 'Yes, delete it' }));

    await waitFor(() => {
      expect(db.rpcCalls.map((call) => call.name)).toContain('delete_my_data');
    });
  });

  /**
   * The failure that would be silent and permanent: deleting the shared
   * photographs out from under a partner who is still there. Postgres
   * cannot reach the bucket, so nothing in the database would stop this —
   * only this branch does.
   */
  it('leaves the shared photographs alone while the partner is still there', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: /Delete what’s mine/ }));
    await user.click(await screen.findByRole('button', { name: 'Yes, delete it' }));

    await waitFor(() => {
      expect(db.rpcCalls).toHaveLength(1);
    });
    expect(db.removedPaths).not.toContain('couples/33/photo-a.jpg');
  });

  it('removes them once nobody is left to look at them', async () => {
    const user = userEvent.setup();
    const { db } = mount({ partner: null });

    await user.click(await screen.findByRole('button', { name: /Delete what’s mine/ }));
    await user.click(await screen.findByRole('button', { name: 'Yes, delete it' }));

    await waitFor(() => {
      expect(db.removedPaths).toContain('couples/33/photo-a.jpg');
    });
  });

  /** Mine either way: the wish photographs are only ever mine. */
  it('removes my own wish photographs whether or not they are still here', async () => {
    const user = userEvent.setup();
    const { db } = mount();

    await user.click(await screen.findByRole('button', { name: /Delete what’s mine/ }));
    await user.click(await screen.findByRole('button', { name: 'Yes, delete it' }));

    await waitFor(() => {
      expect(db.removedPaths).toContain('couples/33/wish-a.jpg');
    });
  });

  /**
   * Storage before the database, always. The rows that name the files have
   * to still exist when the files are removed, or the objects are orphaned
   * in the bucket: invisible, and impossible to find later.
   */
  it('clears the bucket before it clears the rows', async () => {
    const user = userEvent.setup();
    const { db } = mount({ partner: null });

    let removedByTheTimeOfTheCall = 0;
    db.rpcs.set('delete_my_data', () => {
      removedByTheTimeOfTheCall = db.removedPaths.length;
      return { data: { private: 4, shared: 9 }, error: null };
    });

    await user.click(await screen.findByRole('button', { name: /Delete what’s mine/ }));
    await user.click(await screen.findByRole('button', { name: 'Yes, delete it' }));

    await waitFor(() => {
      expect(db.rpcCalls).toHaveLength(1);
    });
    expect(removedByTheTimeOfTheCall).toBeGreaterThan(0);
  });
});

describe('when it does not work', () => {
  it('says so rather than pretending it is done', async () => {
    const user = userEvent.setup();
    const { db } = mount();
    db.rpcs.set('delete_my_data', () => ({
      data: null,
      error: { code: '42501', message: 'refused' },
    }));

    await user.click(await screen.findByRole('button', { name: /Delete what’s mine/ }));
    await user.click(await screen.findByRole('button', { name: 'Yes, delete it' }));

    expect(await screen.findByText(/didn’t finish|couldn’t/i)).toBeInTheDocument();
  });
});
