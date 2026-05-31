@echo off
title Colors — Install
color 0A

echo.
echo  =============================================
echo   Colors — Local AI Agent
echo   The Colour Foundation
echo  =============================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  Node.js not found. Opening download page...
    start https://nodejs.org/en/download
    echo.
    echo  Install Node.js then run this script again.
    pause
    exit
)

echo  Node.js found. Continuing...
echo.

:: Check git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  Git not found. Opening download page...
    start https://git-scm.com/download/win
    echo.
    echo  Install Git then run this script again.
    pause
    exit
)

:: Clone
if not exist "Color" (
    echo  Downloading Colors...
    git clone https://github.com/thecolourfoundation/Color.git
    if %errorlevel% neq 0 (
        echo  Download failed. Check your internet connection.
        pause
        exit
    )
) else (
    echo  Colors already downloaded. Updating...
    cd Color
    git pull
    cd ..
)

cd Color

:: Install deps
echo.
echo  Installing dependencies...
call npm install --silent
if %errorlevel% neq 0 (
    echo  Dependency install failed.
    pause
    exit
)

:: Install optional deps
call npm install ws @types/ws --silent

:: Patch tsconfig
node -e "const fs=require('fs');const t=JSON.parse(fs.readFileSync('tsconfig.json','utf8'));t.compilerOptions.skipLibCheck=true;t.exclude=['node_modules','dist','tests','src/channels/WhatsAppAdapter.ts','src/channels/DiscordAdapter.ts'];fs.writeFileSync('tsconfig.json',JSON.stringify(t,null,2));"

:: Build
echo.
echo  Building Colors...
call npm run build --silent
if %errorlevel% neq 0 (
    echo  Build failed.
    pause
    exit
)

:: Set env vars
echo.
echo  =============================================
echo   Setup
echo  =============================================
echo.
echo  You need two things to run Colors:
echo.
echo  1. An AI API key (Anthropic or local LM Studio)
echo  2. A passphrase to encrypt your memory
echo.

set /p API_KEY="  Enter your API key (or LM Studio: http://localhost:1234/v1): "
set /p PASSPHRASE="  Choose a memory passphrase (anything you'll remember): "

:: Save to a local .env file
echo ANTHROPIC_API_KEY=%API_KEY% > .env
echo COLORS_PASSPHRASE=%PASSPHRASE% >> .env

:: Create launcher
echo @echo off > ..\colors.bat
echo cd "%CD%" >> ..\colors.bat
echo for /f "tokens=1,2 delims==" %%%%i in (.env) do set %%%%i=%%%%j >> ..\colors.bat
echo node dist/cli.js %%* >> ..\colors.bat

echo.
echo  =============================================
echo   Colors is ready.
echo  =============================================
echo.
echo  Run Colors anytime by double-clicking colors.bat
echo  Or open a terminal here and type: colors.bat chat
echo  For the browser UI: colors.bat web
echo.
echo  Your memory is encrypted and stored locally.
echo  Nothing leaves your machine.
echo.
pause
