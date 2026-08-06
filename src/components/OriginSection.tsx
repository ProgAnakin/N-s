import { Globe } from 'lucide-react';
import { SelectField } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Surface';
import { useCouple, useSession } from '@/data/session';
import { SUPPORTED_COUNTRIES } from '@/lib/holidays';
import { useStrings } from '@/i18n';

/**
 * Where each of you is from.
 *
 * The app used to know this by being written for one couple. Now it asks —
 * and it asks *each person separately*, because the whole reason the
 * cultural half of this app exists is that the two answers are different. A
 * single "our culture" field would erase exactly the thing it is for.
 *
 * Deliberately narrow: country and language, nothing else. It drives which
 * holidays get watched, and saying so plainly is what keeps it from reading
 * as demographic collection. There is a "rather not say", and choosing it
 * costs the reader nothing but the holiday list.
 */
export function OriginSection() {
  const s = useStrings();
  const { profile } = useCouple();
  const { partner, updateProfile } = useSession();

  const countryName = (code: string | null): string | null =>
    code ? (s.holidays.countries[code] ?? code) : null;

  const partnerName = partner?.display_name?.trim() || s.settings.partner;
  const partnerCountry = countryName(partner?.home_country ?? null);

  return (
    <section>
      <h2 className="label-kicker mb-3">{s.settings.origin}</h2>
      <Sheet className="flex flex-col gap-4 p-5">
        <SelectField
          label={s.settings.homeCountry}
          value={profile.home_country ?? ''}
          onChange={(event) =>
            void updateProfile({ home_country: event.target.value || null })
          }
          hint={s.settings.originHint}
        >
          <option value="">{s.settings.homeCountryNone}</option>
          {SUPPORTED_COUNTRIES.map((code) => (
            <option key={code} value={code}>
              {s.holidays.countries[code] ?? code}
            </option>
          ))}
        </SelectField>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={s.settings.nativeLanguage}
            value={profile.native_language ?? ''}
            onChange={(event) =>
              void updateProfile({ native_language: event.target.value || null })
            }
          >
            <option value="">{s.settings.homeCountryNone}</option>
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label={s.settings.sharedLanguage}
            value={profile.shared_language ?? ''}
            onChange={(event) =>
              void updateProfile({ shared_language: event.target.value || null })
            }
          >
            <option value="">{s.settings.homeCountryNone}</option>
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </SelectField>
        </div>

        <p className="text-xs leading-relaxed text-ink-faint">
          {s.settings.sharedLanguageHint}
        </p>

        {partner && (
          <div className="flex items-start gap-3 rounded-sm bg-sunk p-3">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            <p className="text-sm text-ink-soft">
              {partnerCountry
                ? s.settings.partnerOrigin(partnerName, partnerCountry)
                : s.settings.partnerOriginUnset(partnerName)}
            </p>
          </div>
        )}
      </Sheet>
    </section>
  );
}

/**
 * Languages offered, in their own names.
 *
 * A short list rather than all 180 ISO codes: a select nobody can scroll is
 * worse than a select that occasionally lacks somebody's language, and the
 * column accepts any two-letter code if this ever needs to grow.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  it: 'Italiano',
  fr: 'Français',
  de: 'Deutsch',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  nl: 'Nederlands',
  pl: 'Polski',
  tr: 'Türkçe',
};

const LANGUAGES = Object.keys(LANGUAGE_NAMES);
