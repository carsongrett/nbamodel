# nbamodel

Personal NBA prop desk for 2026–27 points, rebounds, and points plus rebounds.

Projections start from a baseline of SportsLine × 0.65 + Dimers × 0.35, then apply defense versus position, opponent pace, opponent rebounds, last-15 form, and a minutes share. Recent form and the minutes share are measured against that baseline. The betting line is the grading comparison. Today shows the board. Projections loads the public sites and grades earlier saved slates without replacing them. Lines loads BettingPros points and rebounds. History grades a player once a line exists. A failed source stops that click and leaves the last save in place. Login is a single owner. There is no sign-up, no scheduled run, and no betting automation.

```bash
npm install
npm test
npm run dev
```

Setup, environment variables, the Supabase migration, and the CSV/JSON templates are in [docs/setup.md](docs/setup.md). The workbook translation and the formula changes are in [docs/formulas.md](docs/formulas.md).

The app runs the model and imports without Supabase or a research key. Those stay in a clear setup-needed state until the variables in `.env.example` are set.
