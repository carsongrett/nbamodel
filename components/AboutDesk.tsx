"use client";

import { useEffect } from "react";

const SOURCES = [
  { site: "SportsLine", tone: "accent", gives: "Points, rebounds, minutes" },
  { site: "Basketball Reference", tone: "info", gives: "Usage, rebounds per minute, last 15" },
  { site: "FantasyPros", tone: "warn", gives: "Defense vs position" },
  { site: "TeamRankings", tone: "warn", gives: "Opponent rebounds allowed" },
  { site: "BettingPros", tone: "good", gives: "The line" },
];

const POINTS = [
  { site: "SportsLine", piece: "Points", how: "", tone: "accent", example: "SportsLine points are 22.00. That number is the start." },
  { site: "FantasyPros", piece: "Defense", how: "÷ 2", tone: "warn", example: "This defense allows 1.00 more points than the position average. 1.00 / 2 = +0.50." },
  { site: "Reference", piece: "Pace", how: "÷ 5", tone: "info", example: "Opponent pace is 7.50 possessions above the league. 7.50 / 5 = +1.50." },
  { site: "Reference − line", piece: "Last 15", how: "÷ 10", tone: "info", example: "Last 15 games: 24.00 points per game. The line is 21.00. (24.00 − 21.00) / 10 = +0.30." },
  { site: "Share − line", piece: "Minutes share", how: "÷ 3", tone: "good", example: "120 team points × 36 / 48 × 25 / 100 = 22.50. (22.50 − 21.00 line) / 3 = +0.50." },
  { site: "Result", piece: "Projection", how: "", tone: "ink", example: "22.00 + 0.50 + 1.50 + 0.30 + 0.50 = 24.80 points." },
];

const REBOUNDS = [
  { site: "SportsLine", piece: "Rebounds", how: "", tone: "accent", example: "SportsLine rebounds are 8.00. That number is the start." },
  { site: "FantasyPros", piece: "Defense", how: "÷ 2", tone: "warn", example: "This defense allows 1.00 more rebounds than the position average. 1.00 / 2 = +0.50." },
  { site: "Reference", piece: "Pace", how: "÷ 7.5", tone: "info", example: "Opponent pace is 7.50 possessions above the league. 7.50 / 7.5 = +1.00." },
  { site: "Reference − SportsLine", piece: "Last 15", how: "÷ 10", tone: "info", example: "Last 15 games: 9.00 rebounds per game. SportsLine is 8.00. (9.00 − 8.00) / 10 = +0.10." },
  { site: "Reference − SportsLine", piece: "Per minute", how: "÷ 2", tone: "info", example: "0.25 rebounds per minute × 36 minutes = 9.00. (9.00 − 8.00 SportsLine) / 2 = +0.50." },
  { site: "TeamRankings", piece: "Opponent rebounds", how: "÷ 10", tone: "warn", example: "The blend is 1.00 rebound above the league. 1.00 / 10 = +0.10." },
  { site: "Result", piece: "Projection", how: "", tone: "ink", example: "8.00 + 0.50 + 1.00 + 0.10 + 0.50 + 0.10 = 10.20 rebounds." },
];

const FINISH = [
  { op: "", site: "Points", piece: "Projection", tone: "ink", example: "The points projection above is 24.80." },
  { op: "+", site: "Rebounds", piece: "Projection", tone: "ink", example: "The rebounds projection above is 10.20." },
  { op: "=", site: "Together", piece: "Points + rebounds", tone: "ink", example: "24.80 + 10.20 = 35.00." },
  { op: "−", site: "BettingPros", piece: "Line", tone: "good", example: "The points-plus-rebounds line is 31.50." },
  { op: "=", site: "Pick", piece: "Edge", tone: "ink", example: "35.00 − 31.50 = +3.50, so the pick is the over." },
];

function ExampleBox({ tone, site, piece, how, example }: { tone: string; site: string; piece: string; how?: string; example: string }) {
  return (
    <details className="math-tip">
      <summary className={`math-box tone-${tone}`}>
        <span className="site">{site}</span>
        <b>{piece}</b>
        {how != null ? <span className="how">{how}</span> : null}
      </summary>
      <p className="math-example">{example}</p>
    </details>
  );
}

function Flow({ title, steps }: { title: string; steps: { site: string; piece: string; how: string; tone: string; example: string }[] }) {
  return (
    <section className="about-block">
      <h3>{title}</h3>
      <div className="math">
        {steps.map((step, index) => (
          <div className="math-piece" key={`${title}-${step.piece}`}>
            {index > 0 && index < steps.length - 1 ? <span className="math-op">+</span> : null}
            {index === steps.length - 1 ? <span className="math-op">=</span> : null}
            <ExampleBox tone={step.tone} site={step.site} piece={step.piece} how={step.how} example={step.example} />
          </div>
        ))}
      </div>
    </section>
  );
}

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

        <p className="sub">Click a box. One sample player runs through every step.</p>
        <Flow title="Points" steps={POINTS} />
        <Flow title="Rebounds" steps={REBOUNDS} />

        <div className="math finish">
          {FINISH.map((step) => (
            <div className="math-piece" key={`${step.site}-${step.piece}`}>
              {step.op ? <span className="math-op">{step.op}</span> : null}
              <ExampleBox tone={step.tone} site={step.site} piece={step.piece} example={step.example} />
            </div>
          ))}
        </div>

        <div className="unused">
          <span>Not used</span>
          <b>NumberFire</b>
          <b>SportsLine PROJ</b>
        </div>
      </div>
    </div>
  );
}
