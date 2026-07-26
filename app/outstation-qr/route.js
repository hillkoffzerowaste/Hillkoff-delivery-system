import { parseOutstationQrPayload } from "../../lib/outstationDispatch";
import { HILLKOFF_LINE_URL } from "../../lib/outstationQr";

export const runtime = "nodejs";

export function GET(request) {
  const token = new URL(request.url).searchParams.get("t");
  try {
    parseOutstationQrPayload(token);
    return Response.redirect(HILLKOFF_LINE_URL, 302);
  } catch {
    return new Response("Invalid outstation QR", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}
