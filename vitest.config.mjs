import { defineConfig } from "vitest/config";

// worktree แต่ละอันมี tests/ ของตัวเอง ชื่อไฟล์ซ้ำกับของ repo หลัก เวลาส่ง path เป็น argument
// vitest จะถือว่าเป็น pattern แล้วจับไฟล์ในนั้นมารันด้วย ทำให้ test:rules รันไฟล์ของสาขาอื่น
// ทับกฎที่แก้อยู่ (เป็นปัญหาเดียวกับที่ eslint เคยกวาด .worktrees/.next)
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", ".worktrees/**"]
  }
});
