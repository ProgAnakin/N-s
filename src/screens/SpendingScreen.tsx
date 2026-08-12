import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Scale } from 'lucide-react';
import { RebalanceNote, ShareBar, TreatsNote } from '@/components/Balance';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Bits';
import { ChoiceField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader, Rule, SectionHeading, Sheet } from '@/components/ui/Surface';
import { useCouple } from '@/data/session';
import { toExpenses } from '@/data/mappers';
import type {
  CurrencyColumn,
  ExpenseCategoryColumn,
  ExpenseRow,
  PartnerRoleColumn,
  SplitRuleColumn,
} from '@/data/database.types';
import { parseISODate, toISODate } from '@/lib/calendar';
import { formatDate } from '@/lib/dates';
import {
  CURRENCIES,
  CURRENCY_SYMBOLS,
  EXPENSE_CATEGORIES,
  centsToInputValue,
  computeConvertedBalance,
  costRatio,
  parseAmountToCents,
  shareOf,
  totalsByCategory,
  type Expense,
} from '@/lib/money';
import { convertAll, convertExpense, type ConversionBasis, type RateBook } from '@/lib/fx';
import { captureRatesOn, rateBook } from '@/data/rates';
import { useI18n, useStrings } from '@/i18n';
import { RecordActions, useCoupleTable, useMoney, usePartnerNames, useToday } from './shared';
import { cn } from '@/utils/cn';

interface Draft {
  id: string | null;
  label: string;
  amount: string;
  currency: CurrencyColumn;
  paidBy: PartnerRoleColumn;
  date: string;
  category: ExpenseCategoryColumn;
  splitRule: SplitRuleColumn;
  partnerAPercent: number;
  tripId: string;
  note: string;
}

/**
 * Spending.
 *
 * The rules this screen keeps, without exception:
 *
 *   - No debt language anywhere. Nobody owes anybody. The strongest statement
 *     the page will make is a suggestion about who might pay next.
 *   - Treats are visible but excluded from the balance. A gift is a gift.
 *   - Currencies fold into one, using the rate each expense was written down
 *     at. They used to be shown side by side, which was honest and useless:
 *     a euro rent and a yuan dinner are the same shared life, and two bars
 *     reading "100% one of you" and "100% the other" answer no question.
 *     What is never done is recomputing an old expense at today's rate —
 *     see fx.ts.
 *   - **Nothing is left out of the total.** An expense with no snapshot used
 *     to sit outside it behind a button somebody had to find and press, and
 *     the page said so in small grey text under the one number it exists to
 *     give. That is a total that isn't the total. Now the rate for the day
 *     it actually happened is fetched quietly in the background, and until
 *     it lands the expense counts at today's rate and every place it appears
 *     says "about".
 *   - Every figure comes from a tested function in /src/lib/money.ts. This
 *     file does no arithmetic of its own.
 */
const VIEW_CURRENCY_KEY = 'nos.spending.currency';

function readViewCurrency(): CurrencyColumn | null {
  try {
    const stored = window.localStorage.getItem(VIEW_CURRENCY_KEY);
    return CURRENCIES.includes(stored as CurrencyColumn) ? (stored as CurrencyColumn) : null;
  } catch {
    return null;
  }
}

function writeViewCurrency(currency: CurrencyColumn): void {
  try {
    window.localStorage.setItem(VIEW_CURRENCY_KEY, currency);
  } catch {
    // Falling back to the couple's currency next time is no great loss.
  }
}

/**
 * Expenses restated in one currency, for the category breakdown.
 *
 * `totalsByCategory` filters by currency the way the rest of the old model
 * did, so it needs everything already speaking the same one.
 */
function convertedForCategories(
  expenses: readonly Expense[],
  to: CurrencyColumn,
  fallback: RateBook,
): Expense[] {
  return convertAll(
    expenses.map((expense) => ({ ...expense, fx: expense.fx ?? null })),
    to,
    fallback,
  ).converted.map(({ expense, cents }) => ({
    ...(expense as Expense),
    amountCents: cents,
    currency: to,
  }));
}

