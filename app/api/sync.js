export const runtime = "nodejs";

const disabled = () => Response.json({
  ok: false,
  error: "This legacy sync proxy is disabled. Use the authenticated order sync endpoint."
}, { status: 410 });

// Do not relay data to a URL supplied by the caller.
export async function GET() { return disabled(); }
export async function POST() { return disabled(); }
