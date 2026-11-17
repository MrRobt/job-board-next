import { db } from "../../../lib/db";
import { checkReadiness, readinessAuthorized } from "../../../lib/readiness";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

export async function GET(request: Request): Promise<Response> {
  // Fail closed. Without a separate, long, server-side probe token this URL
  // reveals nothing and must not query the database at all.
  if (!readinessAuthorized(
    process.env.READINESS_PROBE_TOKEN,
    request.headers.get("x-readiness-token")
  )) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const status = await checkReadiness(() => db.$queryRaw`SELECT 1`);
  return new Response(JSON.stringify({ status }), {
    status: status === "ok" ? 200 : 503,
    headers: privateHeaders,
  });
}
