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
