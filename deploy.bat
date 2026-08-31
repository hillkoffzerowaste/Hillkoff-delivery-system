@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 (
  echo Could not open the repository directory.
  exit /b 1
)

echo === Checking Git Status ===
git status --short

echo.
echo === Staging Changes ===
git add -A

echo.
echo === Committing ===
set /p "COMMIT_MESSAGE=Commit message: "
if "%COMMIT_MESSAGE%"=="" (
  echo Commit cancelled: a message is required.
  exit /b 1
)
git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 exit /b 1

echo.
echo === Pushing ===
git push origin HEAD:main

echo.
echo === Verifying ===
git status --short
git log --oneline -1

pause
endlocal
