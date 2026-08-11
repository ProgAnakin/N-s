import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUPLE_ID, HER_ID, HIM_ID, lastWriteTo, mountSignedIn } from '@/test/harness';
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

const { LettersScreen } = await import('./LettersScreen');
const { WriteFailureBanner } = await import('@/components/WriteFailureBanner');

/**
 * The whole letter process, start to finish.
 *
 * Writing one, sealing one, opening one, taking one back. Each of these
 * crosses the component, the session, the table hook and the fake database,
 * so what is being checked is that the process completes — not that a button
 * is on screen.
 */

function letterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `letter-${Math.random().toString(36).slice(2)}`,
    couple_id: COUPLE_ID,
    from_profile: HER_ID,
    to_profile: HIM_ID,
    kind: 'thanks',
    body: 'For the soup.',
    open_on: null,
    read_at: null,
    created_at: '2026-03-01T09:00:00.000Z',
    updated_at: '2026-03-01T09:00:00.000Z',
    ...overrides,
  };
}

function mount(options: Parameters<typeof mountSignedIn>[1] = {}) {
  return mountSignedIn(
    <>
      <LettersScreen />
      <WriteFailureBanner />
    </>,
    options,
  );
}

beforeEach(() => {
  resetWriteFailure();
  window.localStorage.clear();
});

describe('writing one', () => {
  it('goes from empty shelf to a saved letter addressed to the partner', async () => {
    const user = userEvent.setup();
    const { db } = mount({ seed: (d) => d.seed('letters', []) });

    expect(await screen.findByText(/Nothing on the shelf yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Write the first one/ }));
    await user.type(
      await screen.findByLabelText(/What you want to say/),
      'You stayed up so I would not eat alone.',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const write = lastWriteTo(db, 'letters');
      expect(write?.op).toBe('insert');
      expect(write?.values).toMatchObject({
        couple_id: COUPLE_ID,
        from_profile: HIM_ID,
        to_profile: HER_ID,
        kind: 'thanks',
        body: 'You stayed up so I would not eat alone.',
        open_on: null,
      });
    });

    // And it is actually on the shelf afterwards, not just sent.
    expect(
      await screen.findByText('You stayed up so I would not eat alone.'),
    ).toBeInTheDocument();
  });

  it('will not save an empty one', async () => {
    const user = userEvent.setup();
    const { db } = mount({ seed: (d) => d.seed('letters', []) });

    await user.click(await screen.findByRole('button', { name: /Write the first one/ }));
    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled();
    expect(lastWriteTo(db, 'letters')).toBeUndefined();
  });

  it('trims what was typed, so a letter of spaces cannot be saved', async () => {
    const user = userEvent.setup();
    const { db } = mount({ seed: (d) => d.seed('letters', []) });

    await user.click(await screen.findByRole('button', { name: /Write the first one/ }));
    await user.type(await screen.findByLabelText(/What you want to say/), '   ');

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(lastWriteTo(db, 'letters')).toBeUndefined();
  });

  it('records the kind that was picked, not the default', async () => {
    const user = userEvent.setup();
    const { db } = mount({ seed: (d) => d.seed('letters', []) });

    await user.click(await screen.findByRole('button', { name: /Write the first one/ }));
    await user.click(await screen.findByRole('button', { name: /Repair/ }));
    await user.type(await screen.findByLabelText(/What you want to say/), 'I went quiet.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'letters')?.values).toMatchObject({ kind: 'sorry' });
    });
  });
});

describe('sealing one', () => {
  it('will not save a sealed letter with no date on it', async () => {
    const user = userEvent.setup();
    mount({ seed: (d) => d.seed('letters', []) });

    await user.click(await screen.findByRole('button', { name: /Write the first one/ }));
    await user.type(await screen.findByLabelText(/What you want to say/), 'For December.');
    await user.click(screen.getByRole('switch', { name: /Seal it until a day/ }));

    // Sealed with no date would save as an ordinary letter and be delivered
    // immediately — the opposite of what was asked for.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves the date it was sealed until', async () => {
    const user = userEvent.setup();
    const { db } = mount({ seed: (d) => d.seed('letters', []) });

    await user.click(await screen.findByRole('button', { name: /Write the first one/ }));
    await user.type(await screen.findByLabelText(/What you want to say/), 'For December.');
    await user.click(screen.getByRole('switch', { name: /Seal it until a day/ }));

    const dateField = await screen.findByLabelText(/Seal it until a day/, { selector: 'input' });
    await user.type(dateField, '2026-12-25');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'letters')?.values).toMatchObject({ open_on: '2026-12-25' });
    });
  });
});

