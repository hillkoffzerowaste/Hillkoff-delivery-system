const GOOGLE_WEB_APP_URL =
  process.env.GOOGLE_WEB_APP_URL ||
  "https://script.google.com/macros/s/AKfycbwnfMUgWfrSdZt6qM5LllZx-hGSkc1e0BSYdEz6hT0e4K6vM6He1TbeHyUCBpCAI_y_/exec";

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
