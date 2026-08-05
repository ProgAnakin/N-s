import { motion } from 'framer-motion';
import type { Balance } from '@/lib/money';
import { formatPercent, isLevel, rebalanceSuggestion } from '@/lib/money';
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
      <div
        className="relative h-3 w-full overflow-hidden rounded-sm bg-sunk"
        role="img"
        aria-label={`${names.partner_a} ${formatPercent(percentA, intlLocale)}, ${names.partner_b} ${formatPercent(percentB, intlLocale)}`}
      >
        <motion.div
          className="absolute inset-y-0 left-0 bg-cinnabar"
          initial={{ width: 0 }}
          animate={{ width: `${percentA}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }}
        />
        <motion.div
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

      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm bg-cinnabar" />
          <span className="truncate text-ink">{names.partner_a}</span>
          <span className="shrink-0 tabular-nums text-ink-faint">
            {formatPercent(percentA, intlLocale)}
          </span>
        </span>
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 tabular-nums text-ink-faint">
            {formatPercent(percentB, intlLocale)}
          </span>
          <span className="truncate text-ink">{names.partner_b}</span>
          <span aria-hidden="true" className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm bg-jade" />
        </span>
      </div>

      <p className="text-xs text-ink-faint">
        {s.spending.totalShared(money(balance.totalCents, balance.currency, true))}
      </p>
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
