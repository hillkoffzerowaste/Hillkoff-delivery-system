const MAX_LEGACY_UIDS = 12;

function cleanUid(uid) {
  return String(uid || "").trim();
}

export function driverIdentityPatch(existing = {}, uid) {
  const currentUid = cleanUid(uid);
  const known = [
    ...(Array.isArray(existing?.legacyUids) ? existing.legacyUids : []),
    existing?.uidLast,
    existing?.uid,
    currentUid
  ].map(cleanUid).filter(Boolean);
  const legacyUids = [...new Set(known)].slice(-MAX_LEGACY_UIDS);
  return {
    uid: currentUid,
    uidLast: currentUid,
    legacyUids,
    identityVersion: 2,
    migrationStatus: "identity_migrated",
    identityMigratedAt: new Date().toISOString()
  };
}

export async function resolveVerifiedDriver(db, decoded) {
  const uid = cleanUid(decoded?.uid);
  if (!uid) return null;
  const snap = await db.collection("users_by_phone").where("uidLast", "==", uid).limit(1).get();
  const doc = snap.docs[0] || null;
  const user = doc?.data() || null;
  if (!doc || user?.role !== "driver") return null;
  return { doc, user };
}
