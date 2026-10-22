import { failure, json } from "../../../lib/auth/core.ts";
import { requireAnalyticsAccess } from "../../../lib/auth/guard.ts";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  try { await requireAnalyticsAccess(request); } catch (error) { return failure(error); }
  const { analyticsCsv, parseFilters } = await import("../../../lib/analytics.ts");
  try {
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind") || "transactions";
    if (!["transactions", "portfolios", "clients"].includes(kind)) return json({ error: "invalid_export_kind" }, 400);
    return new Response(analyticsCsv(kind, parseFilters(params)), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="cdv-${kind}.csv"`,
      "Cache-Control": "private, no-store", "Vary": "Cookie", "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff", "X-CDV-Data-Access": "private",
    } });
  } catch { return json({ error: "invalid_filters" }, 400); }
}
