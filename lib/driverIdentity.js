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

  // Login writes users/{uid} and users_by_phone/{phone} atomically. Resolve
  // through those deterministic document paths first so a newly-created
  // anonymous Firebase session does not depend on a collection query.
  const uidDoc = await db.collection("users").doc(uid).get();
  const uidProfile = uidDoc.exists ? uidDoc.data() || {} : {};
  const phoneDigits = String(uidProfile.phoneDigits || "").replace(/\D/g, "");
  if (uidProfile.role === "driver" && phoneDigits) {
    const canonicalDoc = await db.collection("users_by_phone").doc(phoneDigits).get();
    const canonicalUser = canonicalDoc.exists ? canonicalDoc.data() || {} : null;
    const knownUids = Array.isArray(canonicalUser?.legacyUids) ? canonicalUser.legacyUids.map(cleanUid) : [];
    const isKnownUid = cleanUid(canonicalUser?.uidLast || canonicalUser?.uid) === uid || knownUids.includes(uid);
    if (canonicalUser?.role === "driver" && canonicalUser.active !== false && isKnownUid) {
      return { doc: canonicalDoc, user: canonicalUser };
    }
  }

  const snap = await db.collection("users_by_phone").where("uidLast", "==", uid).limit(1).get();
  const doc = snap.docs[0] || null;
  const user = doc?.data() || null;
  if (!doc || user?.role !== "driver") return null;
  return { doc, user };
}
