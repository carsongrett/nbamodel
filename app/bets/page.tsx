import BetDesk from "../../components/BetDesk";
import { authConfigured } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default function BetsPage() {
  return <BetDesk authConfigured={authConfigured()} />;
}
