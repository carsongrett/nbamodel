"use client";

import { useEffect, useMemo, useState } from "react";
import type { Settings, SlateGame, SlateView, Stat } from "../lib/engine";
import { formatStake } from "../lib/bets";
import { highestDeltas } from "../lib/highest-deltas";
import { noteForPlayer, type LineupTeam } from "../lib/sources/rotowire-lineups";
import AboutDesk from "./AboutDesk";
import DeskNav from "./DeskNav";
import Trace from "./Trace";

type Payload = {
  ok?: boolean;
  error?: string;
  message?: string;
  messages?: { level: "error" | "info"; playerId: string | null; message: string }[];
  slate?: SlateView;
  import?: { errors: { row: number; message: string }[]; warnings: string[] } | null;
};

const STATS: { id: Stat; label: string }[] = [
  { id: "points", label: "Points" },
  { id: "rebounds", label: "Rebounds" },
  { id: "points_rebounds", label: "Points + rebounds" },
];

function scaleText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function shiftText(gap: number, strength: number): string {
  const shift = gap / strength;
  const shown = `${shift > 0 ? "+" : ""}${shift.toFixed(2)}`;
  return `${gap.toFixed(2)} / ${scaleText(strength)} = ${shown}. The projection and the edge versus the line both move by ${shown}.`;
}

const SETTING_FIELDS: { key: keyof Settings; label: string; min: number; max: number; step: number; example: (value: number) => string }[] = [
  { key: "dvpPointsStrength", label: "DvP points", min: 1, max: 15, step: 0.5, example: (value) => `Defense is 1.00 points above average. ${shiftText(1, value)}` },
  { key: "dvpReboundsStrength", label: "DvP rebounds", min: 1, max: 15, step: 0.5, example: (value) => `Defense is 1.00 rebounds above average. ${shiftText(1, value)}` },
  { key: "pacePointsStrength", label: "Pace points", min: 1, max: 15, step: 0.5, example: (value) => `Opponent pace is 7.50 possessions above the league. ${shiftText(7.5, value)}` },
  { key: "paceReboundsStrength", label: "Pace rebounds", min: 1, max: 15, step: 0.5, example: (value) => `Opponent pace is 7.50 possessions above the league. ${shiftText(7.5, value)}` },
  { key: "recentPointsStrength", label: "Recent points", min: 1, max: 15, step: 0.5, example: (value) => `Last 15 is 3.00 points above the line. ${shiftText(3, value)}` },
  { key: "recentReboundsStrength", label: "Recent rebounds", min: 1, max: 15, step: 0.5, example: (value) => `Last 15 is 1.00 rebound above SportsLine. ${shiftText(1, value)}` },
  { key: "minutesPointsStrength", label: "Minutes points", min: 1, max: 15, step: 0.5, example: (value) => `The minutes share is 1.50 above the line. ${shiftText(1.5, value)}` },
  { key: "minutesReboundsStrength", label: "Minutes rebounds", min: 1, max: 15, step: 0.5, example: (value) => `Rebounds per minute are 1.00 above SportsLine. ${shiftText(1, value)}` },
  { key: "oppReboundsStrength", label: "Opponent rebounds", min: 1, max: 15, step: 0.5, example: (value) => `Opponent allows 1.00 more rebound than the league blend. ${shiftText(1, value)}` },
  { key: "minRecentGames", label: "Minimum recent games", min: 1, max: 15, step: 1, example: (value) => `This player has 4 recent games. At ${scaleText(value)}, last 15 ${value <= 4 ? "counts" : "is skipped"}.` },
  { key: "minRateGames", label: "Minimum rate-sample games", min: 1, max: 15, step: 1, example: (value) => `This player has 10 games of usage. At ${scaleText(value)}, the rate ${value <= 10 ? "counts" : "is skipped"}.` },
];

function settingsForSliders(settings: Settings): Settings {
  const next = { ...settings };
  for (const field of SETTING_FIELDS) {
    // This slider already capped below 30. A higher saved count still extends its track.
    if (field.key === "minRecentGames") continue;
    if (next[field.key] > field.max) next[field.key] = field.max;
  }
  return next;
}

