import { Check, X } from 'lucide-react';
import { Cover } from '@/components/layout/Cover';
import { configStatus } from '@/data/client';
import { useStrings } from '@/i18n';

/**
 * Shown when the app has no Supabase credentials.
 *
 * This is the most likely first-run state, so rather than repeating generic
 * instructions it reports what the build actually received. "I saved the
 * variables" and "the variables are in the bundle" are different facts —
 * `VITE_*` values are inlined at build time — and the gap between them is the
 * usual reason someone is stuck on this screen.
 */
export function NotConfiguredScreen() {
  const s = useStrings();

  return (
    <Cover title={s.errors.notConfigured} subtitle={s.errors.notConfiguredBody}>
      <div className="flex flex-col gap-4">
        <div className="sheet p-5">
          <p className="label-kicker mb-3">{s.errors.notConfiguredSaw}</p>
          <dl className="flex flex-col gap-3">
            <EnvRow
              name="VITE_SUPABASE_URL"
              found={Boolean(configStatus.url)}
              detail={configStatus.url ?? s.errors.notConfiguredMissing}
            />
            <EnvRow
              name="VITE_SUPABASE_ANON_KEY"
              found={configStatus.anonKeyPresent}
              detail={
                configStatus.anonKeyPresent
                  ? s.errors.notConfiguredKeyFound(
                      configStatus.anonKeyLength,
                      configStatus.anonKeyPrefix ?? '',
                    )
                  : s.errors.notConfiguredMissing
              }
            />
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-ink-faint">
            {s.errors.notConfiguredNames}
          </p>
        </div>

        <div className="sheet p-5">
          <h2 className="mb-1.5 font-display text-base font-medium text-ink">
            {s.errors.notConfiguredHosted}
          </h2>
          <p className="text-pretty text-sm leading-relaxed text-ink-soft">
            {s.errors.notConfiguredHostedBody}
          </p>
        </div>

        <div className="sheet p-5">
          <h2 className="mb-1.5 font-display text-base font-medium text-ink">
            {s.errors.notConfiguredLocal}
          </h2>
          <p className="mb-3 text-pretty text-sm leading-relaxed text-ink-soft">
            {s.errors.notConfiguredLocalBody}
          </p>
          <pre className="overflow-x-auto rounded-sm bg-sunk px-3 py-2 font-mono text-xs text-ink">
            cp .env.example .env
          </pre>
        </div>

        <p className="px-1 text-xs leading-relaxed text-ink-faint">
          {s.errors.notConfiguredWhere}
        </p>
      </div>
    </Cover>
  );
}

function EnvRow({
  name,
  found,
  detail,
}: {
  name: string;
  found: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={
          found
            ? 'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-stamp-jade text-on-stamp'
            : 'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-cinnabar text-on-stamp'
        }
      >
        {found ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
      </span>
      <div className="min-w-0">
        <dt className="break-all font-mono text-xs text-ink">{name}</dt>
        <dd
          className={
            found
              ? 'mt-0.5 break-all font-mono text-xs text-ink-soft'
              : 'mt-0.5 font-mono text-xs text-cinnabar'
          }
        >
          {detail}
        </dd>
      </div>
    </div>
  );
}
