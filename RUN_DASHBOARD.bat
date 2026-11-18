@echo off
title Terrashield AI - Soil Erosion Predictor Platform
color 0A
cd /d "%~dp0"

echo ======================================================================
echo    TERRASHIELD AI - SOIL EROSION PREDICTOR PLATFORM
echo ======================================================================
echo.

set "PY=python"

python --version >nul 2>&1
if %ERRORLEVEL% equ 0 goto RUN

py -3 --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY=py -3"
    goto RUN
)

if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set "PY=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    goto RUN
)

if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
    set "PY=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    goto RUN
)

if exist "C:\Users\SURA\AppData\Local\Programs\Python\Python313\python.exe" (
    set "PY=C:\Users\SURA\AppData\Local\Programs\Python\Python313\python.exe"
    goto RUN
)

if exist "C:\Program Files\Python313\python.exe" (
    set "PY=C:\Program Files\Python313\python.exe"
    goto RUN
)

echo [!] Python not detected. Opening in Offline Browser Mode...
start "" "%~dp0index.html"
pause
exit /b 0

:RUN
echo [*] Python runtime: %PY%
echo [*] Starting Terrashield PyTorch AI Engine at http://localhost:8000 ...
echo [*] Microsoft Edge will open automatically in 2 seconds...
echo.
echo ======================================================================
echo [*] Server is ACTIVE. Keep this window open while using the dashboard.
echo [*] Press Ctrl+C in this window to stop the server at any time.
echo ======================================================================
echo.

%PY% server.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Server stopped. Opening in Browser Mode...
    start "" "%~dp0index.html"
    pause
)
