const GOOGLE_WEB_APP_URL =
  process.env.GOOGLE_WEB_APP_URL ||
  "https://script.google.com/macros/s/AKfycbw8Ebn5lMRntqw12CbMn0C_zhpduK1dr-PU3rpQ0zMna2US1g83sH5M3SLtDc-qeAn7/exec";

async function proxyToGoogle(options = {}) {
  const response = await fetch(GOOGLE_WEB_APP_URL, {
    redirect: "follow",
    ...options
  });
  const text = await response.text();

  return new Response(text, {
    status: response.ok ? 200 : response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/json; charset=utf-8"
    }
  });
}

export async function GET() {
  return proxyToGoogle();
}

export async function POST(request) {
  const body = await request.text();
  return proxyToGoogle({
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body
  });
}
