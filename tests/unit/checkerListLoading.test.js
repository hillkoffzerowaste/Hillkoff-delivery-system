import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pageSource = (await readFile(new URL("../../app/page.jsx", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const loaderStart = pageSource.indexOf("const loadCheckerLists = useCallback");
const loaderEnd = pageSource.indexOf("useEffect(() => { loadCheckerLists();", loaderStart);
const loaderSource = pageSource.slice(loaderStart, loaderEnd);

describe("preparation checker list loading", () => {
  it("waits for Firebase Auth before loading Firestore-backed names and retries when auth becomes ready", () => {
    expect(loaderSource).toContain("if (!fbAuthReady || ![\"store\", \"pack\", \"admin\"].includes(auth.role)) return;");
    expect(loaderSource).toContain("[auth.role, fbAuthReady, refreshAuthToken]");
  });
});
