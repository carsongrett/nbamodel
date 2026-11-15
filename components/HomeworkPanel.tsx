"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { formatStake } from "../lib/bets";
import type { SlateStat } from "../lib/engine";
import { lastFifteenMpgLabel, type HomeworkLog, type HomeworkRow } from "../lib/homework";
import type { LineupPlayer, LineupTeam } from "../lib/sources/rotowire-lineups";
import { canonicalTeam } from "../lib/sources/teams";
import Trace from "./Trace";

export type HomeworkCard = HomeworkRow & {
  cell: SlateStat;
  locked: boolean;
  homeTeamId: string;
  spread: number | null;
  total: number | null;
};

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

function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function marketText(row: HomeworkCard): string {
  const parts: string[] = [];
  if (row.spread != null && row.homeTeamId) {
    const sign = row.spread > 0 ? "+" : row.spread < 0 ? "−" : "";
    parts.push(`${row.homeTeamId} ${sign}${numberText(Math.abs(row.spread))}`);
  } else if (row.spread != null) {
    const sign = row.spread > 0 ? "+" : row.spread < 0 ? "−" : "";
    parts.push(`${sign}${numberText(Math.abs(row.spread))}`);
  }
  if (row.total != null) parts.push(`Total ${numberText(row.total)}`);
  return parts.join(" · ");
}

function teamLineup(teams: readonly LineupTeam[] | null, teamId: string): LineupTeam | null {
  if (!teams) return null;
  const id = canonicalTeam(teamId) ?? teamId.trim().toUpperCase();
  return teams.find((team) => team.teamId === id) ?? null;
}

function roleLabel(team: LineupTeam, player: LineupPlayer): string {
  if (player.role === "bench") return "Bench";
  return team.confirmed ? "Starting · confirmed" : "Starting";
}

function lineupName(player: LineupPlayer, role: string): string {
  return player.position ? `${player.name} · ${player.position} · ${role}` : `${player.name} · ${role}`;
}

export default function HomeworkPanel({
  rows,
  lineups,
  logs,
  busy,
  onUnits,
}: {
  rows: HomeworkCard[];
  lineups: readonly LineupTeam[] | null;
  logs: readonly HomeworkLog[];
  busy: boolean;
  onUnits: (row: HomeworkCard, units: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [lineupKey, setLineupKey] = useState<string | null>(null);
  return (
    <section className="homework card" aria-label="Homework">
      <h2>Biggest deltas today</h2>
      {rows.length === 0 ? (
        <p className="homework-empty">No points or rebounds line on this board.</p>
      ) : rows.map((row) => {
        const key = `${row.playerId}|${row.gameId}|${row.stat}`;
        const open = openKey === key;
        const lineupOpen = lineupKey === key;
        const market = marketText(row);
        function toggle() {
          setOpenKey(open ? null : key);
        }
        function toggleLineup() {
          setLineupKey(lineupOpen ? null : key);
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
                <span className="meta"><strong className="homework-team">{row.teamId}</strong> vs {row.opponentId} · {row.statLabel}</span>
              </div>
              <div className="homework-numbers">
                <span className="homework-delta" style={deltaStyle(row.delta)}>{signed(row.delta)}</span>
                <span className="homework-pill">{compact(row.projection, 2)} proj</span>
                <span className="homework-pill">{compact(row.line, 1)} line</span>
              </div>
              {market ? <p className="homework-market">{market}</p> : null}
              {row.last5 ? (
                <p className="homework-last">
                  {row.last5.split(" · ").map((line, index) => <span key={index}>{line}</span>)}
                </p>
              ) : null}
            </div>
            <div className="homework-actions">
              <label className="homework-units">
                Units
                {row.locked ? (
                  <span>{row.cell.units != null && row.cell.units > 0 ? formatStake(row.cell.units) : "—"}</span>
                ) : (
                  <input
                    className="line-input"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    aria-label={`${row.playerName} ${row.stat} bet`}
                    defaultValue={row.cell.units ?? ""}
                    key={`${key}|bet|${row.cell.units ?? ""}`}
                    disabled={busy}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      const current = row.cell.units == null ? "" : String(row.cell.units);
                      if (next === current) return;
                      onUnits(row, next);
                    }}
                  />
                )}
              </label>
              <button className="homework-lineup" type="button" aria-expanded={lineupOpen} onClick={toggleLineup}>
                {lineups ? "Lineup" : "Lineup not checked"}
              </button>
            </div>
            {lineupOpen ? (
              <LineupBreakout lineups={lineups} teamIds={[row.teamId]} logs={logs} onClose={() => setLineupKey(null)} />
            ) : null}
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

export function LineupBreakout({
  lineups,
  teamIds,
  logs,
  onClose,
}: {
  lineups: readonly LineupTeam[] | null;
  teamIds: readonly string[];
  logs: readonly HomeworkLog[];
  onClose: () => void;
}) {
  return (
    <div className="homework-breakout">
      <button className="homework-close" type="button" onClick={onClose}>Close</button>
      {lineups == null ? (
        <p className="homework-note">The injury check has not been run this visit.</p>
      ) : teamIds.map((teamId) => {
        const team = teamLineup(lineups, teamId);
        const starters = team?.players.filter((player) => player.role === "starter") ?? [];
        const bench = team?.players.filter((player) => player.role === "bench") ?? [];
        return (
          <div key={teamId}>
            {teamIds.length > 1 ? <p className="homework-market">{teamId}</p> : null}
            {!team ? (
              <p className="homework-note">This team was not on the lineup check.</p>
            ) : (
              <ul className="homework-lineup-list">
                {[...starters, ...bench].map((player) => {
                  const mpg = lastFifteenMpgLabel(logs, player.name, teamId);
                  return (
                    <li key={`${teamId}|${player.role}|${player.name}`}>
                      {lineupName(player, roleLabel(team, player))}
                      {player.injury ? <> · <span className="lineup-injury">{player.injury}</span></> : null}
                      {mpg ? ` · ${mpg}` : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
