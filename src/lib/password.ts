/**
 * Whether a password is one somebody would guess first.
 *
 * Supabase sells this as "prevent use of leaked passwords" on the paid
 * plan, where it checks each new password against Have I Been Pwned. This
 * is the free-plan equivalent, and it is deliberately *not* a call to that
 * API — an app whose whole argument is that little leaves the device
 * should not send even a hash prefix of somebody's password to a third
 * party in order to prove it is careful. It also has to work on the train.
 *
 * What it does instead:
 *
 *   1. **Normalises first.** "Password123!" and "p@ssword" both reduce to
 *      "password", so a list of a few hundred entries covers the tens of
 *      thousands of variations people actually type. This is where nearly
 *      all the coverage comes from.
 *   2. **Catches shapes, not just strings.** A run up the keyboard or the
 *      number row is weak at any length, and no list can hold them all.
 *   3. **Catches the person.** Their own name or the front of their email
 *      is the first thing anyone who knows them would try, and it is
 *      different for every user, so no list can hold that either.
 *
 * It cannot catch everything and does not pretend to. It catches what an
 * attacker tries in the first ten thousand guesses, which is what the
 * paid feature is really for.
 *
 * Pure and framework-agnostic, like everything else in /src/lib.
 */

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordProblem =
  /** Fewer than `MIN_PASSWORD_LENGTH` characters. */
  | 'too_short'
  /** A run, a repeat, or otherwise a pattern rather than a choice. */
  | 'too_simple'
  /** On the list of passwords people actually pick. */
  | 'too_common'
  /** Their own name, or the front of their email address. */
  | 'looks_like_you';

/**
 * The ones people actually choose, normalised the way `reduce` normalises.
 *
 * Curated rather than exhaustive: the top of every breach corpus, plus the
 * Portuguese, Italian and Chinese entries that a list compiled from
 * English-speaking breaches would miss and that this couple in particular
 * would reach for.
 *
 * Everything here is already lowercase, already stripped of trailing
 * digits and punctuation, and already de-leeted — do not add an entry with
 * a number or a symbol in it, because `reduce` will have removed it before
 * the lookup and the entry will simply never match.
 */
const COMMON = new Set([
  // The perennial top of every list
  'password', 'passwort', 'qwerty', 'qwertyuiop', 'azerty', 'abc', 'letmein',
  'welcome', 'admin', 'login', 'guest', 'root', 'toor', 'changeme', 'secret',
  'test', 'testing', 'temp', 'default', 'user', 'pass', 'access', 'master',
  'dragon', 'monkey', 'shadow', 'sunshine', 'princess', 'football', 'baseball',
  'basketball', 'soccer', 'hockey', 'superman', 'batman', 'spiderman', 'starwars',
  'pokemon', 'trustno', 'whatever', 'freedom', 'hello', 'iloveyou', 'lovely',
  'loveme', 'flower', 'hottie', 'ninja', 'matrix', 'zxcvbnm', 'asdfghjkl',
  'asdf', 'qazwsx', 'qwe', 'zaq', 'poiuytrewq', 'mnbvcxz',

  // Names and things people name themselves after
  'michael', 'jennifer', 'jessica', 'michelle', 'nicole', 'ashley', 'chelsea',
  'daniel', 'thomas', 'robert', 'matthew', 'charlie', 'george', 'harley',
  'jordan', 'hunter', 'ranger', 'buster', 'tigger', 'maggie', 'pepper',
  'ginger', 'summer', 'silver', 'orange', 'purple', 'banana', 'chicken',
  'cookie', 'chocolate', 'computer', 'internet', 'samsung', 'google',
  'facebook', 'instagram', 'whatsapp', 'mustang', 'ferrari', 'porsche',
  'harleydavidson', 'corvette', 'yamaha', 'honda', 'diamond', 'phoenix',
  'cheese', 'coffee', 'guitar', 'music', 'money', 'happy', 'angel', 'baby',
  'kitty', 'puppy', 'panda', 'tiger', 'lion', 'eagle', 'falcon', 'wizard',
  'gandalf', 'legolas', 'skywalker', 'vader', 'jedi',

  // Portuguese and Brazilian
  'senha', 'segredo', 'amor', 'amoreterno', 'meuamor', 'saudade', 'brasil',
  'brazil', 'portugal', 'lisboa', 'porto', 'benfica', 'sporting', 'flamengo',
  'corinthians', 'palmeiras', 'saopaulo', 'santos', 'gremio', 'internacional',
  'cruzeiro', 'vasco', 'botafogo', 'fluminense', 'futebol', 'carnaval',
  'familia', 'coracao', 'felicidade', 'liberdade', 'obrigado', 'bomdia',
  'teamo', 'teadoro', 'princesa', 'gatinha', 'gostoso', 'cachorro',

  // Italian
  'ciao', 'amore', 'amoremio', 'tiamo', 'tiamotanto', 'bellissima', 'bella',
  'italia', 'roma', 'milano', 'napoli', 'juventus', 'juve', 'inter', 'milan',
  'lazio', 'firenze', 'venezia', 'famiglia', 'cuore', 'sole', 'stella',
  'segreto', 'password', 'calcio', 'pizza', 'pasta', 'nonna', 'tesoro',
  'piccola', 'gattina',

  // Chinese romanisations and the number-words behind them
  'woaini', 'woaininimeimei', 'wangyi', 'zhangwei', 'liwei', 'wangwei',
  'nihao', 'nihaoma', 'zhongguo', 'beijing', 'shanghai', 'shenzhen',
  'guangzhou', 'taobao', 'wechat', 'weixin', 'qqqq', 'baidu', 'xiaomi',
  'huawei', 'tencent', 'aiwo', 'baobei', 'meinv', 'shuaige', 'laopo',
  'laogong', 'xiaobao', 'wodeai',

  // The ones this app's own words would tempt
  'nosnos', 'together', 'forever', 'foreveryours', 'usforever', 'ourlove',
  'mylove', 'myheart', 'sweetheart', 'darling', 'honey', 'babe',
]);

