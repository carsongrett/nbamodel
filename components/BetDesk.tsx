"use client";

import { useEffect, useState } from "react";
import { formatDollars, formatRecord, formatSlateDay, formatStake, formatUnits, resultUnits, type BetTracking, type BetWindows, type CumulativeDollar, type PendingBetRow } from "../lib/bets";
import AboutDesk from "./AboutDesk";
import DeskNav from "./DeskNav";

const WINDOWS: { key: keyof BetWindows; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "allTime", label: "All time" },
];

function blankNum(value: number | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pendingStat(stat: PendingBetRow["stat"]): string {
  if (stat === "points") return "Points";
  if (stat === "rebounds") return "Rebounds";
  if (stat === "points_rebounds") return "Points + rebounds";
  return "";
}

function pendingSide(side: PendingBetRow["side"]): string {
  if (side === "over") return "Over";
  if (side === "under") return "Under";
  return "";
}

function isWindow(value: BetTracking["dollars"] | undefined): value is BetTracking["dollars"] {
  return value != null && value.today != null && value.last7 != null && value.last30 != null && value.allTime != null;
}

function isTracking(body: Partial<BetTracking> & { ok?: boolean }): body is BetTracking {
  return body.today != null && body.last7 != null && body.last30 != null && body.allTime != null
    && body.records != null
    && isWindow(body.dollars)
    && Array.isArray(body.cumulativeDollars)
    && Array.isArray(body.settled)
    && Array.isArray(body.pending);
}

type SquareLine = {
  plotX: number;
  plotY: number;
  plotSize: number;
  path: string;
  dots: { x: number; y: number; value: string; anchor: "start" | "middle" | "end"; labelY: number }[];
  yTicks: { y: number; label: string; zero: boolean }[];
  xLabels: { x: number; label: string }[];
};

function niceBounds(min: number, max: number): { min: number; max: number; step: number } {
  let low = min;
  let high = max;
  if (high === low) {
    low -= 1;
    high += 1;
  }
  const rough = (high - low) / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.abs(rough))));
  const fraction = rough / pow;
  const nice = fraction >= 5 ? 10 : fraction >= 2 ? 5 : fraction >= 1 ? 2 : 1;
  const step = nice * pow;
  const niceMin = Math.floor(low / step) * step;
  const niceMax = Math.ceil(high / step) * step;
  return { min: niceMin, max: niceMax === niceMin ? niceMin + step : niceMax, step };
}

function cumulativeSquare(points: readonly CumulativeDollar[]): SquareLine | null {
  if (points.length === 0) return null;
  const plotX = 92;
  const plotY = 18;
  const plotSize = 298;
  const values = points.map((point) => point.dollars);
  const bounds = niceBounds(Math.min(0, ...values), Math.max(0, ...values));
  const span = bounds.max - bounds.min;
  const inset = 8;
  const yAt = (value: number) => plotY + inset + (1 - (value - bounds.min) / span) * (plotSize - inset * 2);
  const xAt = (index: number) => points.length === 1
    ? plotX + plotSize / 2
    : plotX + inset + (index / (points.length - 1)) * (plotSize - inset * 2);
  const path = points.length === 1
    ? `${(plotX + inset).toFixed(2)},${yAt(points[0].dollars).toFixed(2)} ${(plotX + plotSize - inset).toFixed(2)},${yAt(points[0].dollars).toFixed(2)}`
    : points.map((point, index) => `${xAt(index).toFixed(2)},${yAt(point.dollars).toFixed(2)}`).join(" ");
  const yTicks: SquareLine["yTicks"] = [];
  const steps = Math.round((bounds.max - bounds.min) / bounds.step);
  for (let i = 0; i <= steps && i < 8; i += 1) {
    const value = Math.round((bounds.min + i * bounds.step) * 100) / 100;
    yTicks.push({ y: yAt(value), label: formatDollars(value), zero: value === 0 });
  }
  const indexes: number[] = [];
  if (points.length <= 6) {
    points.forEach((_, index) => indexes.push(index));
  } else {
    const marks = new Set<number>([0, points.length - 1]);
    for (let i = 1; i <= 4; i += 1) marks.add(Math.round((i * (points.length - 1)) / 5));
    indexes.push(...[...marks].sort((a, b) => a - b));
  }
  const xLabels: SquareLine["xLabels"] = [];
  for (const index of indexes) {
    const label = formatSlateDay(points[index].slateDate);
    const x = xAt(index);
    const previous = xLabels[xLabels.length - 1];
    if (previous && previous.label === label) {
      previous.x = (previous.x + x) / 2;
      continue;
    }
    xLabels.push({ x, label });
  }
  const dots = points.map((point, index) => {
    const x = xAt(index);
    const y = yAt(point.dollars);
    const anchor: "start" | "middle" | "end" = x < plotX + 52 ? "start" : x > plotX + plotSize - 52 ? "end" : "middle";
    const labelY = y < plotY + 28 ? y + 16 : y - 12;
    return { x, y, value: points.length <= 8 ? formatDollars(point.dollars) : "", anchor, labelY };
  });
  return { plotX, plotY, plotSize, path, dots, yTicks, xLabels };
}

