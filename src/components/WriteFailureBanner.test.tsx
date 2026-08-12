import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LazyMotion, domAnimation } from 'framer-motion';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n';
import { reportWriteFailure, resetWriteFailure } from '@/data/write-status';
import { WriteFailureBanner } from './WriteFailureBanner';

/**
 * What the app says when a change did not save.
 *
 * Most writes in Settings are fired and forgotten — a toggle, a chip, a
 * select. When one of those fails there is nothing to catch it, nothing on
 * screen moves, and a broken control is indistinguishable from a working
 * one. That is not hypothetical: a whole settings section appeared dead
 * because its migration had not been run, and the app said nothing at all.
 *
 * So each kind of failure gets its own sentence. `missing_schema` in
 * particular has to say what to do, because "run the migrations" is a
 * five-second fix that is otherwise an afternoon of guessing.
 */

function mount() {
  return render(
    <LazyMotion features={domAnimation} strict>
      <I18nProvider locale="en">
        <WriteFailureBanner />
      </I18nProvider>
    </LazyMotion>,
  );
}

beforeEach(() => {
  resetWriteFailure();
});

describe('when nothing has gone wrong', () => {
  it('is not there at all', () => {
    mount();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('when a write fails', () => {
  it('appears as an alert, so it is announced and not just drawn', () => {
    mount();
    act(() => reportWriteFailure({ code: '42501', message: 'refused' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  /**
   * The one that was worth building the whole banner for. The app being
   * ahead of its migrations looks exactly like a broken feature, and the
   * difference is five seconds of reading.
   */
  it('says what to do when the database is behind the app', () => {
    mount();
    act(() => reportWriteFailure({ code: 'PGRST204', message: "Could not find the 'accent' column" }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/migration/i);
  });

  /**
   * A refusal by the rules is a different situation from a migration that
   * has not been run, and telling somebody to run migrations when the
   * policy simply said no sends them the wrong way for an afternoon.
   */
  it('says something different when the rules refused it', () => {
    mount();
    act(() => reportWriteFailure({ code: '42501', message: 'row-level security' }));

    const alert = screen.getByRole('alert').textContent ?? '';
    expect(alert).toMatch(/The database refused it/);
    expect(alert).not.toMatch(/migration/i);
  });

  it('can be dismissed, and stays dismissed', async () => {
    const user = userEvent.setup();
    mount();
    act(() => reportWriteFailure({ code: '42501', message: 'refused' }));

    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  /**
   * Sitting above the phone's bottom bar rather than at the top of the
   * page. Settings is long, and a banner you have to scroll up to find is a
   * banner you do not see.
   */
  it('is fixed to the viewport rather than to the top of a long page', () => {
    mount();
    act(() => reportWriteFailure({ code: '42501', message: 'refused' }));
    expect(screen.getByRole('alert').className).toContain('fixed');
  });
});
