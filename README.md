# nbamodel

Personal NBA prop desk for 2026–27 points, rebounds, and points plus rebounds.

Projections start from SportsLine, then apply defense versus position, last-15 form, and a minutes share. The points line is only a weight in those last two points terms. Opening the desk loads today's published slate and drops any sample rows still in local storage. Login is a single owner. There is no sign-up, no scheduled run, and no betting automation.

```bash
npm install
npm test
npm run dev
```

Setup, environment variables, the Supabase migration, and the CSV/JSON templates are in [docs/setup.md](docs/setup.md). The workbook translation and the formula changes are in [docs/formulas.md](docs/formulas.md).

The app runs the model and imports without Supabase or a research key. Those stay in a clear setup-needed state until the variables in `.env.example` are set.
