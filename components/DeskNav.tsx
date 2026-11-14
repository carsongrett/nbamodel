import Link from "next/link";

export default function DeskNav({ current }: { current: "today" | "history" | "bets" }) {
  return (
    <nav className="desk-nav" aria-label="Desk">
      <Link href="/" aria-current={current === "today" ? "page" : undefined}>Today</Link>
      <Link href="/history" aria-current={current === "history" ? "page" : undefined}>History</Link>
      <Link href="/bets" aria-current={current === "bets" ? "page" : undefined}>Bet tracking</Link>
    </nav>
  );
}