describe('receiving one', () => {
  it('keeps an unopened letter shut until it is opened', async () => {
    const user = userEvent.setup();
    const { db } = mount({
      seed: (d) => d.seed('letters', [letterRow({ body: 'A secret thing.' })]),
    });

    expect(await screen.findByText('1 unopened')).toBeInTheDocument();
    expect(screen.queryByText('A secret thing.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Open it/ }));

    expect(await screen.findByText('A secret thing.')).toBeInTheDocument();
    await waitFor(() => {
      const write = lastWriteTo(db, 'letters');
      expect(write?.op).toBe('update');
      expect(write?.values).toHaveProperty('read_at');
      expect(write?.values?.read_at).toEqual(expect.any(String));
    });
  });

  it('shows an already-opened letter without asking again', async () => {
    mount({
      seed: (d) =>
        d.seed('letters', [
          letterRow({ body: 'Read this already.', read_at: '2026-03-02T10:00:00.000Z' }),
        ]),
    });

    expect(await screen.findByText('Read this already.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open it/ })).not.toBeInTheDocument();
  });

  it('does not offer to edit or unsend a letter somebody else wrote', async () => {
    mount({ seed: (d) => d.seed('letters', [letterRow({ read_at: '2026-03-02T10:00:00.000Z' })]) });

    await screen.findByText('For the soup.');
    expect(screen.queryByRole('button', { name: /^Delete$/ })).not.toBeInTheDocument();
  });
});

describe('taking one back', () => {
  it('unsends your own letter while it is still unread', async () => {
    const user = userEvent.setup();
    const { db } = mount({
      seed: (d) =>
        d.seed('letters', [
          letterRow({ id: 'mine', from_profile: HIM_ID, to_profile: HER_ID, body: 'Regretted.' }),
        ]),
    });

    await screen.findByText('Regretted.');
    await user.click(screen.getByRole('button', { name: /Delete/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Delete/ }));

    await waitFor(() => {
      const write = lastWriteTo(db, 'letters');
      expect(write?.op).toBe('delete');
      expect(write?.match).toEqual({ id: 'mine' });
    });
    await waitFor(() => {
      expect(screen.queryByText('Regretted.')).not.toBeInTheDocument();
    });
  });

  it('offers no way to unsend one the partner has already read', async () => {
    mount({
      seed: (d) =>
        d.seed('letters', [
          letterRow({
            from_profile: HIM_ID,
            to_profile: HER_ID,
            body: 'Already landed.',
            read_at: '2026-03-02T10:00:00.000Z',
          }),
        ]),
    });

    await screen.findByText('Already landed.');
    // The row policy refuses this too; the interface should not offer it and
    // then fail.
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });
});

describe('when the table does not exist yet', () => {
  it('says the migrations need running rather than failing silently', async () => {
    const user = userEvent.setup();
    const { db } = mount({ seed: (d) => d.seed('letters', []) });
    db.refuse('letters', 'insert', {
      code: '42P01',
      message: 'relation "public.letters" does not exist',
    });

    await user.click(await screen.findByRole('button', { name: /Write the first one/ }));
    await user.type(await screen.findByLabelText(/What you want to say/), 'Hello.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/migrations/i);
  });
});

/**
 * Dropping a file on the shelf.
 *
 * Driven through the screen rather than against the parser, because the
 * parser was never the risky part: what breaks is the seam — a file that
 * imports but never reaches the textarea, a drop that saves a letter
 * nobody read first, or a shelf that offers a drop target to somebody
 * with no partner to send it to.
 */

function fileOf(name: string, contents: string, type = 'text/plain'): File {
  const file = new File([contents], name, { type });
  // jsdom's File has no arrayBuffer() in some versions, and the import
  // path depends on it entirely.
  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode(contents).buffer,
    });
  }
  return file;
}

async function drop(target: HTMLElement, file: File) {
  const dataTransfer = {
    files: [file],
    items: [{ kind: 'file', type: file.type }],
    types: ['Files'],
    dropEffect: 'copy',
  };
  fireEvent.dragEnter(target, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
}

describe('importing a file', () => {
  it('puts a dropped .txt into the composer instead of saving it outright', async () => {
    const { db } = mount({ seed: (d) => d.seed('letters', []) });
    const shelf = await screen.findByText(/Nothing on the shelf yet/);

    await drop(shelf, fileOf('carta.txt', 'Querida,\n\nvocê ficou acordada.'));

    // The composer opens with the text in it — and nothing is saved yet,
    // because an accidental drop must not become a sent letter.
    const field = await screen.findByLabelText(/What you want to say/);
    await waitFor(() => {
      expect(field).toHaveValue('Querida,\n\nvocê ficou acordada.');
    });
    expect(lastWriteTo(db, 'letters')).toBeUndefined();
  });

  it('says where the text came from, so an edited import is not mistaken for typing', async () => {
    mount({ seed: (d) => d.seed('letters', []) });
    const shelf = await screen.findByText(/Nothing on the shelf yet/);

    await drop(shelf, fileOf('para-voce.txt', 'Uma coisa pequena.'));

    expect(await screen.findByText(/Loaded from para-voce\.txt/)).toBeInTheDocument();
  });

  it('saves the imported text once it has actually been read and confirmed', async () => {
    const user = userEvent.setup();
    const { db } = mount({ seed: (d) => d.seed('letters', []) });
    const shelf = await screen.findByText(/Nothing on the shelf yet/);

    await drop(shelf, fileOf('carta.md', '# Obrigado\n\nPela sopa.'));
    await screen.findByLabelText(/What you want to say/);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(lastWriteTo(db, 'letters')?.values).toMatchObject({
        body: '# Obrigado\n\nPela sopa.',
      });
    });
  });

  it('names the reason a file was refused rather than doing nothing', async () => {
    mount({ seed: (d) => d.seed('letters', []) });
    const shelf = await screen.findByText(/Nothing on the shelf yet/);

    await drop(shelf, fileOf('slides.key', 'binary junk', 'application/octet-stream'));

    expect(await screen.findByText(/Only \.txt, \.md, \.rtf, \.docx and \.pdf/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/What you want to say/)).not.toBeInTheDocument();
  });

  it('refuses an empty file instead of opening a blank composer', async () => {
    mount({ seed: (d) => d.seed('letters', []) });
    const shelf = await screen.findByText(/Nothing on the shelf yet/);

    await drop(shelf, fileOf('empty.txt', '   \n\n  '));

    expect(await screen.findByText(/had no text in it/)).toBeInTheDocument();
  });

  it('offers a button as well, since a phone has nothing to drag from', async () => {
    mount({ seed: (d) => d.seed('letters', []) });
    expect(await screen.findAllByRole('button', { name: /Import a file/ })).not.toHaveLength(0);
  });
});

describe('before the partner has joined', () => {
  it('explains why there is nothing to write, instead of showing an empty page', async () => {
    mount({ partner: null, seed: (d) => d.seed('letters', []) });

    expect(await screen.findByText(/A letter needs someone to open it/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get the invite code/ })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('offers no import either, since there is nobody to address it to', async () => {
    mount({ partner: null, seed: (d) => d.seed('letters', []) });

    await screen.findByText(/A letter needs someone to open it/);
    expect(screen.queryByRole('button', { name: /Import a file/ })).not.toBeInTheDocument();
  });
});

describe('the shelf is never a scoreboard', () => {
  it('counts the pair and never breaks it down by author', async () => {
    mount({
      seed: (d) =>
        d.seed('letters', [
          letterRow({ from_profile: HIM_ID, to_profile: HER_ID, read_at: '2026-03-02T00:00:00Z' }),
          letterRow({ from_profile: HIM_ID, to_profile: HER_ID, read_at: '2026-03-02T00:00:00Z' }),
          letterRow({ from_profile: HER_ID, to_profile: HIM_ID, read_at: '2026-03-02T00:00:00Z' }),
        ]),
    });

    expect(await screen.findByText(/3 letters between you/)).toBeInTheDocument();

    const page = within(document.body);
    // Anything resembling "you wrote 2, she wrote 1" is the failure.
    expect(page.queryByText(/you wrote/i)).not.toBeInTheDocument();
    expect(page.queryByText(/\bmore than\b/i)).not.toBeInTheDocument();
  });
});
