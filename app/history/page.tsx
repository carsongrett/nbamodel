import HistoryDesk from "../../components/HistoryDesk";
import { authConfigured } from "../../lib/auth";
import { chicagoToday } from "../../lib/engine";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  return <HistoryDesk today={chicagoToday()} authConfigured={authConfigured()} />;
}
