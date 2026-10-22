import { failure, json } from "../../../lib/auth/core.ts";
import { requireAnalyticsAccess } from "../../../lib/auth/guard.ts";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  try { await requireAnalyticsAccess(request); } catch (error) { return failure(error); }
  // Authorization must precede snapshot loading and filter parsing, including invalid requests.
  const { getAnalytics, parseFilters } = await import("../../../lib/analytics.ts");
  try {
    const response = json(getAnalytics(parseFilters(new URL(request.url).searchParams)));
    response.headers.set("X-CDV-Data-Access", "private");
    return response;
  } catch { return json({ error: "invalid_filters" }, 400); }
}
