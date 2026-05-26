import { getSupabaseAdmin } from "../../../../lib/supabaseServer";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = String(searchParams.get("token") || "").trim();
  const role = String(searchParams.get("role") || "").trim();
  if (!token) return Response.json({ ok: true, valid: false }, { status: 200 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("auth_sessions")
    .select("role,token,expiresAt,user_id")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return Response.json({ ok: true, valid: false }, { status: 200 });
  if (role && data.role !== role) return Response.json({ ok: true, valid: false }, { status: 200 });
  const valid = new Date(data.expiresAt).getTime() > Date.now();
  return Response.json({
    ok: true,
    valid,
    data: valid ? { role: data.role, userId: data.user_id, expiresAt: data.expiresAt } : null
  });
}

