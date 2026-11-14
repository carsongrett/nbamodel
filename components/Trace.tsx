import type { SlateStat } from "../lib/engine";

function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function Trace({ stat, locked, bare = false }: { stat: SlateStat; locked: boolean; bare?: boolean }) {
  const projectionDetail = [locked ? "Locked after actuals." : null, stat.blockReason].filter(Boolean).join(" ");
  const sportsline = stat.adjustments.find((adjustment) => adjustment.key === "sportsline");
  const dimers = stat.adjustments.find((adjustment) => adjustment.key === "dimers");
  const adjustments = stat.adjustments.filter((adjustment) => adjustment.key !== "sportsline" && adjustment.key !== "dimers");
  const showSportsline = sportsline?.input != null;
  const body = (
    <div className="trace-body">
      {showSportsline ? (
        <Step label="SL projection" value={fmt(sportsline?.input)} detail={null} />
      ) : !dimers && stat.baseline != null ? (
        <Step label="SL projection" value={fmt(stat.baseline)} detail={stat.sourcesUsed.length ? stat.sourcesUsed.join(", ") : null} />
      ) : null}
      {dimers ? (
        <OpenStep
          label="Dimers"
          value={dimers.input == null ? "missing" : fmt(dimers.input)}
          detail={dimers.detail}
        />
      ) : null}
      {adjustments.map((adjustment) => (
        <Step
          key={adjustment.key}
          label={adjustment.label}
          value={adjustment.status === "applied" ? fmt(adjustment.delta) : "skipped"}
          detail={adjustment.detail}
        />
      ))}
      <Step label="Projection" value={stat.projection == null ? "Blocked" : fmt(stat.projection)} detail={projectionDetail || null} />
    </div>
  );
  if (bare) return body;
  return (
    <details className="trace">
      <summary>Projection trace</summary>
      {body}
    </details>
  );
}

function OpenStep({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div>
      <div className="step">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      {detail ? <div className="detail">{detail}</div> : null}
    </div>
  );
}

function Step({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  const line = (
    <>
      <span>{label}</span>
      <b>{value}</b>
    </>
  );
  if (!detail) return <div className="step">{line}</div>;
  return (
    <details className="step-line">
      <summary className="step">{line}</summary>
      <div className="detail">{detail}</div>
    </details>
  );
}
