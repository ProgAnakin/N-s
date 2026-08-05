import { Cover } from '@/components/layout/Cover';
import { useStrings } from '@/i18n';

/**
 * Shown when the app has no Supabase credentials.
 *
 * This is the most likely first-run state, so it gets a real screen with the
 * exact commands rather than a console error nobody will look at.
 */
export function NotConfiguredScreen() {
  const s = useStrings();

  return (
    <Cover title={s.errors.notConfigured} subtitle={s.errors.notConfiguredBody}>
      <div className="sheet p-5">
        <ol className="flex flex-col gap-4 text-sm text-ink-soft">
          <li>
            <p className="mb-1.5 font-medium text-ink">1. Copy the example env file</p>
            <pre className="overflow-x-auto rounded-sm bg-sunk px-3 py-2 font-mono text-xs text-ink">
              cp .env.example .env
            </pre>
          </li>
          <li>
            <p className="mb-1.5 font-medium text-ink">2. Fill in your project details</p>
            <p className="leading-relaxed">
              Both values are in your Supabase dashboard under Project Settings → API.
            </p>
          </li>
          <li>
            <p className="mb-1.5 font-medium text-ink">3. Run the migrations</p>
            <p className="leading-relaxed">
              Paste each file in <span className="font-mono text-xs">supabase/migrations/</span> into
              the SQL editor, in order.
            </p>
          </li>
          <li>
            <p className="mb-1.5 font-medium text-ink">4. Restart the dev server</p>
            <pre className="overflow-x-auto rounded-sm bg-sunk px-3 py-2 font-mono text-xs text-ink">
              npm run dev
            </pre>
          </li>
        </ol>
      </div>
    </Cover>
  );
}
