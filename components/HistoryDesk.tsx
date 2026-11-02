"use client";

import { useEffect, useMemo, useState } from "react";
import type { Grade, SlateView, Stat } from "../lib/engine";
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

function gradeLabel(grade: Grade): string {
  if (grade === "win") return "Win";
  if (grade === "loss") return "Loss";
  if (grade === "push") return "Push";
  if (grade === "no_pick") return "No pick";
  if (grade === "dnp") return "DNP";
  if (grade === "unresolved") return "Unresolved";
  return "Not saved";
}

export default function HistoryDesk({ today, authConfigured }: { today: string; authConfigured: boolean }) {
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [stat, setStat] = useState<Stat>("points");
  const [gameId, setGameId] = useState("");
  const [teamId, setTeamId] = useState("");
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
      else setStatus(`${body.slate?.rows.length ?? 0} players on ${slateLabel(date)}.`);
    })();
    return () => {
      cancel = true;
    };
  }, [date]);

  const slate = payload?.slate;
  const rows = useMemo(() => {
    return (slate?.rows ?? []).filter((row) => (gameId ? row.gameId === gameId : true) && (teamId ? row.teamId === teamId : true));
  }, [slate, gameId, teamId]);
  const summary = slate?.summaries[stat];

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">2026–27 season</p>
          <h1>History</h1>
          <DeskNav current="history" />
          <p className="sub">Saved projections against the results. The grade uses the line from Run Model.</p>
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
            <li>On Today, Run Model loads the sites and saves the projection, the line, and the odds.</li>
            <li>If a source fails, that click stops and the last save stays.</li>
            <li>The next day’s Run Model writes results for games already on the desk. They show up here.</li>
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
                {slate?.games.map((game) => <option key={game.gameId} value={game.gameId}>{game.label}</option>)}
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
          </div>

          <section className="status" aria-live="polite">
            <p>{status}</p>
          </section>

          {summary ? (
            <div className="summary">
              <div><span>Wins</span><strong>{summary.wins}</strong></div>
              <div><span>Losses</span><strong>{summary.losses}</strong></div>
              <div><span>Win rate</span><strong>{pct(summary.winRate)}</strong></div>
              <div><span>Pushes</span><strong>{summary.pushes}</strong></div>
              <div><span>Mean abs. error</span><strong>{fmt(summary.meanAbsoluteError, 2)}</strong></div>
            </div>
          ) : null}

          <div className="table-wrap">
            <table>
              <caption className="meta" style={{ captionSide: "bottom", padding: 10 }}>
                Projection and line are the saved pregame record. Error is the actual minus that projection. {STATS.find((item) => item.id === stat)?.label}.
              </caption>
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
                {rows.length === 0 ? (
                  <tr><td colSpan={8}>No players for this filter.</td></tr>
                ) : rows.map((row) => {
                  const cell = row.stats[stat];
                  const archived = cell.source === "saved";
                  return (
                    <tr key={`${row.playerId}|${row.gameId}`}>
                      <td>
                        <div className="player">{row.playerName}</div>
                        <div className="meta">{row.position} · {row.playerId}</div>
                        {archived ? <Trace stat={cell} implied={row.impliedDetail} locked={row.locked} /> : null}
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
                      <td><span className={`grade ${archived ? cell.grade : "ungraded"}`}>{archived ? gradeLabel(cell.grade) : "Not saved"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {aboutOpen ? <AboutDesk onClose={() => setAboutOpen(false)} /> : null}
    </main>
  );
}
