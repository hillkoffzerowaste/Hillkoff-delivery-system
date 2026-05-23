export async function POST(request) {
  try {
    const body = await request.json();
    const webAppUrl = body.webAppUrl;
    
    if (!webAppUrl) {
      return Response.json({ ok: false, error: "No webAppUrl provided" }, { status: 400 });
    }

    // ส่งจากเซิร์ฟเวอร์ (ไม่มี CORS issue)
    const params = new URLSearchParams();
    params.append("action", body.action || "sync");
    params.append("customers", JSON.stringify(body.customers || []));
    params.append("orders", JSON.stringify(body.orders || []));
    params.append("drivers", JSON.stringify(body.drivers || []));

    const response = await fetch(webAppUrl, {
      method: "POST",
      body: params
    });

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const webAppUrl = searchParams.get("webAppUrl");

    if (!webAppUrl) {
      return Response.json({ ok: false, error: "No webAppUrl provided" }, { status: 400 });
    }

    const response = await fetch(webAppUrl);
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
