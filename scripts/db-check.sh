#!/usr/bin/env bash
#
# Nós — apply every migration to a throwaway database and attack it
#
# Three things happen here, in order, and each one is a question that used
# to be answered by reading the SQL and hoping:
#
#   1. Do the twelve migrations apply, in order, from nothing?
#   2. Is every object they promise actually there afterwards?
#   3. Does the privacy model hold when you attack it as a real role?
#
# The reason this exists: two migrations failed in the SQL Editor against
# the real project because of a dependency on a file that had not been
# run, and a third reported success while silently doing two thirds of its
# job. All of that was findable in thirty seconds locally. Nobody had a
# local.
#
# Needs a Postgres server on PATH (Debian/Ubuntu: /usr/lib/postgresql/*/bin).
# Touches nothing outside its own temporary cluster, and never talks to
# Supabase.
#
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${NOS_DB_CHECK_DIR:-${TMPDIR:-/tmp}/nos-db-check}"
port="${NOS_DB_CHECK_PORT:-55432}"

for dir in /usr/lib/postgresql/*/bin /usr/local/pgsql/bin; do
  [ -d "$dir" ] && PATH="$dir:$PATH"
done
export PATH

if ! command -v initdb >/dev/null; then
  echo "db-check: no Postgres server binaries found." >&2
  echo "  macOS:  brew install postgresql@16" >&2
  echo "  Debian: apt-get install postgresql" >&2
  exit 127
fi

# initdb refuses to run as root, which is the common case in a container.
# Re-run the whole script as an unprivileged user instead of arguing.
if [ "$(id -u)" = 0 ]; then
  owner=""
  for candidate in postgres pgrun nobody; do
    id "$candidate" >/dev/null 2>&1 && owner="$candidate" && break
  done
  [ -n "$owner" ] || { echo "db-check: running as root and no unprivileged user to drop to." >&2; exit 1; }

  if [ "${NOS_DB_CHECK_DROPPED:-}" != "1" ]; then
    # Staged with the same shape as the repo — `scripts/` beside
    # `supabase/` — because the script finds its own root by going up one
    # directory, and a flatter copy sends it somewhere else entirely.
    stage="$(mktemp -d /var/tmp/nos-db-check.XXXXXX)"
    mkdir -p "$stage/scripts"
    cp -r "$root/supabase" "$stage/supabase"
    cp "$0" "$stage/scripts/db-check.sh"
    chown -R "$owner" "$stage"
    exec su "$owner" -c \
      "NOS_DB_CHECK_DROPPED=1 NOS_DB_CHECK_DIR=$stage/cluster NOS_DB_CHECK_PORT=$port bash $stage/scripts/db-check.sh"
  fi
fi

cleanup() {
  pg_ctl -D "$work/data" stop -m immediate >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "→ starting a throwaway Postgres in $work"
rm -rf "$work"
mkdir -p "$work"
initdb -D "$work/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$work/data" -o "-k $work -p $port -c listen_addresses=''" -l "$work/log" -w start >/dev/null

psql="psql -h $work -p $port -U postgres -v ON_ERROR_STOP=1 -q"
$psql -d postgres -c 'create database nos' >/dev/null

# Enough of Supabase for the migrations to have something to bind to.
$psql -d nos -f "$root/supabase/test-harness.sql" >/dev/null

echo "→ applying migrations"
# `drop … if exists` is noisy on a fresh database and the noise is not the
# point of this step; the tests below want notices, so it is scoped here.
for file in "$root"/supabase/migrations/*.sql; do
  printf '   %s' "$(basename "$file")"
  PGOPTIONS='-c client_min_messages=warning' $psql -d nos -f "$file" >/dev/null
  printf '  ok\n'
done

# Supabase grants these by default; the policies are written assuming it.
$psql -d nos -c "
  grant usage on schema public to authenticated, anon;
  grant all on all tables in schema public to authenticated, anon;
  grant execute on all functions in schema public to authenticated, anon;
" >/dev/null

echo "→ verifying every object the app expects"
report="$($psql -d nos -tA -f "$root/supabase/verify.sql")"
missing="$(echo "$report" | grep -c '^MISSING' || true)"
if [ "$missing" != "0" ]; then
  echo "$report" | grep '^MISSING' | awk -F'|' '{ printf "   missing: %-9s %-24s (run %s)\n", $3, $4, $2 }'
  echo "db-check: $missing objects missing after a clean run — a migration is wrong." >&2
  exit 1
fi
echo "   $(echo "$report" | grep -c '^ok') objects, none missing"

echo "→ attacking the privacy model"
# The notices *are* the test output, and psql writes them to stderr.
strip='s/^psql:[^ ]*: //; s/^NOTICE:  /   /'
if ! output="$(psql -h "$work" -p "$port" -U postgres -d nos -v ON_ERROR_STOP=1 \
      -f "$root/supabase/tests/rls.sql" 2>&1)"; then
  echo "$output" | grep -E 'ok  |FAILED|ERROR' | sed "$strip" >&2
  exit 1
fi
echo "$output" | grep 'NOTICE:  ok' | sed "$strip"

passed="$(echo "$output" | grep -c 'NOTICE:  ok' || true)"
migrations="$(ls "$root"/supabase/migrations/*.sql | wc -l | tr -d ' ')"
echo
echo "db-check: $migrations migrations, no missing objects, $passed privacy checks passed."
