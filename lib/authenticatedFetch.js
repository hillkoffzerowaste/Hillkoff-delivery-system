function requestHeaders(init, token) {
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

async function isAuthorizationFailure(response) {
  if (response.status === 401) return true;
  if (response.status !== 409) return false;
  const payload = await response.clone().json().catch(() => null);
  return /authorization token|expired authorization/i.test(String(payload?.error || ""));
}

export async function authenticatedFetch(input, init = {}, { getToken, fetchImpl = fetch } = {}) {
  if (typeof getToken !== "function") throw new Error("Authentication token provider is required");

  const send = async () => {
    const token = String(await getToken(true) || "").trim();
    if (!token) throw new Error("กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่");
    return fetchImpl(input, { ...init, headers: requestHeaders(init, token), cache: "no-store" });
  };

  const response = await send();
  if (!(await isAuthorizationFailure(response))) return response;
  return send();
}
