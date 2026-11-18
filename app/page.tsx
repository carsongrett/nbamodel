import Dashboard from "../components/Dashboard";
import { authConfigured } from "../lib/auth";
import { buildSlate, chicagoToday } from "../lib/engine";
import { getStore } from "../lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const date = chicagoToday();
  const slate = buildSlate(await getStore().read(), date);
  return (
    <Dashboard
      initialDate={date}
      authConfigured={authConfigured()}
      initialProjectionsAt={slate.projectionsAt}
      initialLinesAt={slate.linesAt}
    />
  );
}