export function SpendingScreen() {
  const s = useStrings();
  const { intlLocale } = useI18n();
  const { couple, role } = useCouple();
  const names = usePartnerNames();
  const money = useMoney();
  const today = useToday();

  const expenses = useCoupleTable('expenses', {
    coupleId: couple.id,
    orderBy: 'date',
    ascending: false,
  });
  const trips = useCoupleTable('trips', { coupleId: couple.id, orderBy: 'start_date' });

  /**
   * Gives every expense the rate it should have had, quietly.
   *
   * This used to be a button reading "use today's rate for those", which was
   * wrong twice over. It asked somebody to notice a line of grey text and
   * act on it before their own total meant anything; and what it offered was
   * today's rate for a dinner three months ago, which is not that dinner's
   * value in any sense a person would recognise.
   *
   * The provider answers for a date, so the right rate is available and was
   * simply never asked for. An expense from March gets March's rate, and
   * nobody has to know that any of this happened.
   *
   * Ids are marked before the fetch, not after: one attempt each per visit.
   * A failure means the network is down, so the loop stops rather than
   * grinding through fifty rows to fail fifty times — the next visit picks
   * up where it left off, and meanwhile `book` keeps them all in the total.
   */
  const repaired = useRef(new Set<string>());
  useEffect(() => {
    const missing = expenses.rows.filter(
      (row) => !row.fx && !repaired.current.has(row.id),
    );
    if (missing.length === 0) return;

    let live = true;
    void (async () => {
      for (const row of missing) {
        if (!live) return;
        repaired.current.add(row.id);
        const captured = await captureRatesOn(row.currency, row.date);
        if (!live) return;
        if (!captured) return;
        await expenses.update(row.id, { fx: captured.fx, fx_on: captured.on });
      }
    })();

    return () => {
      live = false;
    };
  }, [expenses.rows, expenses.update]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [showPhilosophy, setShowPhilosophy] = useState(false);

  // Which currency the reader is thinking in. Theirs alone, and remembered:
  // it is a way of looking at the page, not a fact about the couple, and the
  // two of them may well think in different ones.
  const [viewCurrency, setViewCurrency] = useState<CurrencyColumn>(
    () => readViewCurrency() ?? couple.currency,
  );
  useEffect(() => {
    writeViewCurrency(viewCurrency);
  }, [viewCurrency]);

  /**
   * Today's rates, for expenses that have none of their own.
   *
   * Fetched once when the page opens, and used only as a stand-in. It is the
   * difference between a total that is approximately right about everything
   * and one that is exactly right about some of it — and on a page whose
   * entire job is a single number, the first is the honest one.
   */
  const [book, setBook] = useState<RateBook>({});
  useEffect(() => {
    let live = true;
    void rateBook().then((fetched) => {
      if (live) setBook(fetched);
    });
    return () => {
      live = false;
    };
  }, []);

  const domain = useMemo(() => toExpenses(expenses.rows), [expenses.rows]);
  const { balance, estimated, unconvertible } = useMemo(
    () => computeConvertedBalance(domain, viewCurrency, book),
    [domain, viewCurrency, book],
  );
  const categories = useMemo(
    () => totalsByCategory(convertedForCategories(domain, viewCurrency, book), viewCurrency),
    [domain, viewCurrency, book],
  );

  /**
   * What each expense counts as in the currency being read, by id.
   *
   * The history used to show only the amount as it was paid, which is the
   * honest number and answers the wrong question: with four currencies in
   * play, a list of ¥, R$ and € tells you nothing about which evening was
   * the expensive one. Both are shown now — what was handed over, and what
   * it weighs in the total — and an expense with no rate says so in place
   * of the second figure rather than being quietly left out of the maths
   * with nothing on its own row to admit it.
   */
  const inViewCurrency = useMemo(() => {
    const byId = new Map<string, { cents: number; basis: ConversionBasis } | null>();
    for (const expense of domain) {
      const result = convertExpense({ ...expense, fx: expense.fx ?? null }, viewCurrency, book);
      byId.set(expense.id, result && result.basis !== 'same' ? result : null);
    }
    return byId;
  }, [domain, viewCurrency, book]);

  const categoryTotal = categories.reduce((sum, entry) => sum + entry.totalCents, 0);

  function startNew() {
    setDraft({
      id: null,
      label: '',
      amount: '',
      currency: couple.currency,
      paidBy: role,
      date: toISODate(today),
      category: 'food',
      splitRule: '50_50',
      partnerAPercent: 50,
      tripId: '',
      note: '',
    });
    setAmountError(null);
  }

  function startEdit(row: ExpenseRow) {
    setDraft({
      id: row.id,
      label: row.label,
      amount: centsToInputValue(row.amount_cents),
      currency: row.currency,
      paidBy: row.paid_by,
      date: row.date,
      category: row.category,
      splitRule: row.split_rule,
      partnerAPercent: row.partner_a_percent ?? 50,
      tripId: row.trip_id ?? '',
      note: row.note ?? '',
    });
    setAmountError(null);
  }

  async function onSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!draft || !draft.label.trim()) return;

    const cents = parseAmountToCents(draft.amount);
    if (cents === null || cents <= 0) {
      setAmountError(draft.amount.trim() ? s.errors.amountInvalid : s.errors.amountRequired);
      return;
    }

    setSaving(true);
    const values = {
      label: draft.label.trim(),
      amount_cents: cents,
      currency: draft.currency,
      paid_by: draft.paidBy,
      date: draft.date,
      category: draft.category,
      split_rule: draft.splitRule,
      partner_a_percent: draft.splitRule === 'custom_pct' ? draft.partnerAPercent : null,
      trip_id: draft.tripId || null,
      note: draft.note.trim() || null,
    };
    /**
     * Frozen once, at the rate of the day the expense is dated.
     *
     * The `needsRates` test is the whole point. Re-capturing on every save
     * meant that correcting a typo in a year-old label quietly restated it
     * at today's rate — the exact drift fx.ts exists to prevent, arrived at
     * through the edit button instead of through arithmetic. A rate is
     * captured for a new expense, for one that never got a rate, and for
     * one whose currency has actually changed. Nothing else.
     *
     * `draft.date`, not today: somebody catching up on last week's dinners
     * on a Sunday evening should get each dinner's own rate, and the date
     * they typed is the only thing that knows which day that was. For an
     * expense dated today the two are the same request anyway.
     *
     * A capture that fails is an ordinary state rather than a failure to
     * report: the expense saves either way, the stand-in keeps it in the
     * total, and the repair upstairs tries again on the next visit.
     */
    const existing = draft.id ? expenses.rows.find((row) => row.id === draft.id) : undefined;
    const needsRates =
      !draft.id || !existing?.fx || existing.currency !== draft.currency;

    const captured = needsRates ? await captureRatesOn(draft.currency, draft.date) : null;
    const withRates = captured
      ? { ...values, fx: captured.fx, fx_on: captured.on }
      : values;

    if (draft.id) await expenses.update(draft.id, withRates);
    else await expenses.create({ ...withRates, couple_id: couple.id });
    setSaving(false);
    setDraft(null);
  }

  return (
    <div>
      <PageHeader
        kicker={s.nav.spending}
        title={s.spending.title}
        subtitle={s.spending.philosophy}
        actions={
          <Button variant="primary" onClick={startNew}>
            <Plus className="h-4 w-4" />
            {s.common.add}
          </Button>
        }
      />

      <button
        type="button"
        onClick={() => setShowPhilosophy((current) => !current)}
        className="-mt-3 mb-7 rounded-sm text-sm text-cinnabar underline-offset-4 hover:underline"
        aria-expanded={showPhilosophy}
      >
        {showPhilosophy ? s.common.less : s.common.more}
      </button>
      {showPhilosophy && (
        <p className="-mt-5 mb-7 max-w-column text-pretty text-sm leading-relaxed text-ink-soft">
          {s.spending.philosophyMore}
        </p>
      )}

      {/* --- One balance, in whichever currency you think in ---------------- */}
      <div className="flex flex-col gap-4">
        <Sheet className="p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="label-kicker">{s.spending.balanceTitle}</h2>
            {/* Not a Tag any more: it used to be a label saying which
                currency this card happened to be, and it is now the control
                that decides. */}
            <div className="flex items-center gap-1">
              {CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={viewCurrency === code}
                  onClick={() => setViewCurrency(code)}
                  className={cn(
                    'rounded-sm px-2 py-1 text-xs font-medium transition-colors',
                    viewCurrency === code
                      ? 'bg-stamp text-on-stamp'
                      : 'text-ink-faint hover:bg-sunk hover:text-ink',
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
          <ShareBar balance={balance} names={names} />

          <p className="mt-5 text-xs leading-relaxed text-ink-faint">
            {s.spending.frozenNote}
          </p>

          {estimated.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              {s.spending.estimatedNote(estimated.length)}
            </p>
          )}

          {unconvertible.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              {s.spending.notConverted(unconvertible.length)}
            </p>
          )}

          <Rule className="my-5" />
          <RebalanceNote balance={balance} names={names} />
          {(balance.treatedCents.partner_a > 0 || balance.treatedCents.partner_b > 0) && (
            <>
              <Rule className="my-5" />
              <TreatsNote balance={balance} names={names} />
            </>
          )}
        </Sheet>
      </div>

      {/* --- Where it goes --------------------------------------------------- */}
      {categories.length > 0 && (
        <section className="mt-9">
          <SectionHeading>{s.spending.byCategory}</SectionHeading>
          <ul className="flex flex-col gap-2">
            {categories.map((entry) => {
              const percent = categoryTotal > 0 ? (entry.totalCents / categoryTotal) * 100 : 0;
              return (
                <li key={entry.category} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-sm text-ink-soft">
                    {s.expenseCategories[entry.category]}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk">
                    <span
                      className="block h-full rounded-full bg-cinnabar/70"
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  {/* `viewCurrency`, not the couple's. These totals were
                      converted into whatever the reader is thinking in, and
                      labelling them with the couple's currency put a euro
                      sign in front of a number of yuan. */}
                  <span className="shrink-0 text-sm tabular-nums text-ink-faint">
                    {money(entry.totalCents, viewCurrency, true)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* --- History ---------------------------------------------------------- */}
      <section className="mt-9">
        <SectionHeading>{s.spending.history}</SectionHeading>

        {expenses.rows.length === 0 ? (
          <EmptyState
            icon={<Scale />}
            title={s.spending.emptyTitle}
            body={s.spending.emptyBody}
            action={
              <Button variant="primary" onClick={startNew}>
                {s.spending.add}
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col">
            {expenses.rows.map((row) => {
              const date = parseISODate(row.date);
              return (
                <li
                  key={row.id}
                  className="flex items-center gap-3 border-b border-rule py-3 last:border-0"
                >
                  {/* Both colours, in the proportion the cost actually
                      falls. A row split down the middle is drawn half and
                      half — that is what "shared" looks like, and it is
                      the thing the flat payer-coloured stripe was getting
                      wrong: it said "his" beside a badge saying €50 each.
                      A treat stays solid, because a treat really is
                      one-sided. */}
                  <span
                    aria-hidden="true"
                    className="h-6 w-[3px] shrink-0 overflow-hidden rounded-full bg-jade"
                  >
                    <span
                      className="block w-full bg-cinnabar"
                      style={{
                        height: `${costRatio(
                          row.amount_cents,
                          {
                            kind: row.split_rule,
                            partnerAPercent: row.partner_a_percent ?? undefined,
                          },
                          row.paid_by,
                        )}%`,
                      }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base text-ink">{row.label}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                      <span>{names[row.paid_by]}</span>
                      {date && <span>{formatDate(date, 'medium', intlLocale)}</span>}
                      <span>{s.expenseCategories[row.category]}</span>
                      {row.split_rule === 'treat' && (
                        <Tag tone="jade">{s.spending.treatBadge}</Tag>
                      )}
                      {/* On every shared row, not just the custom ones. The
                          question "how much of this one was mine" is the
                          same question whatever rule produced it, and the
                          row already knows the amount — leaving the reader
                          to halve it themselves was work for nothing. In
                          money, never a bare percentage. */}
                      {row.split_rule !== 'treat' &&
                        (() => {
                          const share = shareOf(
                            row.amount_cents,
                            {
                              kind: row.split_rule,
                              partnerAPercent: row.partner_a_percent ?? undefined,
                            },
                            row.paid_by,
                          );
                          const even = share.partner_a === share.partner_b;
                          return (
                            <span className="text-ink-faint">
                              {even
                                ? s.spending.splitEach(money(share.partner_a, row.currency))
                                : s.spending.splitBadge(
                                    names.partner_a,
                                    money(share.partner_a, row.currency),
                                    names.partner_b,
                                    money(share.partner_b, row.currency),
                                  )}
                            </span>
                          );
                        })()}
                      {/* Not a lock, a record. Either partner may correct a
                          mis-tapped entry — that is legitimate — but the
                          balance is the one number this page makes claims
                          about, and a claim that can change in silence is
                          worth less than one that cannot. */}
                      {row.edited_at && (
                        <span className="text-ink-faint/80">{s.spending.edited}</span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-base tabular-nums text-ink">
                      {money(row.amount_cents, row.currency)}
                    </span>
                    {/* Three outcomes, and the row says which. A frozen rate
                        reads plainly; a stand-in says "about", because a
                        number that hedges is worth more than one that looks
                        settled and isn't; and the rare row with no rate at
                        all says it is still waiting rather than pretending
                        to be excluded on purpose. */}
                    {row.currency !== viewCurrency &&
                      (() => {
                        const shown = inViewCurrency.get(row.id);
                        if (!shown) {
                          return (
                            <span className="block text-[11px] text-cinnabar">
                              {s.spending.noRateRow}
                            </span>
                          );
                        }
                        const amount = money(shown.cents, viewCurrency);
                        return (
                          <span className="block text-[11px] tabular-nums text-ink-faint">
                            {shown.basis === 'estimated'
                              ? s.spending.countsAsAbout(amount)
                              : s.spending.countsAs(amount)}
                          </span>
                        );
                      })()}
                  </span>
                  <RecordActions
                    onEdit={() => startEdit(row)}
                    onDelete={() => void expenses.remove(row.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* --- Editor ------------------------------------------------------------ */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? s.spending.edit : s.spending.add}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{s.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={saving || !draft?.label.trim()}
            >
              {saving ? s.common.saving : s.common.save}
            </Button>
          </>
        }
      >
        {draft && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
            <TextField
              label={s.spending.label}
              placeholder={s.spending.labelPlaceholder}
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              required
            />

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <TextField
                label={s.spending.amount}
                inputMode="decimal"
                placeholder="0.00"
                value={draft.amount}
                onChange={(event) => {
                  setDraft({ ...draft, amount: event.target.value });
                  setAmountError(null);
                }}
                error={amountError}
                required
              />
              <SelectField
                label={s.spending.currency}
                value={draft.currency}
                onChange={(event) =>
                  setDraft({ ...draft, currency: event.target.value as CurrencyColumn })
                }
                className="w-28"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_SYMBOLS[code]} {code}
                  </option>
                ))}
              </SelectField>
            </div>

            <ChoiceField
              label={s.spending.paidBy}
              value={draft.paidBy}
              onChange={(paidBy) => setDraft({ ...draft, paidBy })}
              options={[
                { value: 'partner_a' as PartnerRoleColumn, label: names.partner_a },
                { value: 'partner_b' as PartnerRoleColumn, label: names.partner_b },
              ]}
            />

            <ChoiceField
              label={s.spending.splitRule}
              value={draft.splitRule}
              onChange={(splitRule) => setDraft({ ...draft, splitRule })}
              options={[
                {
                  value: '50_50' as SplitRuleColumn,
                  label: s.splitRules['50_50'],
                  hint: s.splitRules['50_50Hint'],
                },
                {
                  value: 'custom_pct' as SplitRuleColumn,
                  label: s.splitRules.custom_pct,
                  hint: s.splitRules.custom_pctHint,
                },
                {
                  value: 'treat' as SplitRuleColumn,
                  label: s.splitRules.treat,
                  hint: s.splitRules.treatHint,
                },
              ]}
            />

            {draft.splitRule === 'custom_pct' && (
              <div className="flex flex-col gap-2 rounded-sm border border-rule bg-sunk/60 p-3">
                <label
                  htmlFor="split-percent"
                  className="text-sm font-medium text-ink"
                >
                  {s.spending.customPercent}
                </label>
                <input
                  id="split-percent"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draft.partnerAPercent}
                  onChange={(event) =>
                    setDraft({ ...draft, partnerAPercent: Number(event.target.value) })
                  }
                  className="w-full accent-[hsl(var(--cinnabar))]"
                />
                <p className="text-xs text-ink-soft">
                  {s.spending.customPercentHint(
                    names.partner_a,
                    draft.partnerAPercent,
                    names.partner_b,
                    100 - draft.partnerAPercent,
                  )}
                </p>
              </div>
            )}

            <TextField
              label={s.spending.date}
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              required
            />

            <SelectField
              label={s.spending.category}
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value as ExpenseCategoryColumn })
              }
            >
              {EXPENSE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {s.expenseCategories[value]}
                </option>
              ))}
            </SelectField>

            {trips.rows.length > 0 && (
              <SelectField
                label={s.spending.trip}
                value={draft.tripId}
                onChange={(event) => setDraft({ ...draft, tripId: event.target.value })}
                optional
              >
                <option value="">{s.spending.noTrip}</option>
                {trips.rows.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.destination}
                  </option>
                ))}
              </SelectField>
            )}

            <TextAreaField
              label={s.spending.note}
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              rows={2}
              optional
            />

            {/* The amount field shows this error itself, right under the
                offending input. Repeating it at the foot of the form drew it
                twice and announced it twice, and the copy at the bottom is
                the one further from the thing that needs fixing. */}
          </form>
        )}
      </Modal>
    </div>
  );
}