const KINDS = [
  "projections", "lines", "player_rates", "actuals", "players", "games", "teams",
  "dvp", "pace", "opp_rebounds", "vegas", "id_map",
];

function slateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function odds(value: number | null): string {
  if (value == null) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function deltaStyle(edge: number | null): { background: string } | undefined {
  if (edge == null || Math.abs(edge) < 0.05) return undefined;
  const amount = Math.min(Math.abs(edge) / 4, 1);
  const alpha = (0.14 + amount * 0.46).toFixed(2);
  const color = edge > 0 ? `rgba(22, 101, 52, ${alpha})` : `rgba(159, 18, 57, ${alpha})`;
  return { background: color };
}

function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function gameOdds(game: SlateGame): string {
  const parts: string[] = [];
  if (game.spread != null) {
    const sign = game.spread > 0 ? "+" : game.spread < 0 ? "−" : "";
    parts.push(`${game.homeTeamId} ${sign}${numberText(Math.abs(game.spread))}`);
  }
  if (game.total != null) parts.push(`Total ${numberText(game.total)}`);
  return parts.length ? parts.join(" · ") : "Spread and total not loaded";
}

const INJURY_LABELS = new Set(["Questionable", "Probable", "Doubtful", "Out", "Out for season"]);

function LineupNote({ note }: { note: string }) {
  const parts = note.split(" · ");
  return (
    <span className="lineup-note">{parts.map((part, index) => {
      const word = INJURY_LABELS.has(part) ? <span className="lineup-injury">{part}</span> : part;
      return <span key={`${index}-${part}`}>{index > 0 ? " · " : null}{word}</span>;
    })}</span>
  );
}

function saveLabel(line: number | null, source: string): string {
  if (line == null) return "Preview";
  return source === "saved" ? "Saved pregame" : "Preview";
}

function byProjectedPoints(
  a: { playerName: string; stats: { points: { projection: number | null } } },
  b: { playerName: string; stats: { points: { projection: number | null } } },
): number {
  const left = a.stats.points.projection;
  const right = b.stats.points.projection;
  if (left == null && right == null) return a.playerName.localeCompare(b.playerName);
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left || a.playerName.localeCompare(b.playerName);
}

export default function Dashboard({ initialDate, authConfigured }: { initialDate: string; authConfigured: boolean }) {
  const date = initialDate;
  const [stat, setStat] = useState<Stat>("points");
  const [teamId, setTeamId] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [status, setStatus] = useState("Loading the slate.");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [adapter, setAdapter] = useState<"csv" | "json">("csv");
  const [kind, setKind] = useState("projections");
  const [importText, setImportText] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [lineupTeams, setLineupTeams] = useState<LineupTeam[] | null>(null);

  useEffect(() => {
    if (window.location.hash === "#about") setAboutOpen(true);
  }, []);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const response = await fetch(`/api/slate?date=${initialDate}`, { cache: "no-store" });
      const body = (await response.json()) as Payload;
      if (cancel) return;
      setPayload(body);
      if (body.slate) setSettings(settingsForSliders(body.slate.settings));
      if (!response.ok) {
        setStatus(body.error || "The slate could not be loaded.");
        return;
      }
      if (body.slate && body.slate.rows.length === 0) setStatus(`No ${initialDate} players stored. Projections loads today. Lines adds the numbers.`);
      else setStatus(`Showing ${body.slate?.rows.length ?? 0} players for ${initialDate}.`);
    })();
    return () => {
      cancel = true;
    };
  }, [initialDate]);

  async function post(url: string, body: Record<string, unknown>, pending: string, method: "POST" | "PUT" = "POST") {
    setBusy(true);
    setStatus(pending);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ...body }),
      });
      const text = await response.text();
      let payloadBody: Payload;
      try {
        payloadBody = text ? JSON.parse(text) as Payload : {};
      } catch {
        setStatus(response.ok ? "Done." : `Request failed (${response.status}).`);
        return;
      }
      if (payloadBody.slate) {
        setPayload(payloadBody);
        setSettings(settingsForSliders(payloadBody.slate.settings));
      }
      const errors = payloadBody.messages?.filter((item) => item.level === "error") ?? [];
      const lead = payloadBody.error || payloadBody.message || (response.ok ? "Done." : "Request failed.");
      setStatus(errors.length ? `${lead} ${errors.length} item errors are listed below.` : lead);
      if (!payloadBody.slate && payloadBody.error) setPayload((current) => ({ ...current, ...payloadBody }));
    } finally {
      setBusy(false);
    }
  }

  function put(url: string, body: Record<string, unknown>, pending: string) {
    return post(url, body, pending, "PUT");
  }

  async function checkLineups() {
    setBusy(true);
    setStatus("Checking injuries and lineups…");
    try {
      const response = await fetch("/api/lineups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const text = await response.text();
      let body: { ok?: boolean; error?: string; message?: string; teams?: LineupTeam[] };
      try {
        body = text ? JSON.parse(text) as { ok?: boolean; error?: string; message?: string; teams?: LineupTeam[] } : {};
      } catch {
        setLineupTeams(null);
        setStatus(response.ok ? "Done." : `Request failed (${response.status}).`);
        return;
      }
      if (!response.ok || body.ok === false || !body.teams) {
        setLineupTeams(null);
        setStatus(body.error || body.message || "Injury and lineup check failed.");
        return;
      }
      setLineupTeams(body.teams);
      const labeled = (slate?.rows ?? []).filter((row) => noteForPlayer(body.teams ?? [], row.teamId, row.playerName)).length;
      const lead = body.message || "Injury and lineup notes loaded.";
      setStatus(labeled
        ? `${lead} ${labeled} ${labeled === 1 ? "player" : "players"} on the board labeled.`
        : `${lead} No players on this board were mentioned.`);
    } finally {
      setBusy(false);
    }
  }

  function lineupNote(teamId: string, playerName: string): string | null {
    if (!lineupTeams) return null;
    return noteForPlayer(lineupTeams, teamId, playerName);
  }

  const slate = payload?.slate;
  const games = useMemo(() => {
    const rows = (slate?.rows ?? []).filter((row) => (teamId ? row.teamId === teamId : true));
    return (slate?.games ?? [])
      .map((game) => ({
        game,
        rows: rows.filter((row) => row.gameId === game.gameId).sort(byProjectedPoints),
      }))
      .filter((item) => item.rows.length > 0);
  }, [slate, teamId]);
  const topDeltas = useMemo(() => highestDeltas(
    (slate?.rows ?? []).map((row) => {
      const cell = row.stats[stat];
      return {
        playerId: row.playerId,
        gameId: row.gameId,
        playerName: row.playerName,
        teamId: row.teamId,
        opponentId: row.opponentId,
        projection: cell.projection,
        line: cell.line,
      };
    }),
    teamId,
  ), [slate, stat, teamId]);

  async function readFile(file: File | undefined) {
    if (!file) return;
    setImportText(await file.text());
  }

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">2026–27 season</p>
          <h1>Today</h1>
          <DeskNav current="today" />
          <p className="sub">{slateLabel(initialDate)}.</p>
        </div>
        <div className="top-actions">
          <button className="about-open" type="button" aria-haspopup="dialog" aria-expanded={aboutOpen} onClick={() => setAboutOpen(true)}>?</button>
          {authConfigured ? (
            <button className="ghost" type="button" onClick={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/login"; })}>Sign out</button>
          ) : null}
        </div>
      </header>

      <div className="row actions">
        <label>
          Team
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            <option value="">All teams</option>
            {slate?.teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.teamId}</option>)}
          </select>
        </label>
        <label>
          Stat
          <select value={stat} onChange={(event) => setStat(event.target.value as Stat)}>
            {STATS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <button className="primary" type="button" disabled={busy} onClick={() => void post("/api/projections", {}, "Loading projections…")}>Projections</button>
        <button className="secondary" type="button" disabled={busy} onClick={() => void post("/api/consensus", {}, "Loading lines…")}>Lines</button>
        <button className="secondary" type="button" disabled={busy} onClick={() => void checkLineups()}>Injury/lineup check</button>
        <button className="ghost" type="button" disabled={busy} onClick={() => void post("/api/research", {}, "Requesting research…")}>Research Slate</button>
      </div>

      <section className="status" aria-live="polite">
        <p>{status}</p>
        {payload?.messages?.some((item) => item.level === "error") ? (
          <ul>
            {payload.messages.filter((item) => item.level === "error").map((item, index) => (
              <li key={`${item.message}-${index}`} className={item.level}>{item.message}</li>
            ))}
          </ul>
        ) : null}
        {payload?.import?.errors?.length ? (
          <ul>
            {payload.import.errors.slice(0, 8).map((error) => <li key={`${error.row}-${error.message}`} className="error">Row {error.row}: {error.message}</li>)}
          </ul>
        ) : null}
      </section>

      <div className="game-list">
        {games.length === 0 ? (
          <p className="card empty-games">No players for this filter.</p>
        ) : games.map(({ game, rows }) => (
          <details className="game" key={game.gameId}>
            <summary>
              <span className="player">
                {game.label}
                {game.tipLabel ? <span className="game-time">{game.tipLabel}</span> : null}
              </span>
              <span className="game-odds">{gameOdds(game)}</span>
            </summary>
            <div className="table-wrap game-table">
              <table>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th className="num">Projection</th>
                    <th className="num">Line</th>
                    <th className="num">Bet</th>
                    <th className="num">Delta</th>
                    <th className="num">Over</th>
                    <th className="num">Under</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const cell = row.stats[stat];
                    const key = `${row.playerId}|${row.gameId}`;
                    const note = lineupNote(row.teamId, row.playerName);
                    return (
                      <tr key={key}>
                        <td>
                          <div className="player">
                            {row.playerName}
                            {note ? <LineupNote note={note} /> : null}
                          </div>
                          {cell.flags.filter((flag) => flag.includes("missing") && flag.includes("baseline")).map((flag) => (
                            <div className="meta" key={flag}>{flag}</div>
                          ))}
                          <Trace stat={cell} locked={row.locked} />
                        </td>
                        <td>{row.teamId}</td>
                        <td className="num">
                          {cell.blockReason && cell.projection == null ? "Blocked" : fmt(cell.projection)}
                          <div className="meta">{saveLabel(cell.line, cell.source)}</div>
                          {cell.blockReason ? (
                            <div className="flags">
                              <span className="flag">{cell.blockReason}</span>
                            </div>
                          ) : null}
                        </td>
                        <td className="num">
                          {row.locked ? fmt(cell.line, 1) : (
                            <input
                              className="line-input"
                              type="number"
                              inputMode="decimal"
                              step="0.5"
                              min="0"
                              aria-label={`${row.playerName} ${stat} line`}
                              defaultValue={cell.line ?? ""}
                              key={`${key}|${stat}|${cell.line ?? ""}`}
                              disabled={busy}
                              onBlur={(event) => {
                                const next = event.target.value.trim();
                                const current = cell.line == null ? "" : String(cell.line);
                                if (next === current) return;
                                void put("/api/lines", { playerId: row.playerId, gameId: row.gameId, stat, line: next }, "Saving the line…");
                              }}
                            />
                          )}
                        </td>
                        <td className="num">
                          {row.locked ? (cell.units != null && cell.units > 0 ? formatStake(cell.units) : "—") : (
                            <input
                              className="line-input"
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              aria-label={`${row.playerName} ${stat} bet`}
                              defaultValue={cell.units ?? ""}
                              key={`${key}|${stat}|bet|${cell.units ?? ""}`}
                              disabled={busy}
                              onBlur={(event) => {
                                const next = event.target.value.trim();
                                const current = cell.units == null ? "" : String(cell.units);
                                if (next === current) return;
                                void put("/api/bets", { playerId: row.playerId, gameId: row.gameId, stat, units: next }, "Saving the bet…");
                              }}
                            />
                          )}
                        </td>
                        <td className="num delta" style={deltaStyle(cell.edge)}>{fmt(cell.edge)}</td>
                        <td className="num">{odds(cell.overOdds)}</td>
                        <td className="num">{odds(cell.underOdds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        <details className="game">
          <summary>
            <span className="player">Highest deltas</span>
          </summary>
          {topDeltas.length === 0 ? (
            <p className="empty-games">No players with a line for this stat.</p>
          ) : (
            <div className="table-wrap game-table">
              <table>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th className="num">Projection</th>
                    <th className="num">Line</th>
                    <th className="num">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {topDeltas.map((row) => {
                    const note = lineupNote(row.teamId, row.playerName);
                    return (
                      <tr key={`${row.playerId}|${row.gameId}`}>
                        <td>
                          <div className="player">
                            {row.playerName}
                            {note ? <LineupNote note={note} /> : null}
                          </div>
                        </td>
                        <td>{row.teamId}</td>
                        <td className="num">{fmt(row.projection)}</td>
                        <td className="num">{fmt(row.line, 1)}</td>
                        <td className="num delta" style={deltaStyle(row.delta)}>{fmt(row.delta)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </div>

      <div className="panels">
        <section className="card">
          <h2>Research</h2>
          {slate?.research.length ? slate.research.map((finding) => (
            <article className="finding" key={finding.id}>
              <strong>{finding.kind === "verified" ? "Verified" : "Inference"}</strong>
              {finding.conflict ? " · Conflicting reports" : ""}
              <span className="meta"> · {finding.playerId ?? finding.teamId ?? "Unassigned"} · retrieved {finding.retrievedAt}</span>
              <p>{finding.summary}</p>
              <p className="meta">
                {finding.sourceUrl ? <a href={finding.sourceUrl}>{finding.sourceUrl}</a> : "No source URL"}
                {finding.publishedAt ? ` · published ${finding.publishedAt}` : ""}
                {finding.suggestedMinutes != null ? ` · suggested ${finding.suggestedMinutes} minutes` : ""}
                {finding.suggestedRole ? ` · ${finding.suggestedRole}` : ""}
              </p>
              {finding.flags.map((flag) => <span className="flag" key={flag}>{flag}</span>)}
            </article>
          )) : <p>No findings for this date. Research stays empty until a configured provider returns some.</p>}
        </section>

        <section className="card">
          <h2>Adjustment settings</h2>
          {settings ? (
            <form className="settings" onSubmit={(event) => { event.preventDefault(); void put("/api/settings", { settings }, "Saving settings…"); }}>
              {SETTING_FIELDS.map((field) => {
                const value = settings[field.key];
                const max = field.key === "minRecentGames" ? Math.max(field.max, value) : field.max;
                return (
                  <label className="scale" key={field.key}>
                    <span className="scale-top"><b>{field.label}</b><b>{scaleText(value)}</b></span>
                    <input
                      type="range"
                      min={field.min}
                      max={max}
                      step={field.step}
                      value={value}
                      aria-label={field.label}
                      onChange={(event) => setSettings({ ...settings, [field.key]: Number(event.target.value) })}
                    />
                    <span className="scale-example">{field.example(value)}</span>
                  </label>
                );
              })}
              <button className="primary" type="submit" disabled={busy}>Save settings</button>
            </form>
          ) : null}
        </section>

        <section className="card">
          <h2>Import</h2>
          <p className="sub">CSV and JSON use the same columns. Rows are matched on ids. Importing the same record again updates it.</p>
          <div className="row">
            <label>
              Adapter
              <select value={adapter} onChange={(event) => setAdapter(event.target.value as "csv" | "json")}>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </label>
            <label>
              Kind
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                {KINDS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              File
              <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => void readFile(event.target.files?.[0])} />
            </label>
            <button className="primary" type="button" disabled={busy || !importText} onClick={() => void post("/api/import", { adapter, kind, text: importText }, "Importing…")}>Import file</button>
          </div>
        </section>
      </div>
      {aboutOpen ? <AboutDesk onClose={() => setAboutOpen(false)} /> : null}
    </main>
  );
}
