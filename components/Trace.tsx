import type { SlateStat } from "../lib/engine";

function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function Trace({ stat, implied, locked }: { stat: SlateStat; implied: string | null; locked: boolean }) {
  const projectionDetail = [locked ? "Locked after actuals." : null, stat.blockReason].filter(Boolean).join(" ");
  return (
    <details className="trace">
      <summary>Projection trace</summary>
      <div className="trace-body">
        {stat.baseline != null ? (
          <Step label="SL projection" value={fmt(stat.baseline)} detail={stat.sourcesUsed.length ? stat.sourcesUsed.join(", ") : null} />
        ) : null}
        {stat.adjustments.map((adjustment) => (
          <Step
            key={adjustment.key}
            label={adjustment.label}
            value={adjustment.status === "applied" ? fmt(adjustment.delta) : "skipped"}
            detail={adjustment.detail}
          />
        ))}
        <Step label="Projection" value={stat.projection == null ? "Blocked" : fmt(stat.projection)} detail={projectionDetail || null} />
        {implied ? <Step label="Team points" value="" detail={implied} /> : null}
      </div>
    </details>
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
