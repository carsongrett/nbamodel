"use client";

import { useEffect } from "react";

const SOURCES = [
  { site: "SportsLine", tone: "accent", gives: "Points and minutes" },
  { site: "Dimers", tone: "good", gives: "Points" },
  { site: "Basketball Reference", tone: "info", gives: "Pace, last 15 days, usage" },
  { site: "FantasyPros", tone: "warn", gives: "Defense vs position" },
  { site: "ESPN", tone: "ink", gives: "Spread and total" },
];

const POINTS = [
  {
    title: "Baseline",
    body: "The baseline is SportsLine × 0.65 + Dimers × 0.35. If one source is missing, the other is the whole baseline and the row notes it.",
  },
  {
    title: "Defense vs position",
    body: "Defense vs position is FantasyPros FanDuel, last 30 at 30% and last 15 at 70%, then divided by the DvP slider, which defaults to 2.",
  },
  {
    title: "Pace",
    body: "Pace is opponent pace minus league pace, divided by 5. Both numbers are Basketball Reference season pace.",
  },
  {
    title: "Recent",
    body: "Recent is Basketball Reference last-15-days points per game minus the points baseline, divided by 10.",
  },
  {
    title: "Minutes",
    body: "Minutes is implied team points × (SportsLine minutes / 48) × (Basketball Reference season usage percent / 100), minus the points baseline, divided by the minutes slider, which defaults to 3. Team points are half the game total, plus the spread when the team is favored and minus it when not. Spread and total come from ESPN.",
  },
  {
    title: "Projection",
    body: "The projection is the baseline plus those adjustments.",
  },
];

export default function AboutDesk({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="about-back" onClick={onClose}>
      <div className="about" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(event) => event.stopPropagation()}>
        <header className="about-head">
          <div>
            <p className="eyebrow">Where the numbers come from</p>
            <h2 id="about-title">Sources and the math</h2>
          </div>
          <button className="ghost" type="button" onClick={onClose}>Close</button>
        </header>

        <div className="source-board">
          {SOURCES.map((source) => (
            <article className={`source-card tone-${source.tone}`} key={source.site}>
              <b>{source.site}</b>
              <span>{source.gives}</span>
            </article>
          ))}
        </div>

        <section className="about-block" aria-labelledby="points-math">
          <h3 id="points-math">Points</h3>
          <ol className="math-steps">
            {POINTS.map((step) => (
              <li key={step.title}>
                <strong>{step.title}.</strong> {step.body}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
