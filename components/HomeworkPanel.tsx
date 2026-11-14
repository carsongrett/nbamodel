"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import type { SlateStat } from "../lib/engine";
import type { HomeworkRow } from "../lib/homework";
import Trace from "./Trace";

export type HomeworkCard = HomeworkRow & { cell: SlateStat; locked: boolean };

function deltaStyle(edge: number | null): CSSProperties | undefined {
  if (edge == null || Math.abs(edge) < 0.05) return undefined;
  const amount = Math.min(Math.abs(edge) / 4, 1);
  const alpha = (0.14 + amount * 0.46).toFixed(2);
  const color = edge > 0 ? `rgba(22, 101, 52, ${alpha})` : `rgba(159, 18, 57, ${alpha})`;
  return { background: color };
}

function compact(value: number, digits: number): string {
  return value.toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function signed(value: number): string {
  if (Math.abs(value) < 0.005) return "0";
  const text = compact(Math.abs(value), 2);
  return value > 0 ? `+${text}` : `−${text}`;
}

export default function HomeworkPanel({ rows }: { rows: HomeworkCard[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <section className="homework card" aria-label="Homework">
      <h2>Homework</h2>
      {rows.length === 0 ? (
        <p className="homework-empty">No points or rebounds line on this board.</p>
      ) : rows.map((row) => {
        const key = `${row.playerId}|${row.gameId}|${row.stat}`;
        const open = openKey === key;
        function toggle() {
          setOpenKey(open ? null : key);
        }
        function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggle();
        }
        return (
          <article className="homework-row" key={key}>
            <div
              className="homework-open"
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onClick={toggle}
              onKeyDown={onKeyDown}
            >
              <div className="homework-who">
                <span className="player">{row.playerName}</span>
                <span className="meta">{row.teamId} vs {row.opponentId} · {row.statLabel}</span>
              </div>
              <div className="homework-numbers">
                <span className="homework-delta" style={deltaStyle(row.delta)}>{signed(row.delta)}</span>
                <span className="homework-pill">{compact(row.projection, 2)} proj</span>
                <span className="homework-pill">{compact(row.line, 1)} line</span>
              </div>
              {row.role ? (
                <p className="homework-role">
                  {row.role}
                  {row.injury ? <> · <span className="lineup-injury">{row.injury}</span></> : null}
                </p>
              ) : null}
              {row.last5 ? <p className="homework-last">{row.last5}</p> : null}
              {row.note ? <p className="homework-note">{row.note}</p> : null}
            </div>
            {open ? (
              <div className="homework-breakout">
                <button className="homework-close" type="button" onClick={() => setOpenKey(null)}>Close</button>
                <Trace stat={row.cell} locked={row.locked} bare />
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
