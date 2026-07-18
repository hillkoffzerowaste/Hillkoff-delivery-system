export const runtime = "nodejs";

function disabled() {
  return Response.json({
    ok: false,
    error: "This legacy sync proxy is disabled. Use the authenticated order sync endpoint."
  }, { status: 410 });
}

export async function GET() {
  return disabled();
}

export async function POST() {
  return disabled();
}
