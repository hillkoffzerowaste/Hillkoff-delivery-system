import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    files: ["app/**/*.{js,jsx}"],
    rules: {
      "@next/next/no-img-element": "off"
    }
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "repo/**",
    "repo.worktrees/**",
    "google-apps-script/**"
  ])
]);