function CumulativeDollars({ points }: { points: readonly CumulativeDollar[] }) {
  const line = cumulativeSquare(points);
  const end = points.length > 0 ? points[points.length - 1].dollars : null;
  const direction = end == null ? "" : end > 0 ? "units-up" : end < 0 ? "units-down" : "";
  const axisY = line ? line.plotY + line.plotSize / 2 : 0;
  return (
    <section className="card cumulative-dollars" aria-label="Cumulative dollars, all settled bets">
      <div className="cumulative-head">
        <h2>Cumulative dollars, all settled bets</h2>
        <strong className={direction}>{end == null ? "—" : formatDollars(end)}</strong>
      </div>
      {line ? (
        <svg className="cumulative-square" viewBox="0 0 400 400" role="img" aria-label="Cumulative dollars, all settled bets">
          <text className="axis" x={16} y={axisY} textAnchor="middle" transform={`rotate(-90 16 ${axisY})`}>Dollars</text>
          <rect className="frame" x={line.plotX} y={line.plotY} width={line.plotSize} height={line.plotSize} />
          {line.yTicks.map((tick) => (
            <g key={`y-${tick.label}`}>
              <line className={tick.zero ? "zero" : "grid"} x1={line.plotX} x2={line.plotX + line.plotSize} y1={tick.y} y2={tick.y} />
              <text className="tick" x={line.plotX - 8} y={tick.y} textAnchor="end" dominantBaseline="middle">{tick.label}</text>
            </g>
          ))}
          <polyline className="path" points={line.path} />
          {line.dots.map((dot, index) => (
            <g key={`dot-${index}`}>
              <circle className="dot" cx={dot.x} cy={dot.y} r={4} />
              {dot.value ? <text className="value" x={dot.x} y={dot.labelY} textAnchor={dot.anchor}>{dot.value}</text> : null}
            </g>
          ))}
          {line.xLabels.map((label) => (
            <text className="tick" key={`x-${label.label}-${label.x}`} x={label.x} y={line.plotY + line.plotSize + 20} textAnchor="middle">{label.label}</text>
          ))}
          <text className="axis" x={line.plotX + line.plotSize / 2} y={line.plotY + line.plotSize + 42} textAnchor="middle">Date</text>
        </svg>
      ) : null}
    </section>
  );
}

