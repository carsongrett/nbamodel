"use client";

import { useEffect, useState } from "react";
import { formatUnits, type BetWindows } from "../lib/bets";
import AboutDesk from "./AboutDesk";
import DeskNav from "./DeskNav";

const WINDOWS: { key: keyof BetWindows; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "allTime", label: "All time" },
];

export default function BetDesk({ authConfigured }: { authConfigured: boolean }) {
  const [totals, setTotals] = useState<BetWindows | null>(null);
  const [error, setError] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const response = await fetch("/api/bets");
      const text = await response.text();
      let body: Partial<BetWindows> & { ok?: boolean; error?: string } = {};
      try {
        body = text ? JSON.parse(text) as Partial<BetWindows> & { ok?: boolean; error?: string } : {};
      } catch {
        if (!cancel) setError(response.ok ? "Bets could not be loaded." : `Request failed (${response.status}).`);
        return;
      }
      if (cancel) return;
      if (!response.ok || body.ok === false || body.today == null || body.last7 == null || body.last30 == null || body.allTime == null) {
        setError(body.error || "Bets could not be loaded.");
        return;
      }
      setTotals({ today: body.today, last7: body.last7, last30: body.last30, allTime: body.allTime });
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
          const direction = value == null ? "" : value > 0 ? " units-up" : value < 0 ? " units-down" : "";
          return (
            <div key={item.key}>
              <span>{item.label}</span>
              <strong className={direction.trim()}>{value == null ? "—" : formatUnits(value)}</strong>
            </div>
          );
        })}
      </section>
      {error ? <section className="status" aria-live="polite"><p>{error}</p></section> : null}
      {aboutOpen ? <AboutDesk onClose={() => setAboutOpen(false)} /> : null}
    </main>
  );
}
