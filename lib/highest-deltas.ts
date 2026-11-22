import { absoluteLineDistance } from "./history";

export type HighestDeltaInput = {
  playerId: string;
  gameId: string;
  playerName: string;
  teamId: string;
  opponentId: string;
  projection: number | null;
  line: number | null;
};

export type HighestDelta = {
  playerId: string;
  gameId: string;
  playerName: string;
  teamId: string;
  opponentId: string;
  projection: number;
  line: number;
  delta: number;
};

/** Ten widest projection-minus-line gaps, either side of the line. Signed delta stays negative when the projection is under. */
export function highestDeltas(rows: readonly HighestDeltaInput[], teamId = "", limit = 10): HighestDelta[] {
  const ranked: { gap: number; row: HighestDelta }[] = [];
  for (const row of rows) {
    if (teamId && row.teamId !== teamId) continue;
    if (row.line == null) continue;
    const gap = absoluteLineDistance(row.projection, row.line);
    if (gap == null || row.projection == null) continue;
    ranked.push({
      gap,
      row: {
        playerId: row.playerId,
        gameId: row.gameId,
        playerName: row.playerName,
        teamId: row.teamId,
        opponentId: row.opponentId,
        projection: row.projection,
        line: row.line,
        delta: row.projection - row.line,
      },
    });
  }
  ranked.sort((a, b) => b.gap - a.gap || a.row.playerName.localeCompare(b.row.playerName) || a.row.playerId.localeCompare(b.row.playerId));
  return ranked.slice(0, limit).map((item) => item.row);
}
