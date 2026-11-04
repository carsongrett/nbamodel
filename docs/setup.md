# Setup

The desk runs the model and CSV/JSON imports with no secrets. Supabase and the research provider are optional until you deploy or want login and live research.

```bash
npm install
npm test
npm run dev
```

Open the app. **Today** is the current date in America/Chicago and shows the live projection. **History** is earlier slates and how they graded. **Projections** loads ESPN, Basketball Reference, SportsLine, FantasyPros, and TeamRankings. **Lines** loads BettingPros points and rebounds.

Today's refresh drops sample rows and matches an exact normalized name on the same team. Sample player ids start with `player_` and sample game ids start with `game_`. A SportsLine name matches when, after accents and punctuation are removed, it equals one Basketball Reference player on that team. Two players with that same name are left off. A different suffix, such as Jr, stays a different name.

Put `BETTINGPROS_API_KEY` in `.env.local` and restart the server when you want consensus lines. **Lines** requests that day's events, then one offers series for points and rebounds. It waits 1.5 seconds between offer pages and stops at 40 BettingPros calls. A successful slate for that Chicago date is kept in memory, so a second Lines click does not call BettingPros again. A failed click is not kept.

Then:

1. On **Today**, press **Projections** once. That loads ESPN’s spread and total, then Basketball Reference, SportsLine, FantasyPros, and TeamRankings. It does not call BettingPros. If one of those sources fails, the click stops, names that source, and does not save today's slate.
2. Press **Lines** near tip-off. That loads BettingPros points and rebounds and replaces a typed number while the game is still pregame. After actuals are stored, the saved line stays. A player is stored in History when a line exists. An empty line is left out.
3. On a later day, press **Projections** again. The download includes Basketball Reference daily leaders for the previous 15 dates. Box scores are stored for games already on the desk, and those saved projections and lines are not replaced.
4. Open **History**. Grades use the saved line.

## Environment

Copy `.env.example` to `.env.local` in the same folder as `package.json`. Leave it blank for local use. The server reads that file on every request. For BettingPros the line is `BETTINGPROS_API_KEY=` followed by the key. Saving the file is enough; the next page load picks it up, and the banner names the folder it searched when the key is missing.

| Variable | Role |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth client URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth client key |
| `SUPABASE_URL` | Server storage URL. Falls back to the public URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only storage key |
| `OWNER_EMAIL` | The only email allowed to sign in |
| `LOCAL_STORE_PATH` | Optional override for `data/local-store.json` |
| `BETTINGPROS_API_KEY` | Server-only BettingPros key. Header `x-api-key`. Absent means no odds call |
| `RESEARCH_PROVIDER` | `openai`, or blank |
| `RESEARCH_API_KEY` | Server-only research key |
| `RESEARCH_API_BASE_URL` | Defaults to `https://api.openai.com/v1` |
| `RESEARCH_MODEL` | Defaults to `gpt-4.1-mini` |
| `RESEARCH_WEB_TOOL` | Defaults to `web_search` |

Login appears only when the public URL, anon key, and owner email are all set. There is no sign-up route. In the Supabase dashboard, disable public sign-ups and create one user whose email matches `OWNER_EMAIL`.

Storage uses Supabase only when the URL and service role key are set. Otherwise the app writes `data/local-store.json`. That file is local to the machine. On Vercel, set the Supabase variables so data survives between instances. The browser never holds the service role key.

Research Slate calls the provider from the server. If the provider or key is missing, or the provider name is not `openai`, the button returns a setup-needed message and stores nothing. It does not invent injuries. Web pages are passed to the model as untrusted data. A minutes suggestion does not replace SportsLine minutes.

Nothing is scheduled. Projections, Lines, imports, and Research Slate are manual. The next **Projections** is what writes the earlier box scores.

**Projections** reads ESPN’s spread and total, then Basketball Reference (season usage, season rebounds per minute, the prior 15 daily leader pages, team pace, and that date’s leaders), the SportsLine simulation table, FantasyPros FanDuel defense vs position, and TeamRankings opponent rebounds. It does not call BettingPros. If ESPN, Basketball Reference, SportsLine, FantasyPros, or TeamRankings fails, the click stops and nothing is written. A finished click keeps SportsLine rows that match one Basketball Reference player by exact normalized name and team, and it removes sample rows. Leader pages for earlier dates grade a game only when that game is already stored, and they do not replace the saved projection or line. Players who are not already on the desk are skipped. The selected date still stores its own leaders and can add that day’s games. The spread and total come from the ESPN page, one request for the day. **Lines** reads that day’s BettingPros events with `limit=-1` and follows `_pagination` when that date has more than one page. It then requests offers once for every event id joined with colons, `market_id=156:157`, and book 0, also with `limit=-1`. The key’s page size caps that limit (20 on this key). Offer pages continue until `total_pages`, with 1.5 seconds between those pages and no pause before the first one. A 429 body of Too Many Requests retries that same page. Limit Exceeded is the daily cap, which resets at midnight UTC, and that response stops with no retry. Events and offers together stop at 40 calls. A stopped click does not save a partial slate. The next Lines click for the same Chicago date reuses a successful slate and does not call BettingPros. A failed click is not reused. Points plus rebounds on the board is projected points plus projected rebounds. That line is not requested. A line from Lines or from the box is stored in History. A stat with no line is left out. Lines replaces a typed number while the game is still pregame. After actuals are stored, the saved line stays. A failed Lines click leaves the board and the typed numbers in place.

## Database

Run `supabase/migrations/20261101120000_init.sql` in the Supabase SQL editor. It creates the tables, unique keys, the 2026–27 checks, a trigger that refuses to change a pregame row after actuals exist, and row level security with no policies. `anon` and `authenticated` are revoked. The same script grants those tables to `service_role`, which is the key on the server. A project created before that grant can run `supabase/migrations/20261102130000_service_role.sql` once. The service role bypasses RLS and is the only app connection.

The app also refuses those pregame writes before they reach the database.

## Imports

Templates live in `templates/csv` and `templates/json`. The sample bundle is `data/sample/bundle.json`. Adapters are `csv` and `json`. JSON is an array of objects or `{ "rows": [ ... ] }`.

Every statistical row needs `season` = `2026-27`. Other seasons are rejected. Prior-season columns such as `prior_season_ppg` are ignored. Player, team, and game links in a file are ids. `source_player_id` counts only when `source_id_map` has that exact source and source id. File imports do not match names. The live refresh does: it drops sample rows and matches an exact normalized name on the same team.

Kinds: `teams`, `players`, `games`, `id_map`, `projections`, `lines`, `player_rates`, `dvp`, `pace`, `opp_rebounds`, `vegas`, `actuals`.

Units that matter:

- `pts_per_100` is points per 100 possessions, not a percentage of team points. The minutes weight uses `usg_pct` instead.
- `usg_pct` is Basketball-Reference season usage in percent. `28.4` means 28.4 percent.
- `reb_per_minute` is rebounds per minute. `trb_per_36` and `recent_reb_per_minute` together are blended 50/50 into that rate.
- `pace` is possessions per 48 minutes. `pace_diff` is the opponent’s possessions-versus-league figure used as its own adjustment.
- `spread` is the signed team spread. Negative means that team is favored.
- `dnp` true cannot also include points or rebounds.

Re-importing the same player, game, and source updates the existing row.

## Vercel

Set the environment variables in the project. Do not add a cron. The Node runtime is required because imports and the local fallback read the filesystem. With Supabase configured, the filesystem fallback is unused.

Formula notes are in `docs/formulas.md`.
