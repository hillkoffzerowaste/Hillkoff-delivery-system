import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pageSource = (await readFile(new URL("../../app/page.jsx", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const listenerStart = pageSource.indexOf("unsubAuth = onFirebaseAuthStateChanged");
const listenerEnd = pageSource.indexOf("unsubToken = onFirebaseIdTokenChanged", listenerStart);
const listenerSource = pageSource.slice(listenerStart, listenerEnd);

describe("Firebase auth session listener", () => {
  it("clears the stale local session when Firebase reports no user", () => {
    expect(listenerSource).toContain("onFirebaseAuthStateChanged((user) =>");
    expect(listenerSource).toContain("if (!user)");
    expect(listenerSource).toContain('localStorage.removeItem("hillkoff_auth")');
    expect(listenerSource).toContain('role: ""');
  });
});
