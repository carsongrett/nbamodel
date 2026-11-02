"use client";

import { useEffect } from "react";

const SOURCES = [
  { site: "SportsLine", tone: "accent", gives: "Points, rebounds, minutes" },
  { site: "Basketball Reference", tone: "info", gives: "Usage, rebounds per minute, last 15" },
  { site: "Hashtag", tone: "warn", gives: "Defense vs position" },
  { site: "BettingPros", tone: "good", gives: "The line" },
];

const POINTS = [
  { site: "SportsLine", piece: "Points", how: "", tone: "accent" },
  { site: "Hashtag", piece: "Defense", how: "÷ 2", tone: "warn" },
  { site: "Reference − line", piece: "Last 15", how: "÷ 10", tone: "info" },
  { site: "Share − line", piece: "Minutes share", how: "÷ 3", tone: "good" },
];

const REBOUNDS = [
  { site: "SportsLine", piece: "Rebounds", how: "", tone: "accent" },
  { site: "Hashtag", piece: "Defense", how: "÷ 2", tone: "warn" },
  { site: "Reference − SportsLine", piece: "Last 15", how: "÷ 10", tone: "info" },
  { site: "Reference − SportsLine", piece: "Per minute", how: "÷ 2", tone: "info" },
];

function Flow({ title, steps }: { title: string; steps: { site: string; piece: string; how: string; tone: string }[] }) {
  return (
    <section className="about-block">
      <h3>{title}</h3>
      <div className="math">
        {steps.map((step, index) => (
          <div className="math-piece" key={`${title}-${step.piece}`}>
            {index > 0 ? <span className="math-op">+</span> : null}
            <div className={`math-box tone-${step.tone}`}>
              <span className="site">{step.site}</span>
              <b>{step.piece}</b>
              {step.how ? <span className="how">{step.how}</span> : <span className="how" />}
            </div>
          </div>
        ))}
        <span className="math-op">=</span>
        <div className="math-box tone-ink">
          <span className="site">Result</span>
          <b>Projection</b>
          <span className="how" />
        </div>
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

        <Flow title="Points" steps={POINTS} />
        <Flow title="Rebounds" steps={REBOUNDS} />

        <div className="math finish">
          <div className="math-box tone-ink"><span className="site">Points</span><b>Projection</b></div>
          <span className="math-op">+</span>
          <div className="math-box tone-ink"><span className="site">Rebounds</span><b>Projection</b></div>
          <span className="math-op">=</span>
          <div className="math-box tone-ink"><span className="site">Together</span><b>Points + rebounds</b></div>
          <span className="math-op">−</span>
          <div className="math-box tone-good"><span className="site">BettingPros</span><b>Line</b></div>
          <span className="math-op">=</span>
          <div className="math-box tone-ink"><span className="site">Pick</span><b>Edge</b></div>
        </div>

        <div className="unused">
          <span>Not used</span>
          <b>NumberFire</b>
          <b>Pace</b>
          <b>Opponent rebounds</b>
          <b>SportsLine PROJ</b>
        </div>
      </div>
    </div>
  );
}
