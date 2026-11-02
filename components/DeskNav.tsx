import Link from "next/link";

export default function DeskNav({ current }: { current: "today" | "history" }) {
  return (
    <nav className="desk-nav" aria-label="Desk">
      <Link href="/" aria-current={current === "today" ? "page" : undefined}>Today</Link>
      <Link href="/history" aria-current={current === "history" ? "page" : undefined}>History</Link>
    </nav>
  );
}
