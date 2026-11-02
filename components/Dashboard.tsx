"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Grade, Settings, SlateStat, SlateView, Stat } from "../lib/engine";
import AboutDesk from "./AboutDesk";

type Payload = {
  ok?: boolean;
  error?: string;
  storageMode?: "local" | "supabase";
  storageMessage?: string;
  researchState?: "ready" | "setup_needed";
  researchMessage?: string;
  bettingProsState?: "ready" | "setup_needed";
  bettingProsMessage?: string;
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

const SETTING_FIELDS: { key: keyof Settings; label: string }[] = [
  { key: "dvpPointsStrength", label: "DvP points strength" },
  { key: "dvpReboundsStrength", label: "DvP rebounds strength" },
  { key: "pacePointsStrength", label: "Pace points strength" },
  { key: "paceReboundsStrength", label: "Pace rebounds strength" },
  { key: "recentPointsStrength", label: "Recent points strength" },
  { key: "recentReboundsStrength", label: "Recent rebounds strength" },
  { key: "minutesPointsStrength", label: "Minutes points strength" },
  { key: "minutesReboundsStrength", label: "Minutes rebounds strength" },
  { key: "oppReboundsStrength", label: "Opponent rebounds strength" },
  { key: "minRecentGames", label: "Minimum recent games" },
  { key: "minRateGames", label: "Minimum rate-sample games" },
];

const KINDS = [
  "projections", "lines", "player_rates", "actuals", "players", "games", "teams",
  "dvp", "pace", "opp_rebounds", "vegas", "id_map",
];

function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function odds(value: number | null): string {
  if (value == null) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function gradeLabel(grade: Grade): string {
  if (grade === "no_pick") return "No pick";
  if (grade === "dnp") return "DNP";
  return grade;
}

export default function Dashboard({ initialDate, authConfigured }: { initialDate: string; authConfigured: boolean }) {
  const [date, setDate] = useState(initialDate);
  const [stat, setStat] = useState<Stat>("points");
  const [gameId, setGameId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [status, setStatus] = useState("Loading the slate.");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [adapter, setAdapter] = useState<"csv" | "json">("csv");
  const [kind, setKind] = useState("projections");
  const [importText, setImportText] = useState("");
  const [actualsText, setActualsText] = useState("");
  const [actualsAdapter, setActualsAdapter] = useState<"csv" | "json">("csv");
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    if (window.location.hash === "#about") setAboutOpen(true);
  }, []);

  async function load(nextDate = date) {
    const response = await fetch(`/api/slate?date=${nextDate}`);
    const body = (await response.json()) as Payload;
    setPayload(body);
    if (body.slate) setSettings(body.slate.settings);
    if (!response.ok) setStatus(body.error || "The slate could not be loaded.");
    else if (body.slate && body.slate.rows.length === 0) setStatus(`No ${nextDate} players stored. Refresh games loads the public slate for that date.`);
    else setStatus(`Showing ${body.slate?.rows.length ?? 0} players for ${nextDate}.`);
  }

  const liveLoadStarted = useRef(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const response = await fetch(`/api/slate?date=${initialDate}`);
      const body = (await response.json()) as Payload;
      if (cancel) return;
      setPayload(body);
      if (body.slate) setSettings(body.slate.settings);
      const games = body.slate?.games ?? [];
      const hasLive = games.some((game) => game.gameId.includes("|"));
      if (!response.ok) {
        setStatus(body.error || "The slate could not be loaded.");
        return;
      }
      if (!hasLive && !liveLoadStarted.current) {
        liveLoadStarted.current = true;
        setBusy(true);
        setStatus("Loading today's games…");
        try {
          const refresh = await fetch("/api/sources", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: initialDate }),
          });
          const refreshed = (await refresh.json()) as Payload;
          if (cancel) return;
          if (refreshed.slate) {
            setPayload(refreshed);
            setSettings(refreshed.slate.settings);
          }
          const errors = refreshed.messages?.filter((item) => item.level === "error") ?? [];
          const lead = refreshed.error || refreshed.message || "Today's slate loaded.";
          setStatus(errors.length ? `${lead} ${errors.length} item errors are listed below.` : lead);
        } finally {
          if (!cancel) setBusy(false);
        }
        return;
      }
      if (body.slate && body.slate.rows.length === 0) setStatus(`No ${initialDate} players stored. Refresh games loads the public slate for that date.`);
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
      const payloadBody = (await response.json()) as Payload;
      if (payloadBody.slate) {
        setPayload(payloadBody);
        setSettings(payloadBody.slate.settings);
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

  const slate = payload?.slate;
  const rows = useMemo(() => {
    return (slate?.rows ?? []).filter((row) => (gameId ? row.gameId === gameId : true) && (teamId ? row.teamId === teamId : true));
  }, [slate, gameId, teamId]);

  async function readFile(file: File | undefined, target: "import" | "actuals") {
    if (!file) return;
    const text = await file.text();
    if (target === "import") setImportText(text);
    else setActualsText(text);
  }

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">2026–27 season</p>
          <h1>Player prop desk</h1>
          <p className="sub">Points, rebounds, and points plus rebounds. SportsLine is the outside projection. The points line is only a weight on last-15 and the minutes share.</p>
        </div>
        <div className="top-actions">
          <button className="about-open" type="button" aria-haspopup="dialog" aria-expanded={aboutOpen} onClick={() => setAboutOpen(true)}>?</button>
          {authConfigured ? (
            <button className="ghost" type="button" onClick={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/login"; })}>Sign out</button>
          ) : null}
        </div>
      </header>

      <div className="banner">
        <strong>{payload?.storageMode === "supabase" ? "Supabase" : "Local storage"}.</strong> {payload?.storageMessage}
        <br />
        <strong>{payload?.researchState === "ready" ? "Research ready." : "Research setup needed."}</strong> {payload?.researchMessage}
        <br />
        <strong>{payload?.bettingProsState === "ready" ? "BettingPros key set." : "BettingPros setup needed."}</strong> {payload?.bettingProsMessage}
      </div>

      <div className="row actions">
        <label>
          Slate date
          <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setGameId(""); void load(event.target.value); }} />
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
        <button className="primary" type="button" disabled={busy} onClick={() => void post("/api/model", {}, "Running the model…")}>Run Model</button>
        <button className="secondary" type="button" disabled={busy} onClick={() => void post("/api/sources", {}, "Loading games…")}>Refresh games</button>
        <button className="ghost" type="button" disabled={busy} onClick={() => void post("/api/sources/bettingpros", {}, "Checking BettingPros…")}>Check BettingPros</button>
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

      <div className="table-wrap">
        <table>
          <caption className="meta" style={{ captionSide: "bottom", padding: 10 }}>
            A player is listed when one published name matches that team. Grades use the saved pregame line. Pushes, DNPs, unresolved games, and no-picks are outside the win rate. {STATS.find((item) => item.id === stat)?.label}.
          </caption>
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Opp</th>
              <th className="num">Minutes</th>
              <th className="num">Projection</th>
              <th className="num">Line</th>
              <th className="num">Over</th>
              <th className="num">Under</th>
              <th className="num">Proj − line</th>
              <th>Pick</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={11}>No players for this filter.</td></tr>
            ) : rows.map((row) => {
              const cell = row.stats[stat];
              const key = `${row.playerId}|${row.gameId}`;
              return (
                <tr key={key}>
                  <td>
                    <div className="player">{row.playerName}</div>
                    <div className="meta">{row.position} · {row.playerId}</div>
                    <Trace stat={cell} implied={row.impliedDetail} locked={row.locked} />
                  </td>
                  <td>{row.teamId}</td>
                  <td>{row.opponentId}<div className="meta">{row.gameLabel}</div></td>
                  <td className="num">{fmt(row.minutesUsed, 1)}</td>
                  <td className="num">
                    {cell.blockReason && cell.projection == null ? "Blocked" : fmt(cell.projection)}
                    <div className="meta">{cell.source === "saved" ? "Saved pregame" : cell.savedAt ? "Preview, unsaved" : "Preview"}</div>
                  </td>
                  <td className="num">{fmt(cell.line, 1)}</td>
                  <td className="num">{odds(cell.overOdds)}</td>
                  <td className="num">{odds(cell.underOdds)}</td>
                  <td className="num">{fmt(cell.edge)}</td>
                  <td>{cell.pick ?? "—"}</td>
                  <td>
                    <div className={`grade ${cell.grade}`}>{gradeLabel(cell.grade)}</div>
                    <div className="meta">{cell.actual == null ? "" : `Actual ${fmt(cell.actual, 1)}`}</div>
                    <div className="meta">{cell.error == null ? "" : `Error ${fmt(cell.error)}`}</div>
                    {cell.blockReason ? (
                      <div className="flags">
                        <span className="flag">{cell.blockReason}</span>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panels">
        <section className="card">
          <h2>Update results</h2>
          <p className="sub">Imports actuals through the CSV or JSON adapter and grades the saved pregame record. It does not rewrite projections, lines, odds, or the saved time.</p>
          <div className="row">
            <label>
              Actuals adapter
              <select value={actualsAdapter} onChange={(event) => setActualsAdapter(event.target.value as "csv" | "json")}>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </label>
            <label>
              Actuals file
              <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => void readFile(event.target.files?.[0], "actuals")} />
            </label>
            <button className="primary" type="button" disabled={busy} onClick={() => void post("/api/results", actualsText ? { text: actualsText, adapter: actualsAdapter } : {}, "Updating results…")}>Update Results</button>
          </div>
        </section>

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
          <p className="sub">A lower strength moves the projection more. 10000 effectively turns an adjustment off. These are divisors, not fitted weights.</p>
          {settings ? (
            <form className="settings" onSubmit={(event) => { event.preventDefault(); void put("/api/settings", { settings }, "Saving settings…"); }}>
              {SETTING_FIELDS.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    type="number"
                    step="0.1"
                    value={settings[field.key]}
                    onChange={(event) => setSettings({ ...settings, [field.key]: Number(event.target.value) })}
                  />
                </label>
              ))}
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
              <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => void readFile(event.target.files?.[0], "import")} />
            </label>
            <button className="primary" type="button" disabled={busy || !importText} onClick={() => void post("/api/import", { adapter, kind, text: importText }, "Importing…")}>Import file</button>
          </div>
        </section>
      </div>
      {aboutOpen ? <AboutDesk onClose={() => setAboutOpen(false)} /> : null}
    </main>
  );
}

function Trace({ stat, implied, locked }: { stat: SlateStat; implied: string | null; locked: boolean }) {
  const projectionDetail = [locked ? "Locked after actuals." : null, stat.blockReason].filter(Boolean).join(" ");
  return (
    <details className="trace">
      <summary>Projection trace</summary>
      <div className="trace-body">
        {stat.baseline != null ? (
          <Step label="SL projection" value={fmt(stat.baseline)} detail={stat.sourcesUsed.length ? stat.sourcesUsed.join(", ") : null} />
        ) : null}
        {stat.adjustments.map((adjustment) => (
          <Step
            key={adjustment.key}
            label={adjustment.label}
            value={adjustment.status === "applied" ? fmt(adjustment.delta) : "skipped"}
            detail={adjustment.detail}
          />
        ))}
        <Step label="Projection" value={stat.projection == null ? "Blocked" : fmt(stat.projection)} detail={projectionDetail || null} />
        {implied ? <Step label="Team points" value="" detail={implied} /> : null}
      </div>
    </details>
  );
}

function Step({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  const line = (
    <>
      <span>{label}</span>
      <b>{value}</b>
    </>
  );
  if (!detail) return <div className="step">{line}</div>;
  return (
    <details className="step-line">
      <summary className="step">{line}</summary>
      <div className="detail">{detail}</div>
    </details>
  );
}
