import { m } from 'framer-motion';
import type { Balance } from '@/lib/money';
import {
  formatPercent,
  isLevel,
  percentSplit,
  rebalanceSuggestion,
} from '@/lib/money';
import { useI18n, useStrings } from '@/i18n';
import type { PartnerNames } from '@/screens/shared';
import { useMoney } from '@/screens/shared';
import { cn } from '@/utils/cn';

/**
 * The balance, and everything the page says about it.
 *
 * One product rule governs this file and a test enforces it: no debt
 * language, ever. Not "owes", not "settle up", not a figure attached to a
 * name with a minus in front of it. The strongest statement anything here
 * makes is a suggestion about who might comfortably pay for the next one.
 *
 * The two accent colours carry equal weight. Neither is the good side, and
 * whoever has paid more is never drawn as a creditor.
 */

/**
 * What each of them has spent.
 *
 * Deliberately not a bar. A bar takes one quantity and divides it between
 * two people, which is a comparison however gently it is drawn — and a
 * personal expense is nobody's business but the person who made it. These
 * are two facts placed side by side, each with its own composition
 * underneath, sharing no axis and summing to nothing in particular.
 *
 * The comparison apparatus — percentages, one bar, a nudge — lives below
 * on the pool they agreed to divide, where comparing is the entire point.
 *
 * The figure exists because it was missing and its absence was reported
 * within the hour: logging €100 of your own and watching every number on
 * the page hold still is indistinguishable from the app dropping it.
 */