/** Straight runs on the keyboard or the number row, forwards and back. */
const RUNS = [
  '01234567890',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'azertyuiop',
  'qwertzuiop',
];

/**
 * Letters people substitute for symbols and digits, so "p@ssw0rd" and
 * "l3tm31n" collapse onto the entries they are hiding behind.
 */
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't', '€': 'e', '£': 'l',
};

/**
 * The words somebody might actually have been thinking of.
 *
 * Two readings, not one, and the reason is a bug this function had on its
 * first outing: de-leeting before dropping the decoration turns
 * "Password1" into "passwordi", which is on no list anywhere. The digit
 * was padding, not a disguised letter, and there is no way to know which
 * from the character alone.
 *
 * So three readings are tried, and a hit on any of them is a hit:
 *
 *   - **plain** — digits and symbols are decoration, dropped. Catches
 *     "Password1", "sunshine2024", "Monkey_99".
 *   - **leet** — they stand in for letters. Catches "p@ssw0rd".
 *   - **trimmed leet** — decoration stripped from the ends *first*, then
 *     the interior de-leeted. Catches "l3tm31n99", where the "99" is
 *     padding and the "3" and "1" are not, which no single pass can tell
 *     apart from the characters alone.
 *
 * All three are lowercased and accent-stripped first, so "Coração"
 * reduces to "coracao" whichever way it is read.
 */
function reductions(raw: string): string[] {
  const lowered = raw
    .normalize('NFD')
    // \u0300–\u036f is the combining-marks block. Written as escapes
    // rather than as the characters themselves, which are invisible in
    // every editor and reviewable in none.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const deleet = (value: string) =>
    [...value]
      .map((char) => LEET[char] ?? char)
      .join('')
      .replace(/[^a-z]/g, '');

  const plain = lowered.replace(/[^a-z]/g, '');
  const trimmed = lowered.replace(/^[^a-z]+/, '').replace(/[^a-z]+$/, '');

  // `plain` first, always: `allDecoration` reads it by position.
  return [...new Set([plain, deleet(lowered), deleet(trimmed)])];
}

/**
 * Whether there was no word here at all — only digits and punctuation.
 *
 * Read off the plain reading specifically. The leet readings turn
 * "19980312" into a pronounceable-looking string, and treating that as a
 * word would let every birthday through.
 */
function allDecoration(readings: string[]): boolean {
  return (readings[0]?.length ?? 0) === 0;
}

/** The longest reading, for the checks that care about what is left. */
function reduce(raw: string): string {
  return reductions(raw).reduce(
    (longest, one) => (one.length > longest.length ? one : longest),
    '',
  );
}

/** Whether the string is a straight run through any of `RUNS`, either way. */
function isRun(value: string): boolean {
  if (value.length < 4) return false;
  const backwards = [...value].reverse().join('');
  return RUNS.some((run) => run.includes(value) || run.includes(backwards));
}

/** Whether every character is the same one. */
function isRepeat(value: string): boolean {
  return value.length > 0 && [...value].every((char) => char === value[0]);
}

/**
 * The first thing wrong with a password, or null if nothing is.
 *
 * One problem rather than a list, deliberately: a wall of complaints about
 * a password somebody is still typing is how people end up with
 * "Password1!" — a string that satisfies every rule and is on every list.
 *
 * `about` is what an attacker who knows them would try first. Both fields
 * are optional; sign-in does not need them and neither does a test.
 */
export function passwordProblem(
  password: string,
  about: { email?: string | null; name?: string | null } = {},
): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';

  const lowered = password.toLowerCase();
  if (isRepeat(password) || isRun(lowered)) return 'too_simple';

  const readings = reductions(password);
  // Nothing but digits and punctuation. "19980312" is a birthday, and a
  // birthday is the second thing anybody tries.
  if (allDecoration(readings)) return 'too_simple';
  if (readings.some((reading) => COMMON.has(reading))) return 'too_common';

  const core = reduce(password);

  // A doubled word — "amoramor", "abcabc" — is one word's worth of guessing.
  if (core.length % 2 === 0) {
    const half = core.slice(0, core.length / 2);
    if (half === core.slice(core.length / 2) && (COMMON.has(half) || half.length <= 4)) {
      return 'too_common';
    }
  }

  const local = reduce((about.email ?? '').split('@')[0] ?? '');
  const name = reduce(about.name ?? '');
  for (const personal of [local, name]) {
    // Three characters would flag half the dictionary; four is where a
    // fragment stops being a coincidence.
    if (personal.length >= 4 && core.includes(personal)) return 'looks_like_you';
  }

  return null;
}

/** Convenience for the places that only need a yes or no. */
export function isPasswordAcceptable(
  password: string,
  about: { email?: string | null; name?: string | null } = {},
): boolean {
  return passwordProblem(password, about) === null;
}
