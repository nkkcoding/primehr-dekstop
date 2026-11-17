@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo === PrimeHR Documents — build Windows NSIS installer ===
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [EROARE] Node.js nu este in PATH. Instalati Node LTS de pe https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [EROARE] npm nu este in PATH.
  pause
  exit /b 1
)

echo [1/4] npm config: allow lifecycle scripts
call npm config set ignore-scripts false

echo [2/4] npm install
call npm install
if errorlevel 1 (
  echo [EROARE] npm install a esuat.
  pause
  exit /b 1
)

echo [3/4] ensure Electron binary
call node scripts\ensure-electron.cjs --strict
if errorlevel 1 (
  echo [EROARE] Electron binary lipseste. Incercati: npm rebuild electron
  pause
  exit /b 1
)

echo [4/4] npm run build:win  (electron-builder NSIS)
call npm run build:win
if errorlevel 1 (
  echo [EROARE] build:win a esuat.
  pause
  exit /b 1
)

echo.
echo === Gata ===
echo Instalator: %cd%\release\PrimeHR-Documents-Setup-0.1.0.exe
echo Distribuiti acest .exe pe PC-urile din birou (fara npm/terminal).
echo.
pause
endlocal
