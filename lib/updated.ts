/** Clock time in America/Chicago, for example "Updated 9:48 PM". Empty when the instant is not a real time. */
export function formatUpdated(when: Date): string {
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
  return `Updated ${hour}:${minute} ${suffix}`;
}
