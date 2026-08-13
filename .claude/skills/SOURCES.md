# Where these skills came from

Installed on request, verbatim from their upstream repos. Not part of the
Nós app itself — these are Claude Code skills available while working in
this repo.

| Skill | Invoked as | Source | License |
|---|---|---|---|
| `web-design-guidelines` | `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), `skills/web-design-guidelines` | none bundled upstream |
| `taste-skill` | `design-taste-frontend` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), `skills/taste-skill` (the default variant — the repo also ships `brutalist-skill`, `minimalist-skill`, `soft-skill` and others not installed here) | MIT, © Leonxlnx 2026 — see `taste-skill/LICENSE` |
| `theme-factory` | `theme-factory` | [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills), `theme-factory` (the Claude Code variant — the user asked for the `awesome-codex-skills` copy, which is the same skill packaged for OpenAI's Codex CLI instead) | see `theme-factory/LICENSE.txt` |
| `composio-connect` | `connect` | [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills), `connect` | none bundled upstream |

## `composio-connect` needs setup before it does anything

This one is not self-contained like the other three — it's instructions for
wiring an MCP server to Composio's platform, which needs an API key:

1. Get a free key at [platform.composio.dev](https://platform.composio.dev)
2. `export COMPOSIO_API_KEY="…"`
3. `pip install composio` or `npm install @composio/core`

Until that's done, the skill loads but can't actually send an email or post
to Slack — see `composio-connect/SKILL.md` for the full setup and the MCP
server config it expects.

## Not committed

These files are untracked in git. Say the word if you want them committed —
otherwise they live only in this working copy.

## cc-polymath (rand/cc-polymath)

Installed with `npx openskills install rand/cc-polymath -y` — 26 skills.

Two of them earned their place on this repo:

- **anti-slop** — a runnable detector, not a checklist. Scored the spending
  copy and its three source files 0–1/100.
- **elegant-design** — its "document the states" step (empty, loading,
  error, extreme data) found a real bug: a page with only a treat logged
  rendered two €0.00 cards, so a gift looked like it had been dropped.

The `discover-*` skills are gateways that `Read ../<category>/INDEX.md`,
and the installer does not bring those categories down. The math category
was copied out of the installer's temp clone into `_categories/` before it
was cleaned up — though its contents are ZFC, ordinals and cardinals, and
nothing in it applies to partitioning a list of expenses.
