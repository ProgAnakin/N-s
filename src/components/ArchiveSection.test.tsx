import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, HER_ID, HIM_ID, mountSignedIn } from '@/test/harness';
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

const { ArchiveSection } = await import('./ArchiveSection');

/**
 * Getting it all out.
 *
 * The promise the ending screen makes is that closing a space is not
 * confiscating it, and this is the only thing in the app that makes that
 * promise true. So what is worth testing is not that a button exists — it is
 * that the file which comes out actually contains the years, and that the
 * HTML one needs nothing to open it. An archive that needs an app is not an
 * archive; it is a hostage with better manners.
 */

/**
 * Whatever the component last handed to the browser.
 *
 * jsdom has no object URLs, and the downloaded file is this component's only
 * observable output — so this is the seam every assertion reads through.
 */
let savedBlob: Blob | null = null;
let savedName = '';

const noObjectUrls = typeof URL.createObjectURL !== 'function';

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
  savedBlob = null;
  savedName = '';

  URL.createObjectURL = ((blob: Blob) => {
    savedBlob = blob;
    return 'blob:archive';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;

  // Left alone, the anchor click asks jsdom to navigate to blob:archive.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    savedName = this.download;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (noObjectUrls) {
    delete (URL as { createObjectURL?: unknown }).createObjectURL;
    delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  }
});

function memoryRow(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    couple_id: COUPLE_ID,
    title: 'The night it rained in Porto',
    date: '2025-04-02',
    note: 'We ran for the tram and missed it, twice.',
    created_by: HIM_ID,
    created_at: '2025-04-02T00:00:00.000Z',
    updated_at: '2025-04-02T00:00:00.000Z',
    ...over,
  };
}

function mount(seed: Record<string, Record<string, unknown>[]> = {}) {
  return mountSignedIn(<ArchiveSection />, {
    couple: { couple_name: 'Léo & Yan', anniversary_date: '2023-06-12' },
    seed: (db) => {
      for (const table of [
        'memories',
        'memory_photos',
        'letters',
        'remember_facts',
        'expenses',
        'gift_ideas',
      ]) {
        db.seed(table, seed[table] ?? []);
      }
    },
  });
}

/** jsdom's Blob has no `text()`, but FileReader reads it. */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function clickAndRead(name: RegExp) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name }));
  await waitFor(() => {
    expect(savedBlob).not.toBeNull();
  });
  return { body: await blobText(savedBlob!), type: savedBlob!.type, filename: savedName };
}

describe('what it offers', () => {
  it('leads with the file that opens anywhere', async () => {
    mount();
    expect(await screen.findByText(/One file that opens anywhere/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download the keepsake/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download JSON/ })).toBeInTheDocument();
  });

  /**
   * Said on the page rather than left to be inferred: the file contains what
   * you can see and only that, the same way the screen does.
   */
  it('says what is not in the file', async () => {
    mount();
    expect(await screen.findByText(/private notes and their gift ideas are not in it/)).toBeInTheDocument();
  });
});

describe('the keepsake', () => {
  it('is one self-contained page, with nothing to fetch', async () => {
    mount({ memories: [memoryRow()] });
    const file = await clickAndRead(/Download the keepsake/);

    expect(file.type).toBe('text/html');
    expect(file.body).toContain('<!doctype html>');
    expect(file.body).toContain('The night it rained in Porto');
    // The whole point. A single <link>, <script src> or remote image and
    // the file stops opening on a laptop with no connection in 2040.
    expect(file.body).not.toMatch(/<link[^>]+href="http/i);
    expect(file.body).not.toMatch(/<script[^>]+src=/i);
    expect(file.body).not.toMatch(/src="https?:/i);
  });

  it('carries the letters, the notes and the spending, not just the photographs', async () => {
    mount({
      memories: [memoryRow()],
      letters: [
        {
          id: 'l1',
          couple_id: COUPLE_ID,
          kind: 'letter',
          body: 'You fell asleep on the train again.',
          from_profile: HIM_ID,
          to_profile: HER_ID,
          open_on: null,
          created_at: '2025-05-01T00:00:00.000Z',
          updated_at: '2025-05-01T00:00:00.000Z',
        },
      ],
      remember_facts: [
        {
          id: 'f1',
          couple_id: COUPLE_ID,
          author_id: HIM_ID,
          category: 'preferences',
          question: 'What flowers do you actually like?',
          answer: 'Peonies, the big pale ones.',
          visibility: 'shared',
          remind_on: null,
          question_id: null,
          answer_kind: null,
          created_at: '2025-03-01T00:00:00.000Z',
          updated_at: '2025-03-01T00:00:00.000Z',
        },
      ],
      expenses: [
        {
          id: 'e1',
          couple_id: COUPLE_ID,
          label: 'Tram tickets',
          amount_cents: 320,
          currency: 'EUR',
          paid_by: 'partner_a',
          date: '2025-04-02',
          category: 'transport',
          split_rule: '50_50',
          partner_a_percent: null,
          trip_id: null,
          note: null,
          fx: null,
          fx_on: null,
          edited_at: null,
          created_by: HIM_ID,
          created_at: '2025-04-02T00:00:00.000Z',
          updated_at: '2025-04-02T00:00:00.000Z',
        },
      ],
    });

    const file = await clickAndRead(/Download the keepsake/);
    expect(file.body).toContain('You fell asleep on the train again.');
    expect(file.body).toContain('Peonies, the big pale ones.');
    expect(file.body).toContain('Tram tickets');
  });

  /**
   * A quote in a memory must arrive as a quote, not as markup. This is the
   * escaping path, tested where it would actually hurt.
   */
  it('escapes what people wrote instead of running it', async () => {
    mount({
      memories: [memoryRow({ note: 'She said <b>"finally"</b> & laughed' })],
    });
    const file = await clickAndRead(/Download the keepsake/);

    expect(file.body).toContain('&lt;b&gt;');
    expect(file.body).not.toContain('<b>"finally"</b>');
  });

  it('names the file after the couple, so a folder of them still makes sense', async () => {
    mount({ memories: [memoryRow()] });
    const file = await clickAndRead(/Download the keepsake/);
    expect(file.filename).toMatch(/leo.*yan/i);
    expect(file.filename).toMatch(/\.html$/);
  });
});

describe('the raw data', () => {
  it('is JSON, and parses', async () => {
    mount({ memories: [memoryRow()] });
    const file = await clickAndRead(/Download JSON/);

    expect(file.type).toBe('application/json');
    const parsed = JSON.parse(file.body) as {
      meta: { coupleName: string };
      memories: { title: string }[];
    };
    expect(parsed.meta.coupleName).toBe('Léo & Yan');
    expect(parsed.memories[0]?.title).toBe('The night it rained in Porto');
  });

  it('holds up with nothing in the space at all', async () => {
    mount();
    const file = await clickAndRead(/Download JSON/);
    const parsed = JSON.parse(file.body) as { memories: unknown[] };
    expect(parsed.memories).toEqual([]);
  });
});

describe('when the export cannot finish', () => {
  it('says so, and says nothing was changed', async () => {
    const user = userEvent.setup();
    const { db } = mount({ memories: [memoryRow()] });
    await screen.findByText(/One file that opens anywhere/);

    vi.spyOn(db, 'from').mockImplementation(() => {
      throw new Error('gone');
    });

    await user.click(screen.getByRole('button', { name: /Download JSON/ }));
    expect(await screen.findByText(/didn’t finish/)).toBeInTheDocument();
    expect(screen.getByText(/nothing was changed/i)).toBeInTheDocument();
  });
});
