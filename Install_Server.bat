@echo off
color 0A
title Installer Bot AP2T PLN (Background Service)
echo =======================================================
echo          INSTALLER SERVER BOT AP2T PLN
echo =======================================================
echo.
echo Mengatur bot ini menjadi sistem latar belakang (Server)...

:: Ambil lokasi folder tempat file bat ini berada
set BOT_DIR=%~dp0
set BOT_DIR=%BOT_DIR:~0,-1%

:: Pastikan Node.js terinstall
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js belum terinstall di PC ini!
    echo Silakan download dan install Node.js dari https://nodejs.org
    pause
    exit /b
)

:: Install modul jika node_modules belum ada
if not exist "%BOT_DIR%\node_modules" (
    echo [INFO] Menginstall dependencies (membutuhkan internet)...
    cd /d "%BOT_DIR%"
    npm install
)

:: Panggil node untuk memicu Setup GUI jika .env belum lengkap
echo.
echo [INFO] Menjalankan Setup Awal...
echo Jika muncul kotak biru, silakan isi data yang diperlukan.
cd /d "%BOT_DIR%"
node index.js --setup-only

:: Tentukan path Startup Windows
set VBS_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Watchdog_Bot_AP2T.vbs

:: Buat file VBS Penjaga (Watchdog) secara dinamis
echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_PATH%"
echo Set wmi = GetObject("winmgmts://./root/cimv2") >> "%VBS_PATH%"
echo Do >> "%VBS_PATH%"
echo     Set processes = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'node.exe' AND CommandLine LIKE '%%index.js%%'") >> "%VBS_PATH%"
echo     If processes.Count = 0 Then >> "%VBS_PATH%"
echo         WshShell.CurrentDirectory = "%BOT_DIR%" >> "%VBS_PATH%"
echo         WshShell.Run "cmd /c node index.js", 0, False >> "%VBS_PATH%"
echo     End If >> "%VBS_PATH%"
echo     WScript.Sleep 10000 >> "%VBS_PATH%"
echo Loop >> "%VBS_PATH%"

echo.
echo [OK] Script Satpam Penjaga berhasil ditanam di Startup PC ini.
echo [OK] Menghidupkan bot di latar belakang sekarang...

:: Pancing eksekusi VBS pertama kali
explorer.exe "%VBS_PATH%"

echo.
echo =======================================================
echo INSTALASI SELESAI!
echo PC ini sekarang sudah resmi menjadi Server Bot.
echo Bot berjalan 100%% TANPA LAYAR HITAM di latar belakang.
echo Bot akan selalu hidup otomatis setiap kali PC menyala.
echo Anda bebas menutup jendela ini sekarang.
echo =======================================================
pause
