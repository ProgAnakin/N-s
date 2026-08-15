import { useMemo, useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useSession } from '@/data/session';
import { useTable, type Table, type UseTableOptions } from '@/data/useTable';
import type { CurrencyColumn, TableName } from '@/data/database.types';
import { today, type CalendarDate } from '@/lib/calendar';
import { describeCountdown } from '@/lib/dates';
import { formatMoney, type PartnerRole } from '@/lib/money';
import { useI18n, useStrings } from '@/i18n';

/** Everything shared is scoped by couple. This saves repeating that everywhere. */
export function useCoupleTable<T extends TableName>(
  table: T,
  options: Omit<UseTableOptions, 'column' | 'value'> & { coupleId: string },
): Table<T> {
  const { coupleId, ...rest } = options;
  return useTable(table, { column: 'couple_id', value: coupleId, ...rest });
}

/** Today, recomputed only when the calendar day actually changes. */
export function useToday(): CalendarDate {
  const iso = new Date().toDateString();
  // `iso` is the cache key, not an input — that is the entire trick. It
  // changes at midnight and at no other time, so `today()` is recomputed
  // exactly when the answer can have changed and never on an ordinary
  // re-render. The rule cannot see a dependency that is deliberately not
  // read, so it is told here rather than obeyed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => today(), [iso]);
}

export interface PartnerNames {
  partner_a: string;
  partner_b: string;
  /** Which role the signed-in person holds. */
  me: PartnerRole;
  /** The other person's name, or a neutral fallback before they join. */
  partnerName: string;
  myName: string;
  hasPartner: boolean;
}

/**
 * Display names keyed by role.
 *
 * Partner A and B are storage labels; the UI shows names. Before the second
 * person joins there is no name to show, so the fallback is deliberately
 * neutral rather than a placeholder that looks like a real person.
 */
export function usePartnerNames(): PartnerNames {
  const { profile, partner } = useSession();
  const s = useStrings();

  const me: PartnerRole = profile?.role ?? 'partner_a';
  const myName = profile?.display_name?.trim() || s.settings.you;
  const partnerName = partner?.display_name?.trim() || s.settings.partner;

  const byRole: Record<PartnerRole, string> =
    me === 'partner_a'
      ? { partner_a: myName, partner_b: partnerName }
      : { partner_a: partnerName, partner_b: myName };

  return { ...byRole, me, myName, partnerName, hasPartner: Boolean(partner) };
}

/**
 * Which of the two wrote a row, by their user id.
 *
 * Rows carry `created_by` as a bare uuid, which is useless on screen. This
 * resolves it against the two profiles the session already holds, and
 * returns null for anything it cannot place — a row written before the
 * column existed, or by an account no longer in the couple. Null means
 * "say nothing", never "it was the other one".
 */
export function useRoleOf(): (userId: string | null | undefined) => PartnerRole | null {
  const { profile, partner } = useSession();
  return (userId) => {
    if (!userId) return null;
    if (profile && userId === profile.id) return profile.role;
    if (partner && userId === partner.id) return partner.role;
    return null;
  };
}

/** Money formatted in the reader's locale. */
export function useMoney(): (cents: number, currency: CurrencyColumn, compactWhole?: boolean) => string {
  const { intlLocale } = useI18n();
  return (cents, currency, compactWhole = false) =>
    formatMoney(cents, currency, { locale: intlLocale, compactWhole });
}

/**
 * Edit and delete, with the confirmation built in.
 *
 * Deleting a memory or a note about someone should always cost one extra tap:
 * these are not rows in a spreadsheet.
 */
export function RecordActions({
  onEdit,
  onDelete,
  confirmTitle,
  confirmBody,
  editLabel,
  deleteLabel,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  confirmTitle?: string;
  confirmBody?: string;
  editLabel?: string;
  deleteLabel?: string;
}) {
  const s = useStrings();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <div className="flex shrink-0 items-center gap-0.5">
        {onEdit && (
          <IconButton label={editLabel ?? s.common.edit} onClick={onEdit}>
            <Pencil />
          </IconButton>
        )}
        {onDelete && (
          <IconButton label={deleteLabel ?? s.common.delete} onClick={() => setConfirming(true)}>
            <Trash2 />
          </IconButton>
        )}
      </div>

      {onDelete && (
        <ConfirmDialog
          open={confirming}
          title={confirmTitle ?? s.common.confirmDelete}
          body={confirmBody ?? s.common.confirmDeleteBody}
          confirmLabel={s.common.delete}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onDelete();
          }}
        />
      )}
    </>
  );
}

/**
 * Turns a day count into words. Every screen that shows a countdown uses
 * this, so "in 9 days" is phrased identically everywhere.
 */
export function useCountdown(): (days: number) => string {
  const s = useStrings();
  return (days: number) => {
    const countdown = describeCountdown(days);
    switch (countdown.kind) {
      case 'today':
        return s.countdown.today;
      case 'tomorrow':
        return s.countdown.tomorrow;
      case 'yesterday':
        return s.countdown.yesterday;
      case 'inDays':
        return s.countdown.inDays(countdown.days);
      case 'inWeeks':
        return s.countdown.inWeeks(countdown.weeks);
      case 'daysAgo':
        return s.countdown.daysAgo(countdown.days);
    }
  };
}

/** A row of filter chips with an "all" option in front. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {children}
    </div>
  );
}
