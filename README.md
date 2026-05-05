# GitReverse

https://github.com/user-attachments/assets/f0cdb7b2-c6f0-4483-8a01-153170479f2e

Turn a **public GitHub repository** into a **single synthetic user prompt** that someone might paste into Cursor, Claude Code, Codex, etc. to vibe code the project from scratch.

The app pulls **repo metadata**, a **root file tree** (depth 1), and the **README**, then uses an LLM to produce one short, conversational prompt grounded in that context.

Paste a GitHub URL or `owner/repo` on the home page. You can also open **`/owner/repo`** (e.g. `/vercel/next.js`) for a shareable link that runs the same flow.

GitHub-style **`/owner/repo/tree/...`** URLs on this site **redirect to `/owner/repo`** so they do not 404. The reverse flow still uses the whole repo for now; **subfolder-aware** context (scoped to that path) is planned for a later change.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, GitHub API, Supabase (optional), Stripe (optional).

## Configuration

Copy `.env.example` to `.env.local` and fill in at least one LLM API key.

### Quick LLM (required)

The quick reverse endpoint supports four providers. Set **`GITREVERSE_QUICK_LLM`** to pin one, or leave it unset (`auto`) to let the app use whichever key it finds first:

| Provider | Key env var | Model env var | Default model |
|---|---|---|---|
| Grok (xAI) | `XAI_API_KEY` | `XAI_MODEL` | `grok-3` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `google/gemini-2.5-pro` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-4.1` |
| Google AI Studio | `GOOGLE_GENERATIVE_AI_API_KEY` | `GOOGLE_AI_STUDIO_MODEL` | `gemini-2.5-pro` |

In `auto` mode the order of preference is: Grok → OpenRouter → OpenAI → Google.

### Other env vars

- **`GITHUB_TOKEN`** — optional; increases GitHub API rate limits.
- **`SUPABASE_URL`** + **`SUPABASE_PUBLISHABLE_KEY`** — optional; enables server-side caching of quick prompts in `prompt_cache` and exposes the `/library` page.
- **`VIEWS_IP_SALT`** — **required in production**. Generate one with `openssl rand -hex 32`. The app will refuse to start in production without a non-default value.

### Custom reverse (optional)

For **deep / focus** prompts, point the app at a backend service:

```
CUSTOM_REVERSE_SERVICE_URL=http://localhost:3001
```

## Routes

| Path | Description |
|---|---|
| `/` | Home — quick and custom reverse |
| `/library` | Browse cached quick prompts (requires Supabase) |
| `/history` | Recent repos from localStorage |
| `/[owner]/[repo]` | Shareable quick-reverse link |
| `/[owner]/[repo]/deep` | Shareable deep-reverse link |
| `/[owner]/[repo]/[focus]` | Shareable manual-focus link |
| `/[owner]/[repo]/tree/...` | Redirects to `/[owner]/[repo]` |

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
pnpm build
pnpm start
pnpm lint
```