export default function BetDesk({ authConfigured }: { authConfigured: boolean }) {
  const [totals, setTotals] = useState<BetTracking | null>(null);
  const [error, setError] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const response = await fetch("/api/bets");
      const text = await response.text();
      let body: Partial<BetTracking> & { ok?: boolean; error?: string } = {};
      try {
        body = text ? JSON.parse(text) as Partial<BetTracking> & { ok?: boolean; error?: string } : {};
      } catch {
        if (!cancel) setError(response.ok ? "Bets could not be loaded." : `Request failed (${response.status}).`);
        return;
      }
      if (cancel) return;
      if (!response.ok || body.ok === false || !isTracking(body)) {
        setError(body.error || "Bets could not be loaded.");
        return;
      }
      setTotals(body);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">2026–27 season</p>
          <h1>Bet tracking</h1>
          <DeskNav current="bets" />
        </div>
        <div className="top-actions">
          <button className="about-open" type="button" aria-haspopup="dialog" aria-expanded={aboutOpen} onClick={() => setAboutOpen(true)}>?</button>
          {authConfigured ? (
            <button className="ghost" type="button" onClick={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/login"; })}>Sign out</button>
          ) : null}
        </div>
      </header>
      <section className="summary" aria-label="Bet tracking">
        {WINDOWS.map((item) => {
          const value = totals ? totals[item.key] : null;
          const dollars = totals ? totals.dollars[item.key] : null;
          const record = totals?.records[item.key];
          const direction = value == null ? "" : value > 0 ? "units-up" : value < 0 ? "units-down" : "";
          const dollarDirection = dollars == null ? "" : dollars > 0 ? "units-up" : dollars < 0 ? "units-down" : "";
          return (
            <div key={item.key}>
              <span>{item.label}</span>
              <div className="bet-figures">
                <strong className={direction}>{value == null ? "—" : formatUnits(value)}</strong>
                <span className={`bet-dollars ${dollarDirection}`}>{dollars == null ? "—" : formatDollars(dollars)}</span>
                <span className="bet-record">{record == null ? "—" : formatRecord(record.wins, record.losses)}</span>
              </div>
            </div>
          );
        })}
      </section>
      <CumulativeDollars points={totals?.cumulativeDollars ?? []} />
      <details className="game bet-list" open aria-label="Settled bets">
        <summary>
          <span className="player">Settled</span>
        </summary>
        {totals && totals.settled.length > 0 ? (
          <div className="table-wrap game-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Player</th>
                  <th className="num">Line</th>
                  <th className="num">Projection</th>
                  <th className="num">Actual</th>
                  <th className="num">Units</th>
                  <th className="num">Dollars</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {totals.settled.map((bet, index) => (
                  <tr key={`${bet.slateDate}|${bet.playerName}|${bet.units}|${bet.result}|${index}`}>
                    <td>{formatSlateDay(bet.slateDate)}</td>
                    <td>{bet.playerName}</td>
                    <td className="num">{blankNum(bet.line, 1)}</td>
                    <td className="num">{blankNum(bet.projection)}</td>
                    <td className="num">{blankNum(bet.actual, 1)}</td>
                    <td className="num">{formatUnits(resultUnits(bet.units, bet.result))}</td>
                    <td className="num">{formatDollars(bet.dollars)}</td>
                    <td><span className={`grade ${bet.result.toLowerCase()}`}>{bet.result}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </details>
      <section className="card bet-list" aria-label="Pending bets">
        <h2>Pending</h2>
        {totals && totals.pending.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Stat</th>
                  <th>Over/Under</th>
                  <th className="num">Line</th>
                  <th className="num">Projection</th>
                  <th className="num">Units</th>
                </tr>
              </thead>
              <tbody>
                {totals.pending.map((bet, index) => (
                  <tr key={`${bet.playerName}|${bet.stat ?? ""}|${bet.units}|${index}`}>
                    <td>{bet.playerName}</td>
                    <td>{pendingStat(bet.stat)}</td>
                    <td>{pendingSide(bet.side)}</td>
                    <td className="num">{blankNum(bet.line, 1)}</td>
                    <td className="num">{blankNum(bet.projection)}</td>
                    <td className="num">{formatStake(bet.units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {error ? <section className="status" aria-live="polite"><p>{error}</p></section> : null}
      {aboutOpen ? <AboutDesk onClose={() => setAboutOpen(false)} /> : null}
    </main>
  );
}
