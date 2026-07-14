export const runtime = "nodejs";

const disabled = () => Response.json({
  ok: false,
  error: "This legacy proxy is disabled. Server integrations must use configured URLs only."
}, { status: 410 });

// Do not proxy user-supplied URLs. The former implementation was an SSRF/open-proxy risk.
export async function GET() { return disabled(); }
export async function POST() { return disabled(); }
