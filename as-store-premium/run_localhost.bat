@echo off
title Pinky Sales - Localhost Launcher
echo ========================================================
echo Starting Pinky Sales Backend and Frontend on Localhost
echo ========================================================

cd /d "%~dp0"

echo.
echo [1/2] Starting Backend Server on http://localhost:5000 ...
start "Pinky Sales Backend" cmd /k "cd backend && npm start"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend Vite Server on http://localhost:3000 ...
start "Pinky Sales Frontend" cmd /k "cd frontend && npm run dev"

setlocal enabledelayedexpansion
echo.
echo ========================================================
echo SERVER STATUS:
echo - Computer Browser: http://localhost:3000
echo - Backend API:      http://localhost:5000
echo.
echo TO TEST ON YOUR PHONE (Same Wi-Fi Network):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"IPv4"') do (
    set "IP=%%a"
    set "IP=!IP: =!"
    if defined IP (
        echo   --^> http://!IP!:3000
    )
)
echo ========================================================
echo.
echo Press any key to exit this launcher window...
pause >nul
