@echo off
cd "C:\Users\Office14\Documents\files hillkoff driver\repo"

echo === Checking Git Status ===
git status --short

echo.
echo === Staging Changes ===
git add -A

echo.
echo === Committing ===
git commit -m "Fix: Convert camelCase to snake_case for Supabase sync and remove auth_state references"

echo.
echo === Pushing ===
git push origin main

echo.
echo === Verifying ===
git status --short
git log --oneline -1

pause
