/** Clock time in America/Chicago, for example "9:48 PM". Empty when the instant is not a real time. */
export function centralTime(when: Date): string {
  if (Number.isNaN(when.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(when);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const suffix = parts.find((part) => part.type === "dayPeriod")?.value.toUpperCase();
  if (!hour || !minute || (suffix !== "AM" && suffix !== "PM")) return "";
  return `${hour}:${minute} ${suffix}`;
}

/** Clock time in America/Chicago, for example "Updated 9:48 PM". Empty when the instant is not a real time. */
export function formatUpdated(when: Date): string {
  const clock = centralTime(when);
  return clock ? `Updated ${clock}` : "";
}

/** Projections and Lines only. A running button is named. Both finished times stay. */
export function runClock(input: {
  running: "Projections" | "Lines" | null;
  projectionsAt: Date | null;
  linesAt: Date | null;
}): string {
  if (input.running) return `Running ${input.running}`;
  const parts: string[] = [];
  if (input.projectionsAt) {
    const clock = centralTime(input.projectionsAt);
    if (clock) parts.push(`Projections ${clock}`);
  }
  if (input.linesAt) {
    const clock = centralTime(input.linesAt);
    if (clock) parts.push(`Lines ${clock}`);
  }
  return parts.join(" · ");
}
