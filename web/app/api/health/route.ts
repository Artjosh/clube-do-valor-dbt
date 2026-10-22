import { config, json } from "../../../lib/auth/core.ts";
export const dynamic = "force-dynamic";
export async function GET() {
  return json({ status: "ok", auth: { configured: config() !== null, providerHealth: "not_probed" } });
}
