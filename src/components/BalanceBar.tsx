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
 * How the spending has been carried.
 *
 * Everything about this component is chosen to avoid the scoreboard reading:
 *
 *   - Two colours of equal weight, cinnabar and jade. Neither is the "good"
 *     side, and the person who has paid more is not highlighted as a creditor.
 *   - The numbers shown are percentages of what has been contributed, never a
 *     figure attached to a person's name with a minus in front of it.
 *   - The hairline is where an even split would sit given the rules in use.
 *     It is a reference mark, not a target anyone is failing to meet.
 *
 * The words "owe", "debt", "balance due" and "settle up" do not appear here,
 * and a test asserts that they never will.
 */
export function BalanceBar({
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

  const percentA = balance.contributionPercent.partner_a;
  const percentB = balance.contributionPercent.partner_b;

  const fairTotal = balance.fairShare.partner_a + balance.fairShare.partner_b;
  const fairPercentA = fairTotal > 0 ? (balance.fairShare.partner_a / fairTotal) * 100 : 50;

  if (balance.totalCents === 0) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div className="h-3 w-full rounded-sm bg-sunk" aria-hidden="true" />
        <p className="text-sm text-ink-faint">{s.spending.balanceNothing}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Says what the bar measures, because it was never obvious and the
          honest answer is narrower than the reading people give it: money
          that left an account, not spending that belonged to someone. */}
      <p className="text-xs font-medium text-ink-soft">{s.spending.contributedTitle}</p>
      <div
        className="relative h-3 w-full overflow-hidden rounded-sm bg-sunk"
        role="img"
        aria-label={`${names.partner_a} ${formatPercent(percentA, intlLocale)}, ${names.partner_b} ${formatPercent(percentB, intlLocale)}`}
      >
        <m.div
          className="absolute inset-y-0 left-0 bg-cinnabar"
          initial={{ width: 0 }}
          animate={{ width: `${percentA}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }}
        />
        <m.div
          className="absolute inset-y-0 right-0 bg-jade"
          initial={{ width: 0 }}
          animate={{ width: `${percentB}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }}
        />
        {/* Where the split would sit if each had covered exactly their share. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-paper/70"
          style={{ left: `${fairPercentA}%` }}
        />
      </div>

      {/* The amount, then the percentage. A percentage alone is what made
          this unreadable: somebody who has put in the same €100 all week
          watches their number fall as the other one logs things, and with
          no figure beside it there is nothing to tell them their own
          contribution never moved. */}
      <div className="flex items-start justify-between gap-4 text-sm">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm bg-cinnabar" />
            <span className="truncate text-ink">{names.partner_a}</span>
          </span>
          <span className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-ink-soft">
              {money(balance.contributed.partner_a, balance.currency)}
            </span>
            <span className="text-ink-faint">{formatPercent(percentA, intlLocale)}</span>
          </span>
        </span>
        <span className="flex min-w-0 flex-col items-end gap-0.5">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-ink">{names.partner_b}</span>
            <span aria-hidden="true" className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm bg-jade" />
          </span>
          <span className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-ink-faint">{formatPercent(percentB, intlLocale)}</span>
            <span className="text-ink-soft">
              {money(balance.contributed.partner_b, balance.currency)}
            </span>
          </span>
        </span>
      </div>

      <p className="text-xs text-ink-faint">
        {s.spending.totalShared(money(balance.totalCents, balance.currency, true))}
      </p>
    </div>
  );
}

/**
 * The other half of the picture: whose spending it was.
 *
 * The bar above answers "whose account did the money leave", which is the
 * question that drifts and the one the nudge is built on. It is not the
 * question most people think they are asking. Log a €50 dinner split down
 * the middle and pay for it yourself, and the bar moves under your name
 * alone — correct as cash flow, and it reads as though the whole €50 was
 * yours to carry when in fact €25 of it was theirs.
 *
 * `fairShare` has always been computed and, until now, only ever reached
 * the screen as the one-pixel hairline on the bar. This is that number,
 * said out loud, in money. It is the one that goes up for *both* of them
 * when something shared gets logged, whoever handed the card over.
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

  if (balance.totalCents === 0) {
    return (
      <p className={cn('text-sm leading-relaxed text-ink-soft', className)}>
        {s.spending.balanceNothingBody}
      </p>
    );
  }

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
