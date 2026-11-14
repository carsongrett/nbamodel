import Dashboard from "../components/Dashboard";
import { authConfigured } from "../lib/auth";
import { chicagoToday } from "../lib/engine";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Dashboard initialDate={chicagoToday()} authConfigured={authConfigured()} />;
}
