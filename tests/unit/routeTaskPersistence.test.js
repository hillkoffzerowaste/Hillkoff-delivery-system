import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pageSource = await readFile(new URL("../../app/page.jsx", import.meta.url), "utf8");

describe("route task persistence guards", () => {
  it("marks a stop as shared only after navigator.share succeeds", () => {
    const shareStart = pageSource.indexOf("const shareRouteTaskStopToLine");
    const shareEnd = pageSource.indexOf("const completeRouteTask", shareStart);
    const shareBlock = pageSource.slice(shareStart, shareEnd);
    const shareCall = shareBlock.indexOf("await navigator.share");
    const persistedFlag = shareBlock.indexOf("sharedToLine: true", shareCall);

    expect(shareStart).toBeGreaterThanOrEqual(0);
    expect(shareCall).toBeGreaterThanOrEqual(0);
    expect(shareBlock.slice(0, shareCall)).not.toContain("updateRouteTask");
    expect(persistedFlag).toBeGreaterThan(shareCall);
  });

  it("removes a route task from the retry queue only after a successful write", () => {
    const effectStart = pageSource.indexOf("const entries = [...routeTasksToSyncRef.current]");
    const effectEnd = pageSource.indexOf("const getCurrentLocationOnce", effectStart);
    const effect = pageSource.slice(effectStart, effectEnd);

    expect(effect).toContain("if (saved.ok)");
    expect(effect).toMatch(/if \(saved\.ok\)[\s\S]*routeTasksToSyncRef\.current\.delete/);
    expect(effect).not.toMatch(/ids\.forEach\(\(id\) => routeTasksToSyncRef\.current\.delete/);
  });
});
