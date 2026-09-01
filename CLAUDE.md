# Dragon Stats

High school football play-by-play tracking. React 19 + TS + Vite + Tailwind,
Supabase (Postgres/Auth), PWA. Stats come from `packages/football-stats-engine`
(a `file:` dep that ships a prebuilt `dist/` — no build step, don't try to
compile it).

Primary use is one person in a press box on an iPad recording a live game.
Entry speed and not silently mis-crediting a player are the two things that
matter most; optimize for those over elegance.

## Verify loop

```
npx tsc -b        # then
npm run build     # PWA/service worker regenerates here, so run it
```

Dev server: `preview_start` with `dragonstats` (the entry lives in the
user-level `D:\APPS\.claude\launch.json`, not this repo's), app at
`http://localhost:5174/` — served from the root since the move to
dragonstats.app. It used to sit under `/dragonstats/` on github.io, so treat
any surviving reference to that prefix as stale.

**Claude CAN log in, against the local stack.** `npx supabase start` brings up
Supabase in Docker and `.env.local` points the app at `127.0.0.1:54321`, so the
whole game screen is testable end to end — including auth, RLS and email (local
mail lands in Mailpit on :54324). Production remains unreachable and untestable
from here. Reset the sandbox with `npx supabase db reset`.

Push to `main` auto-deploys to GitHub Pages. Don't push unless asked.

## Architecture notes that aren't obvious

- **Tags that can't be foreign keys live in `play_data` JSONB.** Opponent
  players (`opp_tagged`) and unrostered "pending" players (`pending_tagged`)
  have no `players` row, so they can't go in `play_players`. They ride in
  `play_data` and are rebuilt into `PlayRecord.tagged` on load. A bonus: they
  sync offline for free. `isRosterTag()` in `components/game/types.ts` gates
  every `play_players` write — a pending tag reaching that insert violates the
  FK and fails the whole save.
- **Game state is derived, not stored.** `rebuildPlaySituations` +
  `replayLiveGame` recompute down/distance/spot/score from the play list on
  every change. Editing play 12 re-chains 13 onward. Prefer full replay over
  patching state.
- **Manual overrides must outrank the engine.** A hand-entered spot is flagged
  `next_situation_source: "manual_override"` and wins over the replay result.
- **Writes are write-ahead, not enqueue-on-failure.** `insertPlay` caches the
  play AND its sync intent in ONE IndexedDB transaction *before* touching the
  network, and deletes the intent only once the server has the row. The old
  shape — cache, try, enqueue if that failed — left a window on every snap
  where the play existed only on the device with no record it was owed to the
  server. Any new write path must write ahead the same way.
  (`updatePlayFull`/`deletePlay` still use the old order; that is known and
  queued.)
- **A play and its credits are one server-side transaction.**
  `save_play_with_players` (RPC) upserts the play and replaces `play_players`
  together. Passing no players means "leave the credits alone" — a
  situation-only patch must not wipe who was involved. Callers fall back to the
  old three-request path only while the function is missing, which is the gap
  between deploying a build and applying its migration.
- **Access is program membership.** Every table is scoped through
  `program_members`; a signed-in account with no membership sees nothing.
  Coaches join with an invite code (`redeem_invite_code`). Supabase Auth
  sign-ups must stay ENABLED — the code is the gate, not the sign-up form.

## Gotchas — these have each cost real time

- **Never rewrite source files with PowerShell `Get-Content | Set-Content`.**
  PS 5.1 reads BOM-less UTF-8 as CP1252 and re-encodes it, double-encoding
  every em dash, arrow and box-drawing char. It corrupted three files in one
  session. Use the Edit tool, or `node` with explicit encoding.
  `Set-Content -Encoding utf8` also adds a BOM; strip it.
- **Some files are CRLF** (git checked them out that way during a merge).
  String anchors containing `\n` silently fail to match. Split on `/\r?\n/`
  and rejoin with the detected EOL.
- **Tailwind can't see interpolated class names.** `grid-cols-${n}` compiles to
  nothing and fails silently as a collapsed layout. Use literal lookups, and
  confirm new arbitrary/opacity variants actually emitted before trusting them.
- **`surface.card`, `dragon-primary` etc. are Tailwind tokens, not CSS
  variables.** `var(--surface-card)` always falls through to its fallback.
- **`.screen` is `min-h-dvh`.** A screen that wants an inner scroll region must
  add `h-dvh overflow-hidden` itself, plus `min-h-0` on the flex child —
  otherwise the page grows and the whole thing scrolls as one.
- **This codebase has a habit of fully-built UI that was never wired up.**
  Three were found in one session (the penalty picker, the tackler step, a
  situation adjuster). If a feature seems like it should already exist, grep
  for it before building it.

## Conventions

- Roles resolve to a roster via `roleUsesOpponentRoster()` — one helper, three
  call sites. The tricky cases are `returner` (opposite of possession, unless
  the kicking team recovers an onside kick) and turnovers, where possession
  flips mid-play so the offense that gave it away makes the tackle.
- Amber in the play-entry modal means "not a confirmed pick" — a carried-over
  player or an unrostered jersey. Keep that consistent.
- Commit messages explain *why*, especially for a non-obvious fix. Several
  bugs here were subtle enough that the reasoning is the valuable part.
