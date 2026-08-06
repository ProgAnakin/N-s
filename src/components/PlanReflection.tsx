import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { TextField } from '@/components/ui/Field';
import type { PlanRow } from '@/data/database.types';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/**
 * Asking how it went.
 *
 * The calendar recorded intentions and never outcomes, so a year of dates
 * taught the app nothing — and every "shall we do that again?" suggestion
 * was built on a column nothing wrote to. This is the way in.
 *
 * Two decisions, both about not making an evening with somebody feel like
 * an assignment.
 *
 * It is a **thumb, not five stars.** Rating a night out with your partner
 * out of five is a strange thing to be asked, and the extra precision buys
 * nothing: "again" or "not again" is the whole signal, and it is also the
 * only thing a suggestion could ever act on.
 *
 * It appears **only after the day has passed**, and it never nags. An
 * unanswered plan stays unanswered forever with no badge, no count, and no
 * reminder. Somebody who does not want to journal their relationship should
 * be able to simply not, and still have the rest of the app work.
 */
export function PlanReflection({
  plan,
  isPast,
  onChange,
}: {
  plan: PlanRow;
  /** The day has been and gone. Before that there is nothing to ask about. */
  isPast: boolean;
  onChange: (values: Partial<Pick<PlanRow, 'went_well' | 'reflection'>>) => void;
}) {
  const s = useStrings();
  const answered = plan.went_well !== null && plan.went_well !== undefined;
  const [note, setNote] = useState(plan.reflection ?? '');

  if (!isPast) return null;

  return (
    <div className="mt-3 border-t border-rule pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-faint">
          {answered ? s.calendar.reflectionAsked : s.calendar.reflectionPrompt}
        </span>

        <div className="flex items-center gap-1.5">
          <ReflectionButton
            pressed={plan.went_well === true}
            label={s.calendar.wentWellYes}
            icon={ThumbsUp}
            tone="jade"
            // Tapping the answer already given clears it. Somebody who
            // pressed the wrong one should not have to live with it.
            onClick={() => onChange({ went_well: plan.went_well === true ? null : true })}
          />
          <ReflectionButton
            pressed={plan.went_well === false}
            label={s.calendar.wentWellNo}
            icon={ThumbsDown}
            tone="ink"
            onClick={() => onChange({ went_well: plan.went_well === false ? null : false })}
          />
        </div>
      </div>

      {/* The note only appears once there is an opinion to attach it to.
          A blank text box under every past evening is a page of homework. */}
      {answered && (
        <div className="mt-2">
          <TextField
            label={s.calendar.reflectionNote}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => onChange({ reflection: note.trim() || null })}
            placeholder={s.calendar.reflectionPlaceholder}
            optional
          />
        </div>
      )}
    </div>
  );
}

function ReflectionButton({
  pressed,
  label,
  icon: Icon,
  tone,
  onClick,
}: {
  pressed: boolean;
  label: string;
  icon: typeof ThumbsUp;
  tone: 'jade' | 'ink';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs transition-colors',
        pressed && tone === 'jade' && 'border-jade bg-jade/12 text-jade',
        pressed && tone === 'ink' && 'border-ink-faint bg-sunk text-ink-soft',
        !pressed && 'border-rule text-ink-faint hover:border-ink-faint hover:text-ink',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
