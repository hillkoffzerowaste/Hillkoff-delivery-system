import crypto from "node:crypto";
import { getSupabaseAdmin } from "../../../../lib/supabaseServer";

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function clientMeta(request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent") || null;
  return { ip, userAgent };
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const { ip, userAgent } = clientMeta(request);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const role = String(payload?.role || "").trim();
  const phone = String(payload?.phone || "").trim();
  const name = String(payload?.name || "").trim();
  const pin = String(payload?.pin || "").trim();

  if (!["driver", "sales"].includes(role)) {
    return Response.json({ ok: false, error: "Invalid role" }, { status: 400 });
  }
  if (!phone) {
    return Response.json({ ok: false, error: "Missing phone" }, { status: 400 });
  }

  try {
    let userId = null;
    let displayName = name || "";
    let driverId = null;

    if (role === "driver") {
      const { data: driver, error } = await supabase
        .from("drivers")
        .select("id,name,phone,firstName,lastName")
        .eq("phone", phone)
        .maybeSingle();
      if (error) throw error;
      if (!driver) throw new Error("ไม่พบข้อมูลคนขับ");

      driverId = driver.id;
      userId = driver.id;
      displayName =
        driver.name ||
        [driver.firstName, driver.lastName].filter(Boolean).join(" ").trim() ||
        phone;
    } else {
      const { data: salesUser, error: salesErr } = await supabase
        .from("sales_users")
        .select("id,name,phone,active,pin_hash")
        .eq("phone", phone)
        .maybeSingle();

      if (salesErr) throw salesErr;

      if (salesUser) {
        if (!salesUser.active) throw new Error("บัญชีถูกระงับการใช้งาน");
        if (!pin) throw new Error("กรุณากรอก PIN");
        if (sha256Hex(pin) !== String(salesUser.pin_hash || "")) throw new Error("PIN ไม่ถูกต้อง");
        userId = salesUser.id;
        displayName = salesUser.name;
      } else {
        if (!displayName) throw new Error("กรุณากรอกชื่อฝ่ายขาย");
        userId = phone;
      }
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + (role === "driver" ? 30 : 7) * 24 * 60 * 60 * 1000);

    const { error: sessErr } = await supabase.from("auth_sessions").insert({
      role,
      user_id: userId,
      token,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString()
    });
    if (sessErr) throw sessErr;

    await supabase.from("login_events").insert({
      role,
      user_id: userId,
      phone,
      success: true,
      error: null,
      ip,
      user_agent: userAgent,
      createdAt: new Date().toISOString()
    });

    return Response.json({
      ok: true,
      data: { token, role, userId, name: displayName, driverId, expiresAt: expiresAt.toISOString() }
    });
  } catch (err) {
    const message = err?.message || "Login failed";
    try {
      await supabase.from("login_events").insert({
        role,
        user_id: null,
        phone,
        success: false,
        error: message,
        ip,
        user_agent: userAgent,
        createdAt: new Date().toISOString()
      });
    } catch {}

    return Response.json({ ok: false, error: message }, { status: 401 });
  }
}

