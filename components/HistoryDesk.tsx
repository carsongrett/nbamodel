"use client";

import { useEffect, useMemo, useState } from "react";
import type { SlateView, Stat } from "../lib/engine";
import {
  HISTORY_RESULT_OPTIONS,
  applyHistoryFilters,
  groupHistoryByGame,
  historyResultFilter,
  historyResultText,
  historySummary,
  type HistoryResultFilter,
} from "../lib/history";
import AboutDesk from "./AboutDesk";
import DeskNav from "./DeskNav";
import Trace from "./Trace";

type Payload = {
  ok?: boolean;
  error?: string;
  slate?: SlateView;
};

const STATS: { id: Stat; label: string }[] = [
  { id: "points", label: "Points" },
  { id: "rebounds", label: "Rebounds" },
  { id: "points_rebounds", label: "Points + rebounds" },
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

function pct(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function savedWhen(iso: string | null): string {
  if (!iso) return "Not saved";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Saved";
  return `Saved ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date)}`;
}

function pointsLabel(threshold: number): string {
  return threshold === 1 ? "At least 1 point" : `At least ${threshold} points`;
}

export default function HistoryDesk({ today, authConfigured }: { today: string; authConfigured: boolean }) {
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [stat, setStat] = useState<Stat>("points");
  const [gameId, setGameId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [result, setResult] = useState<HistoryResultFilter>("all");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [status, setStatus] = useState("Loading earlier slates.");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const response = await fetch(`/api/slate?date=${today}`);
      const body = (await response.json()) as Payload;
      if (cancel) return;
      const past = (body.slate?.dates ?? []).filter((item) => item < today);
      setDates(past);
      setReady(true);
      if (!response.ok) {
        setStatus(body.error || "Earlier slates could not be loaded.");
        return;
      }
      if (past.length === 0) {
        setStatus("No earlier slate is stored yet.");
        return;
      }
      setDate(past[0]);
    })();
    return () => {
      cancel = true;
    };
  }, [today]);

  useEffect(() => {
    if (!date) return;
    let cancel = false;
    void (async () => {
      const response = await fetch(`/api/slate?date=${date}`);
      const body = (await response.json()) as Payload;
      if (cancel) return;
      setPayload(body);
      if (!response.ok) setStatus(body.error || "That slate could not be loaded.");
      else if (body.slate && body.slate.rows.length === 0) setStatus(`No players stored for ${slateLabel(date)}.`);
      else setStatus("");
    })();
    return () => {
      cancel = true;
    };
  }, [date]);

  const slate = payload?.slate;
  const view = useMemo(
    () => applyHistoryFilters(slate?.rows ?? [], { gameId, teamId, stat, result }),
    [slate, gameId, teamId, stat, result],
  );
  const rows = view.rows;
  const summary = useMemo(
    () => historySummary((slate?.rows ?? []).map((row) => row.stats[stat])),
    [slate, stat],
  );
  const gameOptions = useMemo(() => {
    const savedIds = new Set(
      (slate?.rows ?? [])
        .filter((row) => historyResultText(row.stats[stat]) !== "Not saved")
        .map((row) => row.gameId),
    );
    return (slate?.games ?? []).filter((game) => savedIds.has(game.gameId));
  }, [slate, stat]);
  const groups = useMemo(
    () => groupHistoryByGame(rows, slate?.games ?? []),
    [rows, slate],
  );

  useEffect(() => {
    if (!gameId) return;
    if (gameOptions.some((game) => game.gameId === gameId)) return;
    setGameId("");
  }, [gameId, gameOptions]);

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">2026–27 season</p>
          <h1>History</h1>
          <DeskNav current="history" />
          <p className="sub">Saved projections against the results. The grade uses the line stored before the game.</p>
        </div>
        <div className="top-actions">
          <button className="about-open" type="button" aria-haspopup="dialog" aria-expanded={aboutOpen} onClick={() => setAboutOpen(true)}>?</button>
          {authConfigured ? (
            <button className="ghost" type="button" onClick={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/login"; })}>Sign out</button>
          ) : null}
        </div>
      </header>

      {ready && dates.length === 0 ? (
        <section className="card empty-history">
          <h2>Nothing to grade yet</h2>
          <p>History starts the morning after a slate is saved.</p>
          <ol>
            <li>On Today, Projections loads the public sites. Lines, or a number you type, stores that player in History.</li>
            <li>If a source fails, that click stops and the last save stays.</li>
            <li>The next day’s Projections writes results for games already on the desk. They show up here. Saved projections and lines stay.</li>
          </ol>
        </section>
      ) : (
        <>
          <div className="row actions">
            <label>
              Slate
              <select value={date} onChange={(event) => { setDate(event.target.value); setGameId(""); }}>
                {dates.map((item) => <option key={item} value={item}>{slateLabel(item)}</option>)}
              </select>
            </label>
            <label>
              Game
              <select value={gameId} onChange={(event) => setGameId(event.target.value)}>
                <option value="">All games</option>
                {gameOptions.map((game) => <option key={game.gameId} value={game.gameId}>{game.label}</option>)}
              </select>
            </label>
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
            <label>
              Result
              <select value={result} onChange={(event) => setResult(historyResultFilter(event.target.value))}>
                {HISTORY_RESULT_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>

          <section className="status" aria-live="polite">
            <p>{slate && slate.rows.length > 0 ? `${rows.length} ${rows.length === 1 ? "player" : "players"} on ${slateLabel(slate.date)}.` : status}</p>
          </section>

          {slate ? (
            <div className="summary">
              <div><span>Wins</span><strong>{summary.wins}</strong></div>
              <div><span>Losses</span><strong>{summary.losses}</strong></div>
              <div><span>Win rate</span><strong>{pct(summary.winRate)}</strong></div>
              <div><span>Pushes</span><strong>{summary.pushes}</strong></div>
              <div><span>Mean abs. error</span><strong>{fmt(summary.meanAbsoluteError, 2)}</strong></div>
            </div>
          ) : null}

          {slate ? (
            <section className="line-distance" aria-label="Hit rate by distance from the line">
              <h2>Distance from the line</h2>
              <p className="meta">Wins and losses in this filter. Distance is how far the projection sits from the line, above or below.</p>
              <div className="line-distance-row">
                {view.distance.map((group) => (
                  <div key={group.threshold} role="group" aria-label={`${pointsLabel(group.threshold)}: ${group.wins} wins, ${group.losses} losses, hit rate ${pct(group.hitRate)}`}>
                    <span>{pointsLabel(group.threshold)}</span>
                    <strong>{group.wins}-{group.losses}</strong>
                    <span>{pct(group.hitRate)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <p className="meta board-note">
            Projection and line are the saved pregame record. Error is the actual minus that projection. {STATS.find((item) => item.id === stat)?.label}.
          </p>
          <div className="game-list">
            {groups.length === 0 ? (
              <p className="card empty-games">No players for this filter.</p>
            ) : groups.map(({ game, rows: gameRows, scoreLabel }) => (
              <section className="game" key={game.gameId}>
                <h2 className="game-head">
                  <span className="player">
                    {game.label}
                    {game.tipLabel ? <span className="game-time">{game.tipLabel}</span> : null}
                  </span>
                  {scoreLabel ? <span className="game-odds">{scoreLabel}</span> : null}
                </h2>
                <div className="table-wrap game-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Team</th>
                        <th>Opp</th>
                        <th className="num">Projection</th>
                        <th className="num">Line</th>
                        <th className="num">Actual</th>
                        <th className="num">Error</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gameRows.map((row) => {
                        const cell = row.stats[stat];
                        const archived = cell.source === "saved";
                        return (
                          <tr key={`${row.playerId}|${row.gameId}`}>
                            <td>
                              <div className="player">{row.playerName}</div>
                              <div className="meta">{row.position} · {row.playerId}</div>
                              {archived ? <Trace stat={cell} locked={row.locked} /> : null}
                            </td>
                            <td>{row.teamId}</td>
                            <td>{row.opponentId}</td>
                            <td className="num">
                              {archived ? fmt(cell.projection) : "—"}
                              <div className="meta">{archived ? savedWhen(cell.savedAt) : "Not saved"}</div>
                            </td>
                            <td className="num">{archived ? fmt(cell.line, 1) : "—"}</td>
                            <td className="num">{fmt(cell.actual, 1)}</td>
                            <td className="num">{archived ? fmt(cell.error) : "—"}</td>
                            <td><span className={`grade ${archived ? cell.grade : "ungraded"}`}>{historyResultText(cell)}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      {aboutOpen ? <AboutDesk onClose={() => setAboutOpen(false)} /> : null}
    </main>
  );
}
