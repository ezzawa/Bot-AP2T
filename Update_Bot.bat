@echo off
color 0B
title Update Bot AP2T PLN
echo =======================================================
echo          PEMBARUAN BOT AP2T DARI GITHUB
echo =======================================================
echo.
echo Sedang mengunduh pembaruan terbaru...

:: Ambil lokasi folder tempat file bat ini berada
set BOT_DIR=%~dp0
set BOT_DIR=%BOT_DIR:~0,-1%
cd /d "%BOT_DIR%"

:: Jalankan git pull jika folder ini adalah repository git
if exist ".git" (
    git pull origin main
    if %errorlevel% neq 0 (
        echo [ERROR] Gagal mengunduh pembaruan via Git. Pastikan Git terinstall.
    ) else (
        echo [OK] Pembaruan kode berhasil.
    )
) else (
    echo [ERROR] Folder ini bukan repositori Git. Pembaruan otomatis tidak bisa dilakukan.
)

echo.
echo [INFO] Memperbarui dependencies jika ada...
npm install

echo.
echo =======================================================
echo PEMBARUAN SELESAI!
echo Jika bot sedang berjalan, ia akan terus berjalan dengan versi lama 
echo sampai PC di-restart, atau Anda bisa mematikannya dari Task Manager (node.exe) 
echo agar ia menyala ulang dengan sendirinya.
echo =======================================================
pause
