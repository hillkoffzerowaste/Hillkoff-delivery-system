async function proxyToGoogle(webAppUrl, options = {}) {
  if (!webAppUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing webAppUrl' }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const response = await fetch(webAppUrl, {
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
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const webAppUrl = searchParams.get('url');
  return proxyToGoogle(webAppUrl);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { webAppUrl, ...payload } = body;
    
    return proxyToGoogle(webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
}
