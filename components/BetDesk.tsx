"use client";

import { useEffect, useState } from "react";
import { formatDollars, formatRecord, formatSlateDay, formatStake, formatUnits, resultUnits, type BetTracking, type BetWindows } from "../lib/bets";
import AboutDesk from "./AboutDesk";
import DeskNav from "./DeskNav";

const WINDOWS: { key: keyof BetWindows; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "allTime", label: "All time" },
];

function isWindow(value: BetTracking["dollars"] | undefined): value is BetTracking["dollars"] {
  return value != null && value.today != null && value.last7 != null && value.last30 != null && value.allTime != null;
}

function isTracking(body: Partial<BetTracking> & { ok?: boolean }): body is BetTracking {
  return body.today != null && body.last7 != null && body.last30 != null && body.allTime != null
    && body.records != null
    && isWindow(body.dollars)
    && Array.isArray(body.settled)
    && Array.isArray(body.pending);
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
      <section className="card bet-list" aria-label="Settled bets">
        <h2>Settled</h2>
        {totals && totals.settled.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Player</th>
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
                    <td className="num">{formatUnits(resultUnits(bet.units, bet.result))}</td>
                    <td className="num">{formatDollars(bet.dollars)}</td>
                    <td><span className={`grade ${bet.result.toLowerCase()}`}>{bet.result}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <section className="card bet-list" aria-label="Pending bets">
        <h2>Pending</h2>
        {totals && totals.pending.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num">Units</th>
                </tr>
              </thead>
              <tbody>
                {totals.pending.map((bet, index) => (
                  <tr key={`${bet.playerName}|${bet.units}|${index}`}>
                    <td>{bet.playerName}</td>
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