export function SpentTotals({
  balance,
  names,
  className,
}: {
  balance: Balance;
  names: PartnerNames;
  className?: string;
}) {
  const s = useStrings();
  const money = useMoney();

  const logged =
    balance.spentCents.partner_a +
    balance.spentCents.partner_b +
    balance.treatedCents.partner_a +
    balance.treatedCents.partner_b;

  if (logged === 0) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div className="h-3 w-full rounded-sm bg-sunk" aria-hidden="true" />
        <p className="text-sm text-ink-faint">{s.spending.balanceNothing}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-xs font-medium text-ink-soft">{s.spending.spentTitle}</p>
      <div className="grid grid-cols-2 gap-3">
        {(['partner_a', 'partner_b'] as const).map((role) => {
          const own = balance.ownCents[role];
          const share = balance.fairShare[role];
          return (
            <div
              key={role}
              className="flex flex-col gap-1 rounded-sm border border-rule bg-sunk/40 p-3"
            >
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm',
                    role === 'partner_a' ? 'bg-cinnabar' : 'bg-jade',
                  )}
                />
                <span className="truncate text-sm text-ink">{names[role]}</span>
              </span>
              <span className="font-display text-xl tabular-nums text-ink">
                {money(balance.spentCents[role], balance.currency)}
              </span>
              {/* Where it came from, because the sum of two things is not
                  believable until you can see the two things — and only
                  the terms that are actually there. */}
              <span className="text-xs leading-relaxed text-ink-faint">
                {own > 0 && share > 0
                  ? s.spending.spentFrom(
                      money(own, balance.currency, true),
                      money(share, balance.currency, true),
                    )
                  : own > 0
                    ? s.spending.spentFromOwn(money(own, balance.currency, true))
                    : s.spending.spentFromSplit(money(share, balance.currency, true))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The shared total, and how it falls between the two of them.
 *
 * This is the only bar on the page, and getting to one took three tries.
 * It used to sit beneath a second bar showing who had *fronted* the cash,
 * which was a true figure answering a question nobody had asked: log a €50
 * dinner split down the middle, pay for it yourself, and that bar moved
 * under one name alone while the row beneath it said €50 each. Two bars
 * that look identical and mean different things do not teach anyone the
 * difference — they just make the page untrustworthy.
 *
 * So the cash-flow figures went to the one place they were ever load-
 * bearing: the working under the nudge, where they explain why the next
 * one is on somebody. And the percentages that came with them went
 * altogether. "77.1% / 22.9%" over two names is a scoreboard, and this
 * app does not keep score.
 *
 * What is left is the honest picture of a shared life: what it all came
 * to, and whose it was. Both names move when something shared is logged,
 * whoever handed the card over.
 */
export function ShareBar({
  balance,
  names,
  className,
}: {
  balance: Balance;
  names: PartnerNames;
  className?: string;
}) {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const money = useMoney();

  // Nothing divided means no pool to draw, and an empty bar with two
  // zeroes under it says less than nothing. The totals above have already
  // told the reader what they logged.
  if (balance.totalCents === 0) return null;

  const percent = percentSplit(balance.fairShare);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-xs font-medium text-ink-soft">{s.spending.shareTitle}</p>

      {/* No hairline on this one. The bar above needs a reference mark
          because contributions drift away from the rules; this one *is*
          the rules, so there is nothing for it to fall short of. */}
      <div
        className="relative flex h-3 w-full overflow-hidden rounded-sm bg-sunk"
        role="img"
        aria-label={`${names.partner_a} ${money(balance.fairShare.partner_a, balance.currency)}, ${names.partner_b} ${money(balance.fairShare.partner_b, balance.currency)}`}
      >
        <m.div
          className="bg-cinnabar"
          initial={{ width: 0 }}
          animate={{ width: `${percent.partner_a}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }}
        />
        <m.div
          className="bg-jade"
          initial={{ width: 0 }}
          animate={{ width: `${percent.partner_b}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }}
        />
      </div>

      <div className="flex items-start justify-between gap-4 text-sm">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm bg-cinnabar" />
            <span className="truncate text-ink">{names.partner_a}</span>
          </span>
          <span className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-ink-soft">
              {money(balance.fairShare.partner_a, balance.currency)}
            </span>
            <span className="text-ink-faint">
              {formatPercent(percent.partner_a, intlLocale)}
            </span>
          </span>
        </span>
        <span className="flex min-w-0 flex-col items-end gap-0.5">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-ink">{names.partner_b}</span>
            <span aria-hidden="true" className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm bg-jade" />
          </span>
          <span className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-ink-faint">
              {formatPercent(percent.partner_b, intlLocale)}
            </span>
            <span className="text-ink-soft">
              {money(balance.fairShare.partner_b, balance.currency)}
            </span>
          </span>
        </span>
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">
        {s.spending.totalShared(money(balance.totalCents, balance.currency, true))}
      </p>

      <p className="text-xs leading-relaxed text-ink-faint">{s.spending.shareBody}</p>
    </div>
  );
}

/**
 * The forward-looking nudge, or the quiet "you're even" that should be the
 * normal state. Never a figure owed.
 */
export function RebalanceNote({
  balance,
  names,
  className,
}: {
  balance: Balance;
  names: PartnerNames;
  className?: string;
}) {
  const s = useStrings();
  const money = useMoney();
  const suggestion = rebalanceSuggestion(balance);

  // Nothing divided, nothing that could be uneven. Two people spending
  // their own money are not out of balance, and inventing a nudge from
  // that would be the scoreboard arriving by the back door.
  if (balance.totalCents === 0) return null;

  if (!suggestion || isLevel(balance)) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <p className="font-display text-lg font-medium text-jade">{s.spending.balanceEven}</p>
        <p className="text-sm leading-relaxed text-ink-soft">{s.spending.balanceEvenBody}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <p className="label-kicker">{s.spending.rebalanceTitle}</p>
      <p className="text-pretty font-display text-lg font-medium text-ink">
        {s.spending.rebalanceBody(
          names[suggestion.partner],
          money(suggestion.amountCents, balance.currency),
        )}
      </p>
      {/* The working, not just the answer, and taken from the two blocks
          the reader has just looked at. A number that cannot be checked
          against anything else on the page is a number nobody believes. */}
      <p className="text-sm leading-relaxed text-ink-soft">
        {s.spending.rebalanceWorking(
          names[suggestion.partner],
          money(suggestion.contributed[suggestion.partner], balance.currency),
          money(suggestion.fairShare[suggestion.partner], balance.currency),
        )}
      </p>
      <p className="text-sm leading-relaxed text-ink-soft">{s.spending.rebalanceHint}</p>
    </div>
  );
}

/** Treats, shown apart from the balance and never netted against it. */
export function TreatsNote({ balance, names }: { balance: Balance; names: PartnerNames }) {
  const s = useStrings();
  const money = useMoney();

  const given = (['partner_a', 'partner_b'] as const).filter(
    (role) => balance.treatedCents[role] > 0,
  );
  if (given.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="label-kicker">{s.spending.treatsTitle}</p>
      <ul className="flex flex-col gap-0.5 text-sm text-ink-soft">
        {given.map((role) => (
          <li key={role}>
            {s.spending.treatsBy(names[role], money(balance.treatedCents[role], balance.currency))}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-ink-faint">{s.spending.treatsBody}</p>
    </div>
  );
}
