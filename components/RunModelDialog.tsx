"use client";

import { useEffect } from "react";

const STEPS = [
  {
    n: "1",
    title: "Refresh games",
    body: "Downloads SportsLine, Basketball Reference, Hashtag, and BettingPros, then stores those inputs. It does not save the projection History will grade.",
  },
  {
    n: "2",
    title: "This board",
    body: "The numbers on Today are a live preview. They move when you refresh or change a divisor. A preview is not the record.",
  },
  {
    n: "3",
    title: "Run Model",
    body: "Writes one row per stat: the projection, the line, the odds, each adjustment, and the time. History grades that row.",
  },
  {
    n: "4",
    title: "The next morning",
    body: "Refresh games on the new day stores results for games already on the desk. History compares those results with the saved projection and the saved line. Once results are stored, Run Model leaves that row alone.",
  },
];

export default function RunModelDialog({
  dateLabel,
  busy,
  onClose,
  onConfirm,
}: {
  dateLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="about-back" onClick={onClose}>
      <div className="about run-dialog" role="dialog" aria-modal="true" aria-labelledby="run-title" onClick={(event) => event.stopPropagation()}>
        <header className="about-head">
          <div>
            <p className="eyebrow">Before tip</p>
            <h2 id="run-title">What Run Model saves</h2>
          </div>
          <button className="ghost" type="button" onClick={onClose}>Close</button>
        </header>
        <p className="sub">Refresh games fills the board. Run Model is the save. Closing this writes nothing.</p>
        <div className="run-steps">
          {STEPS.map((step) => (
            <article className="run-step" key={step.n}>
              <span className="run-n">{step.n}</span>
              <div>
                <b>{step.title}</b>
                <p>{step.body}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="run-actions">
          <p className="meta">Saves the {dateLabel} slate.</p>
          <button className="primary" type="button" disabled={busy} onClick={onConfirm}>Save this slate</button>
        </div>
      </div>
    </div>
  );
}
