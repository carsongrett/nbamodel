# Formula translation

Source workbook: `CG_NBA_V9_4-4-2023.xlsm` (April 4, 2023). All 25 worksheets were read. The VBA project in `vbaProject.bin` is compiled and was not decompiled. The daily to-do sheet only describes manual import steps, so the projection math below comes from the worksheets.

The model sheet is players across columns and metrics down rows. The same formula is copied across the player columns. Defaults below are the values the formulas actually divide by, which live in column C. Column B holds unused “strength options” (for example pace 10 and recent-form 0) and is not referenced.

Season scope in this app is **2026–27 only**. The workbook’s 2022–23 values are not imported.

## What the model did

Outside points projections were SportsLine column I, the “other” sheet column O, and numberFire column C. Rebounds were SportsLine column N, other column Q, and numberFire column D. Minutes were the average of SportsLine column J and other column N.

```
points = AVERAGE(outside points)
  + DvP_points / 2
  + opponent_pace_diff / 5
  + (last_14_day_ppg - points_line) / 10
  + (minutes_expectation - points_line) / 3

rebounds = AVERAGE(outside rebounds)
  + DvP_rebounds / 2
  + (last_14_day_rpg - AVERAGE(outside rebounds)) / 10
  + (rebounds_per_minute * minutes - AVERAGE(outside rebounds)) / 2
  + opponent_rebound_diff / 10
  + opponent_pace_diff / 7.5

points_plus_rebounds = points + rebounds
```

DvP is the opponent’s position differential: `0.3 * (L30 − league) + 0.7 * (L15 − league)`, points in column N and rebounds in column O of the position sheet. Pace differential is the opponent’s `0.75 * (L10 − league) + 0.25 * (season − league)`. Opponent rebounds are `0.85 * season + 0.15 * last 3`, minus the league average of that blend. Rebounds per minute are `0.5 * (season TRB per 36 / 36) + 0.5 * recent per-minute rate`. Imports may supply the finished number or the components. A single component is not used to invent the other half.

A lower divisor moves the projection more. `10000` is the workbook’s way to turn a term off.

## Changes from the workbook

1. **Implied team points.** The sheet used `total/2 + spread` for a favorite and `total/2 − spread` for a dog, which adds or subtracts the whole spread. Milwaukee −13.5 on a 230.5 total became 128.75 there. The corrected value is `(game total − signed team spread) / 2` = 122, and the dog is 108.5. This number is shown as game context. It is not multiplied into the player projection.

2. **Points per 100 possessions.** The sheet labeled `player pts %` is “per 100 poss” (Luka 34.2, not a percent of team scoring) and then did `team_points * (value / 100) * (minutes / 48)`. That treats a per-possession rate as a share of team points. The minutes term is now `points_per_100 * possessions / 100`, where possessions are `pace_per_48 * minutes / 48`. Pace is the average of the two teams’ possessions per 48 minutes. If one team is missing, that team’s pace is used and flagged. If pace is missing, the term is skipped. Team points are not a substitute. A value at or below 1.5, or above 80, is flagged as mis-scaled and skipped.

3. **The prop line is not in the forecast.** Points used `(recent − line)` and `(minutes expectation − line)`. Rebounds already compared recent production and the minute rate with the average of the outside projections, despite a “vs line” label. Both stats now use `(input − baseline) / strength`. Changing the line changes the edge only. NumberFire’s `XLOOKUP` match mode `1` (next larger item, an approximate name match) is not used. Joins are exact player, team, and game ids. A source id resolves only through `source_id_map`.

4. **Missing inputs.** A text lookup used to turn the whole formula into `"no game"` or `"error"`, including a missing optional term. Optional adjustments are now flagged and skipped. The stat is blocked only when no numeric outside projection exists for it. Points + rebounds is blocked unless both stats project. Present sources are averaged; the workbook required all three cells to be numeric.

5. **Rebounds pace divisor.** `/ 7.5` was hardcoded. It is the setting `paceReboundsStrength`, still defaulting to 7.5.

6. **Minutes sources.** The sheet averaged SportsLine and the other sheet only. This app averages every imported minute for that player and game. A player-game override replaces that average. NumberFire minutes are included when imported.

7. **Short samples.** The sheet used whatever recent or rate cell was present. Recent windows below `minRecentGames` (default 3) and rate samples below `minRateGames` (default 5), or a missing sample size, skip that adjustment. Prior-season columns are rejected or ignored. They are never copied into a current-season hole.

8. **Grading.** The sheet graded a win when the projection and the actual finished on the same side of the line, and it fell through to Push when the projection equaled the line. A projection equal to the line is now **no pick**. Actual equal to the line is still a push. DNPs and games that are not final, or final games missing a stat, are flagged separately and are not wins, losses, or voids. No sportsbook void rule is applied. Rows 67–72 only counted results whose edge cleared 4, 1, or 3 points. That filter is not carried forward. Win rate is wins / (wins + losses). Mean absolute error is the average of `|actual − saved projection|`, excluding DNPs and unresolved games.

Pregame projection, line, odds, and timestamp are whatever Run Model last saved. Update Results and a later Run Model do not replace them after actuals exist. If no pregame row was saved, a postgame number is not invented.

## Trace

Each saved and previewed stat shows baseline, then each adjustment with its input, divisor, and delta, then the projection. Skipped terms say why. Points + rebounds shows the two projections and their sum, with no extra adjustments.
