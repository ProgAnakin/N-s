import type { CurrencyCode } from './money';

/**
 * A rate table compiled into the app, so a total always exists.
 *
 * Three designs came before this one and all three had the same hole: they
 * put a network request on the path between "two people logged expenses in
 * two currencies" and "the page shows one number". First the expense with
 * no snapshot was dropped from the total. Then it was counted at today's
 * live rate — which needs the provider. Then a shared table let one
 * partner's browser answer for the other's — which still needs *somebody's*
 * browser to reach the provider.
 *
 * For a couple split between Brazil and China, that assumption keeps
 * failing, and the failure mode was always the same: the one number the
 * spending page exists to give quietly wasn't the answer.
 *
 * So there is a floor. These four numbers ship inside the bundle. They need
 * no network, no account, no migration, and no permission. They mean the
 * total is never missing anything, on any device, ever — including a phone
 * in flight mode on its first run.
 *
 * **What keeps this honest**, and it is the whole design:
 *
 *   - It is never frozen onto an expense. `captureRates` and
 *     `captureRatesOn` ignore it entirely, because a stored `fx` claims to
 *     be *that day's actual rate* and this is not that. An expense without
 *     a real rate keeps waiting for one.
 *   - It is only ever the last resort. A frozen snapshot beats it, today's
 *     live rate beats it, a rate the partner shared beats it.
 *   - Everywhere it reaches the screen, the figure says "about".
 *
 * So the worst it can do is be a few percent off on a line that already
 * admits it is approximate — against the alternative, which was showing
 * nothing at all and calling that rigour.
 *
 * **Refreshing it.** These are anchors, not live data, and they do not need
 * to be right to the decimal — being within a few percent is enough for a
 * figure labelled "about", and the moment any real rate arrives this stops
 * being consulted for that row. Worth a glance every year or so; harmless
 * if forgotten, because drift here can only ever affect a number already
 * marked as an estimate.
 */

/** When these were last set, so staleness is a fact rather than a guess. */
export const BASELINE_SET_ON = '2026-08-12';

/** What one euro was worth, roughly, on the date above. */
export const BASELINE_PER_EUR: Record<CurrencyCode, number> = {
  EUR: 1,
  USD: 1.08,
  BRL: 6.2,
  CNY: 7.9,
};
