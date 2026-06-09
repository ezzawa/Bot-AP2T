require('dotenv').config();

// ==========================================
// 1. CEK SETUP & LOGIKA UTAMA
// ==========================================

const envPath = require('path').join(process.cwd(), '.env');
const isSetupComplete = require('fs').existsSync(envPath);

// (Fitur auto-start sekarang dikendalikan murni oleh Install_Server.bat)



// (Fitur sembunyikan .env dihapus agar file tetap terlihat oleh user)

const TelegramBot = require('node-telegram-bot-api');

const puppeteer = require('puppeteer');
const { exec, execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // <-- Untuk request ke Google Sheets

// Tangkap semua error unhandled agar bot tidak mati
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

// ===== KONFIGURASI =====
const AP2T_TOKEN_EXE = 'C:\\Program Files (x86)\\PT PLN (PERSERO)\\AP2T ENKRIPSI\\Token.exe';

const READ_ENKRIPSI_PS1 = require('path').join(process.cwd(), 'read_enkripsi.ps1');
if (!require('fs').existsSync(READ_ENKRIPSI_PS1)) {
    const ps1Code = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WindowHelper {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int SendMessage(IntPtr hWnd, uint Msg, int wParam, System.Text.StringBuilder lParam);
    public const uint WM_GETTEXT = 0x000D;
}
"@

\$hwnd = [WindowHelper]::FindWindow($null, "AP2T ENKRIPSI")
if (\$hwnd -eq [IntPtr]::Zero) {
    \$appPath = "C:\Program Files (x86)\PT PLN (PERSERO)\AP2T ENKRIPSI\Token.exe"
    if (Test-Path \$appPath) {
        Start-Process -FilePath \$appPath
        Start-Sleep -Seconds 2
        \$hwnd = [WindowHelper]::FindWindow($null, "AP2T ENKRIPSI")
    }
}

if (\$hwnd -ne [IntPtr]::Zero) {
    \$child = [WindowHelper]::FindWindowEx(\$hwnd, [IntPtr]::Zero, "WindowsForms10.EDIT.app.0.141b42a_r7_ad1", $null)
    if (\$child -ne [IntPtr]::Zero) {
        \$sb = New-Object System.Text.StringBuilder(256)
        [WindowHelper]::SendMessage(\$child, [WindowHelper]::WM_GETTEXT, 256, \$sb) | Out-Null
        Write-Output ("RESULT:" + \$sb.ToString())
    } else {
        Write-Output "RESULT:FAILED_CHILD"
    }
} else {
    Write-Output "RESULT:FAILED_WINDOW"
}
`;
    require('fs').writeFileSync(READ_ENKRIPSI_PS1, ps1Code);
}

const CHROME_EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
function getProfileDir(acc) { return require('path').join(process.cwd(), 'bot-chrome-profile-' + (acc || 'main')); }
let activeBrowserProfile = 'main';

// ===== SETUP & VALIDASI LISENSI (HWID) =====
const crypto = require('crypto');
function getHWID() {
    try {
        const uuid = execSync('wmic csproduct get uuid').toString().replace('UUID', '').trim();
        return crypto.createHash('md5').update(uuid).digest('hex').substring(0, 8).toUpperCase();
    } catch(e) { return 'UNKNOWN'; }
}

let hwid = getHWID();

// Tampilkan Setup GUI jika konfigurasi belum lengkap
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.OWNER_CHAT_ID || !process.env.LICENSE_KEY) {
    console.log("Konfigurasi awal belum lengkap. Membuka Setup GUI...");
    const envPath = require('path').join(process.cwd(), '.env');
    const ps1Path = require('path').join(process.cwd(), 'setup_gui.ps1');
    const ps1Code = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Setup Awal Bot AP2T - Client"
$form.Size = New-Object System.Drawing.Size(420,600)
$form.StartPosition = "CenterScreen"
$form.TopMost = $true

$labelHwid = New-Object System.Windows.Forms.Label
$labelHwid.Location = New-Object System.Drawing.Point(10,20)
$labelHwid.Size = New-Object System.Drawing.Size(380,20)
$labelHwid.Text = "Hardware ID PC Ini: ${hwid} (Copy & Kirim ke Admin)"
$labelHwid.Font = New-Object System.Drawing.Font("Arial", 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($labelHwid)

function Add-Input {
    param($lblText, $y, $val, $isPass)
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Location = New-Object System.Drawing.Point(10,$y)
    $lbl.Size = New-Object System.Drawing.Size(380,20)
    $lbl.Text = $lblText
    $form.Controls.Add($lbl)
    
    $txt = New-Object System.Windows.Forms.TextBox
    $txt.Location = New-Object System.Drawing.Point(10,($y+20))
    $txt.Size = New-Object System.Drawing.Size(380,20)
    $txt.Text = $val
    if ($isPass) { $txt.PasswordChar = '*' }
    $form.Controls.Add($txt)
    return $txt
}

$txtToken = Add-Input "Telegram Bot Token:" 60 "${process.env.TELEGRAM_BOT_TOKEN || ''}" $false
$txtChat  = Add-Input "Owner Chat ID (Gunakan koma jika > 1 user, contoh: 123,456):" 110 "${process.env.OWNER_CHAT_ID || ''}" $false
$txtSheet = Add-Input "URL Spreadsheet WebApp (Kosongkan utk default):" 160 "${process.env.SPREADSHEET_URL || ''}" $false
$txtLic   = Add-Input "License Key:" 210 "${process.env.LICENSE_KEY || ''}" $false
$txtUser  = Add-Input "Username AP2T:" 260 "${process.env.MAIN_USERNAME || ''}" $false
$txtPass  = Add-Input "Password AP2T:" 310 "${process.env.MAIN_PASSWORD || ''}" $true
$txtWUser = Add-Input "Username Webmail:" 360 "${process.env.WEBMAIL_USERNAME || ''}" $false
$txtWPass = Add-Input "Password Webmail:" 410 "${process.env.WEBMAIL_PASSWORD || ''}" $true

$btnSave = New-Object System.Windows.Forms.Button
$btnSave.Location = New-Object System.Drawing.Point(10,470)
$btnSave.Size = New-Object System.Drawing.Size(380,40)
$btnSave.Text = "Simpan & Lanjutkan"
$btnSave.Add_Click({
    $envContent = "TELEGRAM_BOT_TOKEN=" + $txtToken.Text + [Environment]::NewLine +
                  "OWNER_CHAT_ID=" + $txtChat.Text + [Environment]::NewLine +
                  "SPREADSHEET_URL=" + $txtSheet.Text + [Environment]::NewLine +
                  "LICENSE_KEY=" + $txtLic.Text + [Environment]::NewLine +
                  "MAIN_USERNAME=" + $txtUser.Text + [Environment]::NewLine +
                  "MAIN_PASSWORD=" + $txtPass.Text + [Environment]::NewLine +
                  "WEBMAIL_USERNAME=" + $txtWUser.Text + [Environment]::NewLine +
                  "WEBMAIL_PASSWORD=" + $txtWPass.Text + [Environment]::NewLine
    [System.IO.File]::WriteAllText('${envPath.replace(/\\/g, '\\\\')}', $envContent)
    $form.Close()
})
$form.Controls.Add($btnSave)

$form.ShowDialog() | Out-Null
`;
    require('fs').writeFileSync(ps1Path, ps1Code);
    try { execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1Path}"`, { stdio: 'inherit' }); } catch(e) {}
    if (require('fs').existsSync(ps1Path)) require('fs').unlinkSync(ps1Path);
    
    // Reload environment variables after GUI closes
    const envConfig = require('dotenv').parse(fs.readFileSync(envPath));
    for (const k in envConfig) { process.env[k] = envConfig[k]; }
}

if (process.argv.includes('--setup-only')) {
    console.log("Setup GUI selesai. Melanjutkan instalasi...");
    process.exit(0);
}

const EXPECTED_LICENSE = crypto.createHash('md5').update(hwid + "PLN_AMAN_123").digest('hex').substring(0, 16).toUpperCase();
const currentLicense = (process.env.LICENSE_KEY || '').trim().toUpperCase();
const isLicensed = (currentLicense === EXPECTED_LICENSE);

// ===== TELEGRAM BOT =====
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error("TELEGRAM_BOT_TOKEN kosong, bot tidak bisa berjalan."); process.exit(1); }
const bot = new TelegramBot(token, { polling: true });

// Notifikasi Popup Jika Token Salah
bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('404')) {
        try {
            require('child_process').execSync(`powershell -command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('ERROR FATAL: Token Bot Telegram Anda (di file .env) SALAH atau TIDAK VALID! (Error 404). Silakan perbaiki isi file .env lalu buka ulang aplikasinya untuk mengisi Token yang benar.', 'Error Bot AP2T', 'OK', 'Error')"`);
        } catch(e) {}
        process.exit(1);
    }
});
// ===== MANAJEMEN AKSES MULTI-USER =====
const ACCESS_LIST_FILE = require('path').join(process.cwd(), 'access_list.json');
let authorizedUsers = {};

function loadAccessList() {
    if (require('fs').existsSync(ACCESS_LIST_FILE)) {
        try { authorizedUsers = JSON.parse(fs.readFileSync(ACCESS_LIST_FILE, 'utf8')); } catch(e) {}
    }
}
function saveAccessList() {
    require('fs').writeFileSync(ACCESS_LIST_FILE, JSON.stringify(authorizedUsers, null, 2));
}
loadAccessList();

// Super Admin (Pemilik Pertama dari .env)
let SUPER_ADMIN_ID = (process.env.OWNER_CHAT_ID || '').split(',')[0].trim();

bot.onText(/^\/set_admin$/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (SUPER_ADMIN_ID) {
        return bot.sendMessage(chatId, `❌ Gagal! Super Admin sudah diatur (ID: ${SUPER_ADMIN_ID}). Jika ingin mengubahnya, silakan edit file .env secara manual menggunakan Notepad.`);
    }
    
    SUPER_ADMIN_ID = chatId;
    const envPath = require('path').join(process.cwd(), '.env');
    try {
        require('fs').appendFileSync(envPath, `\nOWNER_CHAT_ID=${chatId}`);
        bot.sendMessage(chatId, `✅ **SUKSES!**\n\nAnda (\`${chatId}\`) telah resmi menjadi **Super Admin** bot ini!\nSekarang Anda bisa menggunakan perintah /tambah_akses untuk mendaftarkan ID pegawai lain.`, { parse_mode: 'Markdown' });
    } catch(e) {
        bot.sendMessage(chatId, `❌ Gagal menyimpan ke file .env: ${e.message}`);
    }
});

// Middleware keamanan: Intercept semua perintah Telegram
const originalOnText = bot.onText.bind(bot);
bot.onText = function(regex, callback) {
    originalOnText(regex, (msg, match) => {
        const chatId = msg.chat.id.toString();
        const isSuperAdmin = (chatId === SUPER_ADMIN_ID);
        const isAuthorized = isSuperAdmin || authorizedUsers[chatId];

        if (!isAuthorized) {
            bot.sendMessage(chatId, `⛔ **Akses Ditolak!**\n\nSistem ini bersifat privat. Anda tidak terdaftar dalam database.\n\nChat ID Anda: \`${chatId}\`\n\nSilakan copy ID di atas dan berikan ke Admin untuk didaftarkan.`, { parse_mode: 'Markdown' });
            return;
        }
        if (!isLicensed) {
            bot.sendMessage(chatId, `⚠️ **Bot Terkunci! PC Belum Terlisensi**\nMachine ID PC ini: \`${hwid}\`\n\nSilakan minta License Key dari admin dan masukkan ke file .env atau buka ulang bot untuk memunculkan popup setup.`, { parse_mode: 'Markdown' });
            return;
        }
        callback(msg, match);
    });
};

// ===== COMMAND SUPER ADMIN =====
bot.onText(/^\/tambah_akses (\d+)\s+(.+)$/, (msg, match) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== SUPER_ADMIN_ID) return bot.sendMessage(chatId, `⛔ Ditolak! Anda bukan Super Admin.`);
    const newId = match[1];
    const newName = match[2].trim();
    authorizedUsers[newId] = newName;
    saveAccessList();
    bot.sendMessage(chatId, `✅ Berhasil mendaftarkan **${newName}** (ID: ${newId}).`, { parse_mode: 'Markdown' });
    bot.sendMessage(newId, `🎉 **Akses Diberikan!**\n\nSelamat Datang, ${newName}! Anda sekarang bisa menggunakan bot ini.\nKetik /start untuk menampilkan menu.`, { parse_mode: 'Markdown' }).catch(()=>{});
});

bot.onText(/^\/hapus_akses (\d+)$/, (msg, match) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== SUPER_ADMIN_ID) return bot.sendMessage(chatId, `⛔ Ditolak! Anda bukan Super Admin.`);
    const targetId = match[1];
    if (authorizedUsers[targetId]) {
        const name = authorizedUsers[targetId];
        delete authorizedUsers[targetId];
        saveAccessList();
        bot.sendMessage(chatId, `✅ Akses untuk **${name}** telah dicabut.`, { parse_mode: 'Markdown' });
        bot.sendMessage(targetId, `⛔ Akses Anda ke bot ini telah dicabut oleh Admin.`, { parse_mode: 'Markdown' }).catch(()=>{});
    } else {
        bot.sendMessage(chatId, `⚠️ ID ${targetId} tidak terdaftar.`);
    }
});

bot.onText(/^\/cek_akses$/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== SUPER_ADMIN_ID) return bot.sendMessage(chatId, `⛔ Ditolak! Anda bukan Super Admin.`);
    let txt = `📋 **Daftar Hak Akses Pegawai:**\n\n👑 **Super Admin:**\n- ID: \`${SUPER_ADMIN_ID}\`\n\n👥 **Pegawai Biasa:**\n`;
    let count = 0;
    for (const [id, name] of Object.entries(authorizedUsers)) {
        txt += `- ${name} (\`${id}\`)\n`;
        count++;
    }
    if (count === 0) txt += `*(Belum ada pegawai terdaftar)*\n`;
    bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
});

// ===== KREDENSIAL =====


// ===== AUTO-UPDATER =====
const CURRENT_VERSION = '1.0.0';
// Nanti ganti URL di bawah dengan link 'Raw' dari Github Gist Anda
const GIST_UPDATE_URL = 'https://gist.githubusercontent.com/USERNAME/ID_GIST/raw/version.json';

async function checkAndUpdate() {
    if (GIST_UPDATE_URL.includes('USERNAME/ID_GIST')) {
        console.log("Auto-updater belum dikonfigurasi (URL Gist default). Melewati cek update...");
        return;
    }
    try {
        console.log(`Mengecek update... (Versi saat ini: ${CURRENT_VERSION})`);
        const response = await axios.get(GIST_UPDATE_URL + "?t=" + Date.now());
        const data = response.data;
        
        if (data && data.version && data.version !== CURRENT_VERSION) {
            console.log(`Update baru ditemukan! Versi ${data.version}. Mengunduh update dari: ${data.download_url}`);
            
            // Cek apakah dijalankan sebagai .exe
            const exeName = path.basename(process.execPath);
            if (!exeName.toLowerCase().endsWith('.exe')) {
                console.log("Menjalankan dari script (.js), auto-update dilewati.");
                return;
            }
            
            const newExePath = require('path').join(require('path').dirname(process.execPath), 'update_new.exe');
            const writer = fs.createWriteStream(newExePath);
            const downloadResponse = await axios({
                url: data.download_url,
                method: 'GET',
                responseType: 'stream'
            });
            downloadResponse.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            console.log("Download selesai! Mempersiapkan restart untuk update...");
            const batPath = require('path').join(require('path').dirname(process.execPath), 'apply_update.bat');
            const batContent = `
@echo off
echo Menerapkan update... Mohon tunggu.
timeout /t 3 /nobreak > NUL
del /f /q "${exeName}"
ren "update_new.exe" "${exeName}"
start "" "${exeName}"
del "%~f0"
`;
            require('fs').writeFileSync(batPath, batContent);
            
            const { spawn } = require('child_process');
            spawn('cmd.exe', ['/c', batPath], {
                detached: true,
                stdio: 'ignore'
            }).unref();
            
            console.log("Bot akan ditutup untuk menerapkan update.");
            process.exit(0);
        } else {
            console.log("Bot sudah menggunakan versi terbaru.");
        }
    } catch(e) {
        console.log("Gagal mengecek update: " + e.message);
    }
}

// Jalankan cek update tanpa menghentikan proses lain
checkAndUpdate();

// ===== SELECTOR =====
// Field enkripsi: #lblEnkripsi menerima paste Ctrl+V (format AP2T|kode|...)
// Validasi otomatis setelah paste — field akan tampilkan "Valid"
const SELECTORS = {
    usernameInput: '#tfUser',
    passwordInput: '#tfPassword',
    encryptionInput: '#lblEnkripsi',  // Harus di-paste dengan Ctrl+V!
    loginButton: '#Button1',
    validCheckbox: 'input[id*="chkValidasi"]',  // Checkbox "Valid" setelah enkripsi
    errorMessage: '.alert-danger',
    dashboardElement: '#dashboard-menu'
};

// ===== STATE GLOBAL =====
let browser = null;
let page = null;
let isLoggedIn = false;
let isLoggingIn = false;
let userAccounts = {}; // map of chatId -> accountName
function getAccount(chatId) { return userAccounts[chatId] || 'main'; }
let activeChatId = null;

// Antrean eksekusi CT
let ctQueue = [];
let isProcessingCT = false;
let isPaused = false; // Flag untuk pause

// Global Lock agar tidak tabrakan
let isGlobalBusy = false;
let globalBusyChatId = null;

// Track link reset MAC yang sudah diklik untuk menghindari klik link lama
const globalClickedHapusLinks = new Set();

function checkAndSetBusy(chatId) {
    if (isGlobalBusy) {
        if (globalBusyChatId === chatId) {
            bot.sendMessage(chatId, `⏳ Bot sedang memproses perintah Anda yang sebelumnya. Mohon tunggu...`);
        } else {
            bot.sendMessage(chatId, `⏳ Maaf, bot sedang digunakan oleh user lain. Mohon antre dan tunggu sampai proses mereka selesai...`);
        }
        return true; // Berarti sedang sibuk
    }
    isGlobalBusy = true;
    globalBusyChatId = chatId;
    return false; // Berhasil dapat lock
}

function releaseBusy() {
    isGlobalBusy = false;
    globalBusyChatId = null;
}

// Helper untuk menahan eksekusi
async function checkPause(chatId) {
    if (isPaused) bot.sendMessage(chatId, `⏸️ **Bot Menunggu (Di-Pause)**\nProses ditahan sebelum menekan Save. Layar Chrome bisa dicek.\nKetik /resume untuk melanjutkan.`);
    while (isPaused) {
        await new Promise(r => setTimeout(r, 1000));
    }
}

// ===== FUNGSI: Eksekusi Antrean CT =====
async function processQueue() {
    if (isProcessingCT || ctQueue.length === 0) return;
    
    // Coba ambil global lock sebelum mulai proses
    if (isGlobalBusy) {
        setTimeout(processQueue, 3000);
        return;
    }
    
    isProcessingCT = true;
    const task = ctQueue.shift();
    const taskAccount = getAccount(task.chatId);
    
    // Set lock
    isGlobalBusy = true;
    globalBusyChatId = task.chatId;

    try {
        // Jika akun AP2T yang diminta berbeda dengan Chrome yang sedang terbuka, kita harus restart Chrome
        if (activeBrowserProfile !== taskAccount && browser) {
            bot.sendMessage(task.chatId, `🔄 **Pindah Profil Akun**\nMenutup sesi sebelumnya dan membuka Chrome khusus untuk akun \`${taskAccount}\`...`, { parse_mode: 'Markdown' });
            killChromeAndClean(activeBrowserProfile);
            browser = null;
        }
        activeBrowserProfile = taskAccount; // Set profil aktif yang baru

        await processCT(task.idpel, task.nogan, task.chatId);
    } catch (err) {
        bot.sendMessage(task.chatId, `❌ Terjadi kesalahan fatal: ${err.message}`);
    } finally {
        isProcessingCT = false;
        releaseBusy(); // Lepas lock
        // Lanjut ke antrean berikutnya jika ada
        if (ctQueue.length > 0) {
            processQueue();
        }
    }
}

// ===== FUNGSI: Bersihkan Chrome sebelum launch =====
function killChromeAndClean(accProfile) {
    const prof = accProfile || activeBrowserProfile;
    try { execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' }); } catch(e) {}
    // Hapus SingletonLock agar Chrome bisa start bersih
    const dir = getProfileDir(prof);
    const lockFile = require('path').join(dir, 'SingletonLock');
    const lockFile2 = require('path').join(dir, 'Default', 'SingletonLock');
    if (require('fs').existsSync(lockFile)) { try { require('fs').unlinkSync(lockFile); } catch(e) {} }
    if (require('fs').existsSync(lockFile2)) { try { require('fs').unlinkSync(lockFile2); } catch(e) {} }
}

// ===== FUNGSI: Baca Kode Enkripsi dari Token.exe =====
async function getEncryptionCodeFromApp(chatId) {
    bot.sendMessage(chatId, `🔐 Membuka AP2T ENKRIPSI untuk membaca kode otomatis...`);

    // Matikan Token.exe jika sudah running (mencegah .NET error "key already added")
    try { execSync('taskkill /F /IM Token.exe /T', { stdio: 'ignore' }); } catch(e) {}
    await new Promise(r => setTimeout(r, 1000));

    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const ps = spawn('powershell.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', READ_ENKRIPSI_PS1
        ]);

        let output = '';
        let stderr = '';

        ps.stdout.on('data', (data) => { output += data.toString(); });
        ps.stderr.on('data', (data) => { stderr += data.toString(); });

        const timeout = setTimeout(() => {
            ps.kill();
            reject(new Error('Timeout membaca enkripsi (30 detik)'));
        }, 30000);

        ps.on('close', (code) => {
            clearTimeout(timeout);
            console.log('PS output:', output);
            if (stderr) console.error('PS stderr:', stderr);

            if (code !== 0) return reject(new Error(`PowerShell exit ${code}. ${stderr}`));

            const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
            const resultLine = lines.find(l => l.startsWith('RESULT:'));
            if (!resultLine) return reject(new Error(`Kode tidak ditemukan dalam output PS`));
            
            const kode = resultLine.replace('RESULT:', '').trim();
            if (!kode || kode.length < 4) return reject(new Error(`Kode tidak valid: "${kode}"`));
            resolve(kode);
        });
    });
}

// ===== FUNGSI: Inisialisasi Browser =====
async function initBrowser(chatId) {
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
        try {
            if (browser) {
                try {
                    await browser.version();
                    if (!page || page.isClosed()) {
                        page = await browser.newPage();
                        setupPageHandlers();
                    }
                    return; 
                } catch(e) {
                    browser = null;
                }
            }

            if (chatId && retryCount === 0) bot.sendMessage(chatId, `⚙️ Mempersiapkan Chrome untuk login AP2T...`);

            // Coba reconnect ke browser yang ditinggalkan (jika bot baru restart)
            try {
                const axios = require('axios');
                const res = await axios.get('http://127.0.0.1:9222/json/version');
                browser = await puppeteer.connect({ browserWSEndpoint: res.data.webSocketDebuggerUrl, defaultViewport: null });
                const pages = await browser.pages();
                page = pages.find(p => p.url().includes('ap2t')) || pages[0];
                if (!page) page = await browser.newPage();
                setupPageHandlers();
                
                // Cek apakah sudah di dashboard
                if (page.url().toLowerCase().includes('beranda') || page.url().toLowerCase().includes('menu') || page.url().toLowerCase().includes('default')) {
                    isLoggedIn = true;
                }
                if (chatId && retryCount === 0) bot.sendMessage(chatId, `✅ Berhasil terhubung kembali ke browser yang sudah terbuka.`);
                return;
            } catch(e) {
                // Gagal reconnect, berarti harus buka baru
            }

            // Bersihkan Chrome lama
            killChromeAndClean(activeBrowserProfile);
            await new Promise(r => setTimeout(r, 3000)); // Tambah delay jadi 3 detik

            browser = await puppeteer.launch({
                executablePath: CHROME_EXE,
                userDataDir: getProfileDir(activeBrowserProfile),
                ignoreHTTPSErrors: true,
                args: [
                    '--no-first-run',
                    '--disable-restore-session-state',
                    '--disable-session-crashed-bubble',
                    '--disable-notifications',
                    '--disable-infobars',
                    '--disable-translate',
                    '--start-maximized',
                    '--no-sandbox', // Anti-crash
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-web-security',
                    '--remote-debugging-port=9222',
                    '--ignore-certificate-errors'
                ],
                headless: false,
                defaultViewport: null,
                pipe: true,
                timeout: 45000
            });

            browser.on('disconnected', () => {
                browser = null; page = null; isLoggedIn = false;
            });

            // Tunggu sebentar sebelum buka tab
            await new Promise(r => setTimeout(r, 1000));
            
            const existingPages = await browser.pages();
            for (const p of existingPages) {
                await p.close().catch(() => {});
            }

            page = await browser.newPage();
            setupPageHandlers();
            return; // Berhasil, keluar dari loop

        } catch (err) {
            retryCount++;
            console.error(`Gagal init browser (percobaan ${retryCount}):`, err.message);
            if (retryCount >= maxRetries) throw err;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

function setupPageHandlers() {
    page.on('dialog', async dialog => {
        console.log("Dialog:", dialog.message());
        if (activeChatId) bot.sendMessage(activeChatId, `⚠️ Alert Web: ${dialog.message()}`);
        await dialog.accept();
    });
}

// ===== FUNGSI: Minta Update Password Interaktif =====
async function askForPasswordUpdate(chatId, type) {
    return new Promise((resolve) => {
        bot.sendMessage(chatId, `⚠️ Password ${type.toUpperCase()} Anda sepertinya salah atau expired.\n\nSilakan balas pesan ini dengan **Password Baru** Anda (atau ketik /batal untuk membatalkan):`, { parse_mode: 'Markdown' });
        
        const listener = async (msg) => {
            if (msg.chat.id === chatId) {
                const text = msg.text.trim();
                if (text.startsWith('/')) { // jika itu command lain
                    if (text.toLowerCase() === '/batal') {
                        bot.sendMessage(chatId, `❌ Update password dibatalkan.`);
                        bot.removeListener('message', listener);
                        return resolve(false);
                    }
                    // Jika mengetik command lain, abaikan
                    return; 
                }
                
                bot.removeListener('message', listener);
                
                // Update password
                if (type === 'ap2t') {
                    
                    updateEnv('MAIN_PASSWORD', text);
                    bot.sendMessage(chatId, `✅ Password AP2T berhasil diupdate! Memulai ulang proses...`);
                } else if (type === 'webmail') {
                    getCredentials(accountType).web_pass = text;
                    updateEnv('WEBMAIL_PASSWORD', text);
                    bot.sendMessage(chatId, `✅ Password Webmail berhasil diupdate! Memulai ulang proses...`);
                }
                
                // Jika pakai profil, update juga di profiles.json
                const cAcc = getAccount(chatId);
    if (cAcc !== "none" && cAcc !== "main") {
                    
function getCredentials(accountType) {
    if (!accountType || accountType === 'main' || accountType === 'none') {
        return {
            ap2t_user: process.env.MAIN_USERNAME,
            ap2t_pass: process.env.MAIN_PASSWORD,
            web_user: process.env.WEBMAIL_USERNAME,
            web_pass: process.env.WEBMAIL_PASSWORD
        };
    }
    const profilesPath = require('path').join(process.cwd(), 'profiles.json');
    if (require('fs').existsSync(profilesPath)) {
        try { 
            const profiles = JSON.parse(require('fs').readFileSync(profilesPath, 'utf8')); 
            if (profiles[accountType]) return profiles[accountType];
        } catch(e) {}
    }
    return {};
}

const profilesPath = require('path').join(process.cwd(), 'profiles.json');
                    if (require('fs').existsSync(profilesPath)) {
                        try {
                            const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
                            if (profiles[cAcc]) {
                                if (type === 'ap2t') profiles[cAcc].ap2t_pass = text;
                                if (type === 'webmail') profiles[cAcc].web_pass = text;
                                require('fs').writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
                            }
                        } catch(e) {}
                    }
                }
                
                resolve(true);
            }
        };
        bot.on('message', listener);
    });
}

// ===== FUNGSI: Reset MAC via OWA =====
async function handleOwaMacReset(chatId, accountType) {
    bot.sendMessage(chatId, `🔄 Reset MAC Address via Webmail OWA...`);
    let mailPage = await browser.newPage();
    try {
        await mailPage.goto('https://webmail.pln.co.id/owa/auth/logon.aspx?replaceCurrent=1&url=https%3a%2f%2fwebmail.pln.co.id%2fowa', { waitUntil: 'networkidle2', timeout: 30000 });
        
        bot.sendMessage(chatId, `⏳ Login ke Webmail...`);
        await mailPage.waitForSelector('#username', { timeout: 15000 });
        await mailPage.evaluate((s) => { document.querySelector(s).value = ''; }, '#username');
        await mailPage.evaluate((s) => { document.querySelector(s).value = ''; }, '#password');
        await mailPage.type('#username', getCredentials(accountType).web_user);
        await mailPage.type('#password', getCredentials(accountType).web_pass);
        
        await Promise.all([
            mailPage.waitForNavigation({ waitUntil: 'networkidle2' }).catch(()=>null),
            mailPage.click('.signinbutton')
        ]);
        
        // Cek jika masih di halaman logon (gagal login)
        if (mailPage.url().toLowerCase().includes('logon.aspx')) {
            const errText = await mailPage.evaluate(() => {
                const errEl = document.querySelector('#divError');
                return errEl ? errEl.textContent.trim() : 'Gagal login OWA, password salah atau expired.';
            });
            bot.sendMessage(chatId, `❌ Pesan OWA: ${errText}`);
            
            const errLower = errText.toLowerCase();
            if (errLower.includes('password') || errLower.includes('sandi') || errLower.includes('salah') || errLower.includes('incorrect') || errLower.includes('expired')) {
                const updated = await askForPasswordUpdate(chatId, 'webmail');
                if (updated) {
                    await mailPage.close().catch(()=>{});
                    return await handleOwaMacReset(chatId, accountType);
                } else {
                    throw new Error("Password Webmail salah dan tidak diupdate.");
                }
            } else {
                throw new Error(errText);
            }
        }
        
        bot.sendMessage(chatId, `⏳ Menunggu dan mencari email pemberitahuan AP2T terbaru...`);
        
        let macDeleted = false;
        const maxRetries = 6; // Coba 6 kali x 15 detik = 90 detik batas toleransi

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            bot.sendMessage(chatId, `🔍 [Percobaan ${attempt}/${maxRetries}] Mengecek kotak masuk...`);
            await new Promise(r => setTimeout(r, 8000));
            
            // Klik email terbaru dari AP2T
            const emailClicked = await mailPage.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('span, div')).filter(el => 
                    el.textContent.trim() === 'notifikasi_AP2T@pln.co.id' || 
                    el.textContent.trim() === 'PLN - Pemberitahuan Login User'
                );
                
                for (let el of elements) {
                    if (el.offsetParent !== null && el.getBoundingClientRect().height > 0) {
                        el.scrollIntoView({ block: 'center' });
                        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        return true;
                    }
                }
                return false;
            });
            
            if (emailClicked) {
                await new Promise(r => setTimeout(r, 4000)); // Tunggu isi email muncul
                
                // Ambil semua URL dari link "Hapus"
                const hapusLinks = await mailPage.evaluate(() => {
                    return Array.from(document.querySelectorAll('a'))
                        .filter(a => a.textContent.trim().toLowerCase() === 'hapus')
                        .map(a => a.href);
                });
                
                // Saring hanya link yang BELUM PERNAH DIBUKA (untuk memastikan ini email baru)
                const newLinks = hapusLinks.filter(link => !globalClickedHapusLinks.has(link));
                
                if (newLinks.length > 0) {
                    bot.sendMessage(chatId, `🎉 Email BARU ditemukan! Memproses ${newLinks.length} MAC Address...`);
                    
                    for (let i = 0; i < newLinks.length; i++) {
                        const link = newLinks[i];
                        globalClickedHapusLinks.add(link); // Masukkan ke memori agar tidak diklik lagi nanti
                        
                        bot.sendMessage(chatId, `🧹 Menghapus MAC Address No.${i+1}...`);
                        const delPage = await browser.newPage();
                        try {
                            await delPage.goto(link, { waitUntil: 'networkidle2', timeout: 15000 });
                            await new Promise(r => setTimeout(r, 2000));
                        } catch(err) {
                            console.error(`Gagal menghapus MAC ${i+1}:`, err);
                        } finally {
                            await delPage.close().catch(()=>{});
                        }
                    }
                    bot.sendMessage(chatId, `✅ Semua MAC Address berhasil dihapus! Kembali ke AP2T...`);
                    macDeleted = true;
                    break; // Keluar dari loop karena berhasil
                } else {
                    bot.sendMessage(chatId, `⚠️ Email yang teratas adalah email lama. Menunggu email baru masuk...`);
                }
            } else {
                bot.sendMessage(chatId, `⚠️ Tidak ada email dari AP2T. Menunggu email baru masuk...`);
            }
            
            // Tunggu dan refresh halaman untuk cek email masuk yang baru
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 10000));
                bot.sendMessage(chatId, `🔄 Me-refresh Kotak Masuk...`);
                await mailPage.reload({ waitUntil: 'networkidle2' });
            }
        }
        
        if (!macDeleted) {
            throw new Error("Toleransi waktu habis. Email baru tidak kunjung masuk. Silakan ulangi login.");
        }
        
    } catch (e) {
        bot.sendMessage(chatId, `❌ Error Webmail OWA: ${e.message}`);
    } finally {
        await mailPage.close().catch(() => {});
    }
}

// ===== FUNGSI: Login =====
async function login(accountType, chatId) {
    try {
        await initBrowser(chatId);

        bot.sendMessage(chatId, `⏳ Membuka halaman login AP2T...`);
        await page.goto('https://ap2t.pln.co.id/ap2t/Login.aspx', { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Cek apakah langsung dialihkan ke dashboard (karena session cookie masih aktif)
        await new Promise(r => setTimeout(r, 3000));
        const dashboardUrlCheck = page.url().toLowerCase();
        if (dashboardUrlCheck.includes('beranda') || dashboardUrlCheck.includes('menu') || dashboardUrlCheck.includes('default')) {
            bot.sendMessage(chatId, `✅ Sesi sebelumnya masih aktif! Anda sudah berada di dalam sistem AP2T.`);
            return true;
        }

        
        const creds = getCredentials(accountType);
        const username = creds.ap2t_user;
        const password = creds.ap2t_pass;

        if (!username || !password) {
            bot.sendMessage(chatId, `⚠️ Kredensial [${accountType}] kosong di .env`);
            return false;
        }

        // Pastikan form login benar-benar ada
        try {
            await page.waitForSelector(SELECTORS.usernameInput, { timeout: 10000 });
        } catch (e) {
            bot.sendMessage(chatId, `⚠️ Halaman login tidak merespon dengan benar atau Anda sudah login di halaman lain.`);
            // Anggap saja sudah login untuk menghindari crash
            return true;
        }

        bot.sendMessage(chatId, `⏳ Mengisi User ID dan Password...`);

        await page.evaluate((s) => { document.querySelector(s).value = ''; }, SELECTORS.usernameInput);
        await page.evaluate((s) => { document.querySelector(s).value = ''; }, SELECTORS.passwordInput);
        await page.type(SELECTORS.usernameInput, username, { delay: 50 });
        await page.type(SELECTORS.passwordInput, password, { delay: 50 });

        // ===== BACA KODE ENKRIPSI OTOMATIS =====
        let kodeEnkripsi = '';
        try {
            kodeEnkripsi = await getEncryptionCodeFromApp(chatId);
            bot.sendMessage(chatId, `🔑 Kode enkripsi: \`${kodeEnkripsi}\``, { parse_mode: 'Markdown' });
        } catch (encErr) {
            console.error('Auto enkripsi gagal:', encErr.message);
            let extraMsg = '';
            if (encErr.message.includes('exit 1')) {
                extraMsg = '\n\n💡 *PENTING:* Error "exit 1" biasanya terjadi jika jendela RDP/VPS sedang di-minimize (diturunkan). Sistem Windows mematikan visual saat RDP di-minimize sehingga bot tidak bisa mengeklik popup Token. Harap biarkan RDP tetap terbuka di background!';
            }
            bot.sendMessage(chatId, `⚠️ Auto-baca gagal (${encErr.message}).${extraMsg}\nSilakan kirim kode enkripsi manual (timeout 45 detik):`, { parse_mode: 'Markdown' });

            let waitingManual = true;
            const manualHandler = (msg) => {
                if (msg.chat.id === chatId && msg.text && !msg.text.startsWith('/')) {
                    kodeEnkripsi = msg.text.trim();
                    waitingManual = false;
                    bot.removeListener('message', manualHandler);
                }
            };
            bot.on('message', manualHandler);
            let countdown = 45;
            while (waitingManual && countdown > 0) {
                await new Promise(r => setTimeout(r, 1000));
                countdown--;
            }
            bot.removeListener('message', manualHandler);
            if (!kodeEnkripsi) {
                bot.sendMessage(chatId, `⏰ Timeout menunggu kode manual. Login dibatalkan. Kunci sistem telah dilepas.`);
                return false;
            }
        }

        // Isi kode enkripsi — WAJIB pakai Ctrl+V (bukan ketik/set value)
        // Field AP2T punya event listener yang hanya trigger saat paste
        bot.sendMessage(chatId, `⏳ Memasukkan kode enkripsi via Ctrl+V...`);
        
        // 1. Set kode ke clipboard Windows dulu via PowerShell (gunakan base64 agar aman dari karakter khusus)
        try {
            const b64 = Buffer.from(kodeEnkripsi).toString('base64');
            execSync(`powershell -command "[System.Windows.Forms.Clipboard]::SetText([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}')))"`, { stdio: 'ignore' });
        } catch(e) {
            console.error('Set clipboard gagal:', e.message);
            // Fallback ke cara biasa jika gagal
            try {
                const escaped = kodeEnkripsi.replace(/'/g, "''");
                execSync(`powershell -command "Set-Clipboard -Value '${escaped}'"`, { stdio: 'ignore' });
            } catch(e2) {}
        }
        await new Promise(r => setTimeout(r, 1000));
        
        // 2. Klik field enkripsi agar terfokus
        await page.waitForSelector(SELECTORS.encryptionInput, { timeout: 10000 });
        await page.click(SELECTORS.encryptionInput);
        await new Promise(r => setTimeout(r, 300));
        
        // 3. Paste dengan Ctrl+V — ini yang memicu validasi AP2T
        await page.keyboard.down('Control');
        await page.keyboard.press('v');
        await page.keyboard.up('Control');
        
        // 4. Tunggu validasi selesai (checkbox Valid muncul)
        await new Promise(r => setTimeout(r, 2000));
        
        // Cek apakah valid (opsional, lanjut saja jika tidak terdeteksi)
        const isValid = await page.evaluate(() => {
            const lbl = document.querySelector('#lblEnkripsi');
            return lbl && lbl.value && lbl.value.toLowerCase().includes('valid');
        }).catch(() => false);
        
        if (isValid) {
            bot.sendMessage(chatId, `✅ Enkripsi Valid!`);
        } else {
            bot.sendMessage(chatId, `⚠️ Enkripsi mungkin belum tervalidasi, melanjutkan login...`);
        }
        await new Promise(r => setTimeout(r, 500));

        // Klik Login
        bot.sendMessage(chatId, `⏳ Menekan tombol Login...`);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
            page.click(SELECTORS.loginButton),
        ]);
        await new Promise(r => setTimeout(r, 3000));

        // Cek hasil login
        const isDashboard = await page.$(SELECTORS.dashboardElement).catch(() => null);
        if (isDashboard) return true;

        // Cek limit MAC
        const content = await page.content();
        if (content.includes('Mohon maaf User ID AP2T hanya diijinkan dari 2 MAC Address') || content.includes('dikirimkan ke email')) {
            bot.sendMessage(chatId, `⚠️ Limit MAC Address terdeteksi. Otomatis reset via OWA...`);
            await handleOwaMacReset(chatId, accountType);
            bot.sendMessage(chatId, `🔄 Login ulang setelah reset...`);
            return await login(accountType, chatId);
        }

        // Cek apakah URL sudah bukan login page
        const currentUrl = page.url();
        if (!currentUrl.includes('Login.aspx')) {
            return true; // berhasil
        }

        const errorEl = await page.$(SELECTORS.errorMessage).catch(() => null);
        if (errorEl) {
            const errText = await page.evaluate(el => el.textContent, errorEl);
            bot.sendMessage(chatId, `❌ Pesan web: ${errText.trim()}`);

            const errLower = errText.toLowerCase();
            if (errLower.includes('password') || errLower.includes('sandi') || errLower.includes('expired') || errLower.includes('kedaluwarsa') || errLower.includes('salah')) {
                const updated = await askForPasswordUpdate(chatId, 'ap2t');
                if (updated) {
                    return await login(accountType, chatId);
                }
            }
        }
        return false;

    } catch (error) {
        console.error(`Login error [${accountType}]:`, error.message);
        bot.sendMessage(chatId, `❌ Error login: ${error.message}`);
        // Reset browser state agar bisa dicoba lagi
        browser = null; page = null;
        return false;
    }
}

// ===== FUNGSI: Smart Login =====
async function startSmartLogin(chatId) {
    bot.sendMessage(chatId, `🚀 Memulai proses login...`);
    const success = await login('main', chatId);
    if (success) {
        isLoggedIn = true;
        userAccounts[chatId] = 'main';
        bot.sendMessage(chatId, `✅ Login berhasil dengan Akun Utama!`);
    } else {
        bot.sendMessage(chatId, `⚠️ Login gagal. Coba lagi dengan /login atau /reset_akun`);
    }
}



bot.onText(/\/stop_bot/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, `🛑 **Bot Dihentikan (Standby)**\nSemua proses browser telah dimatikan. Bot sekarang dalam posisi standby. Ketik /login jika Anda ingin mulai menggunakan lagi.`, { parse_mode: 'Markdown' });
    try {
        if (page && !page.isClosed()) { await page.close().catch(() => {}); }
        if (browser) { await browser.close().catch(() => {}); }
    } catch(e) {}
    page = null;
    browser = null;
    isLoggedIn = false;
    userAccounts[chatId] = 'main';
    isLoggingIn = false;
    killChromeAndClean();
});

// ===== FUNGSI HELPER: Navigasi & UI =====

async function closePopups(page) {
    try {
        // 1. Coba tekan tombol Escape (seringkali menutup popup di ExtJS)
        await page.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 500));

        // 2. Cari tombol tutup secara teknis
        const closeLogic = () => {
            // Cari ikon X di pojok kanan atas popup
            const xButtons = Array.from(document.querySelectorAll('.x-tool-close, .x-tool-close-over, .x-window-close'));
            xButtons.forEach(btn => { if (btn.offsetParent !== null) btn.click(); });

            // Cari tombol dengan teks Close/Tutup di dalam button ExtJS
            const allBtns = Array.from(document.querySelectorAll('button, .x-btn-text, .x-btn-center'));
            const closeBtn = allBtns.find(el => {
                const txt = el.textContent.trim().toLowerCase();
                return txt === 'close' || txt === 'tutup' || txt === 'tutup / close';
            });
            
            if (closeBtn && closeBtn.offsetParent !== null) {
                closeBtn.click();
            }
        };

        // Eksekusi di main page
        await page.evaluate(closeLogic).catch(() => {});
        
        // Eksekusi di semua iframe
        for (const frame of page.frames()) {
            await frame.evaluate(closeLogic).catch(() => {});
        }
        
        await new Promise(r => setTimeout(r, 1000));
    } catch (e) {}
}

async function clickMenu(page, menuPath) {
    for (const menuName of menuPath) {
        console.log(`Mencoba klik menu: ${menuName}`);
        
        // Pastikan tidak ada popup yang menghalangi
        await closePopups(page);

        const clicked = await page.evaluate((name) => {
            const elements = Array.from(document.querySelectorAll('.x-tree-node-anchor, .x-tree-node-text, span, a'));
            const target = elements.find(el => el.textContent.trim() === name && el.offsetParent !== null);
            
            if (target) {
                const node = target.closest('.x-tree-node-el');
                const ec = node ? node.querySelector('.x-tree-ec-icon') : null;
                if (ec && (ec.className.includes('plus') || ec.className.includes('expand'))) {
                    ec.click();
                } else {
                    target.click();
                }
                return true;
            }
            return false;
        }, menuName);

        if (!clicked) {
            // Fallback: klik tanpa cek offsetParent (mungkin terhalang popup transparan)
            const forceClicked = await page.evaluate((name) => {
                const elements = Array.from(document.querySelectorAll('.x-tree-node-anchor, .x-tree-node-text'));
                const target = elements.find(el => el.textContent.trim() === name);
                if (target) { target.click(); return true; }
                return false;
            }, menuName);
            
            if (!forceClicked) throw new Error(`Menu "${menuName}" tidak ditemukan`);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function setFieldValue(page, labelText, value, isDropdown = false) {
    const success = await page.evaluate(async (label, val, drop) => {
        const labels = Array.from(document.querySelectorAll('label, span, td, .x-form-item-label'));
        const targetLabel = labels.find(el => el.textContent.trim().includes(label) && el.offsetParent !== null);
        if (!targetLabel) return { success: false, msg: `Label ${label} tidak ditemukan` };

        // Cari input di parent atau sibling
        let container = targetLabel.closest('.x-form-item') || targetLabel.parentElement;
        let input = container.querySelector('input, textarea');
        
        if (!input) {
            // Coba cari di row yang sama (td)
            const row = targetLabel.closest('tr');
            if (row) input = row.querySelector('input, textarea');
        }

        if (input) {
            input.focus();
            input.scrollIntoView();
            // Simpan ID untuk digunakan di page.type()
            if (!input.id) input.id = 'bot_input_' + Math.random().toString(36).substr(2, 9);
            return { success: true, id: input.id };
        }
        return { success: false, msg: `Input untuk ${label} tidak ditemukan` };
    }, labelText, value, isDropdown);

    if (success.success) {
        // Gunakan page.type untuk simulasi keyboard sungguhan
        await page.click(`#${success.id}`, { clickCount: 3 }); // Select all
        await page.keyboard.press('Backspace');
        await page.type(`#${success.id}`, value, { delay: 50 });
        await page.keyboard.press('Tab');
        await new Promise(r => setTimeout(r, 500));
        return true;
    }
    console.error(success.msg);
    return false;
}

// ===== FUNGSI UTAMA: PROSES CT =====

async function processCT(idpel, nogan, chatId) {
    activeChatId = chatId;
    try {
        if (!isLoggedIn) {
            const ok = await login('main', chatId);
            if (!ok) return;
            isLoggedIn = true;
            userAccounts[chatId] = 'main';
        }

        bot.sendMessage(chatId, `🔍 Membersihkan popup pengumuman...`);
        // Tutup popup berkali-kali (agresif)
        for (let i = 0; i < 5; i++) {
            await closePopups(page);
            await new Promise(r => setTimeout(r, 800));
        }
        
        bot.sendMessage(chatId, `🔍 Navigasi Menu Pengaduan...`);
        // Pastikan menu terlihat
        await page.evaluate(() => {
            const expand = Array.from(document.querySelectorAll('a, span')).find(el => el.textContent.includes('Expand All'));
            if (expand) expand.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        await clickMenu(page, ['PELAYANAN PELANGGAN', 'Rekening', 'Permohonan', 'Pengaduan Pelanggan']);
        
        bot.sendMessage(chatId, `⏳ Menunggu halaman Pengaduan Pelanggan terbuka...`);
        await page.waitForFunction(() => !document.body.innerText.includes('Loading Pengaduan Pelanggan'), { timeout: 30000 });
        await new Promise(r => setTimeout(r, 4000));

        // Bersihkan popup Informasi Pesta Siap Bongkar yang sering muncul setelah halaman dimuat
        bot.sendMessage(chatId, `🔍 Membersihkan popup Informasi jika ada...`);
        for (let i = 0; i < 3; i++) {
            await closePopups(page);
            await new Promise(r => setTimeout(r, 500));
        }

        // 0. Klik Tombol CLEAR (Jika sudah terbuka sebelumnya agar form bersih)
        bot.sendMessage(chatId, `🧹 Membersihkan Form Pengaduan...`);
        await page.evaluate(() => {
            const frames = Array.from(document.querySelectorAll('iframe'));
            for (const f of frames) {
                try {
                    const btns = Array.from(f.contentDocument.querySelectorAll('button, .x-btn-text'));
                    const clearBtn = btns.find(b => b.textContent.trim() === 'Clear' && b.offsetParent !== null);
                    if (clearBtn) {
                        clearBtn.click();
                        return;
                    }
                } catch (e) {}
            }
            // Jika di main page
            const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
            const clearBtn = btns.find(b => b.textContent.trim() === 'Clear' && b.offsetParent !== null);
            if (clearBtn) clearBtn.click();
        });
        await new Promise(r => setTimeout(r, 2000));

        // 1. Input Id Pelanggan (Cari di semua frame secara langsung)
        bot.sendMessage(chatId, `📝 Mencari kolom Id Pelanggan di semua tingkatan halaman...`);
        
        let targetFrame = null;
        const allFrames = page.frames();
        
        for (const frame of allFrames) {
            try {
                const found = await frame.evaluate(() => {
                    const labels = Array.from(document.querySelectorAll('label, span, td, .x-form-item-label'));
                    const targetLabel = labels.find(l => l.textContent.trim().includes('Id Pelanggan') && l.offsetParent !== null);
                    
                    if (targetLabel) {
                        let container = targetLabel.closest('.x-form-item') || targetLabel.parentElement;
                        let input = container.querySelector('input[type="text"]');
                        if (!input) {
                            const allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
                            input = allInputs.find(i => i.offsetParent !== null && Math.abs(i.getBoundingClientRect().top - targetLabel.getBoundingClientRect().top) < 30);
                        }
                        
                        if (input) {
                            input.id = 'final_target_idpel';
                            input.scrollIntoView();
                            return true;
                        }
                    }
                    return false;
                });

                if (found) {
                    targetFrame = frame;
                    break;
                }
            } catch (e) {}
        }

        if (targetFrame) {
            bot.sendMessage(chatId, `📝 Mengisi Id Pelanggan: ${idpel}...`);
            await targetFrame.click('#final_target_idpel', { clickCount: 3 });
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            await new Promise(r => setTimeout(r, 500));
            
            // Isi dengan type (simulasi)
            await targetFrame.type('#final_target_idpel', idpel, { delay: 100 });
            await page.keyboard.press('Enter');
            
            // Backup: paksa value jika type gagal memicu perubahan
            await targetFrame.evaluate((val) => {
                const input = document.getElementById('final_target_idpel');
                if (input && input.value !== val) {
                    input.value = val;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, idpel);

            bot.sendMessage(chatId, `⏳ Menunggu data muncul...`);
            await new Promise(r => setTimeout(r, 4000));

            // CEK TARIF PASCABAYAR & AMBIL NAMA
            bot.sendMessage(chatId, `🔍 Mengecek Tarif / Daya dan Nama Pelanggan...`);
            const extractedData = await targetFrame.evaluate(() => {
                const labels = Array.from(document.querySelectorAll('label'));
                const tarifLabel = labels.find(l => l.textContent.includes('Tarif / Daya'));
                const namaLabel = labels.find(l => l.textContent === 'Nama:' || l.textContent === 'Nama');
                
                let tarif = null;
                let nama = null;

                if (tarifLabel) {
                    const input = tarifLabel.closest('.x-form-item')?.querySelector('input');
                    if (input) tarif = input.value;
                }
                if (namaLabel) {
                    const input = namaLabel.closest('.x-form-item')?.querySelector('input');
                    if (input) nama = input.value;
                }
                
                return { tarif, nama };
            });

            const tarifDaya = extractedData.tarif;
            if (extractedData.nama) namaPelanggan = extractedData.nama;

            if (tarifDaya) {
                // Contoh: "R1M / 900"
                const tarifParts = tarifDaya.split('/');
                const tarif = tarifParts[0].trim().toUpperCase();
                if (!tarif.endsWith('T')) {
                    throw new Error(`⚠️ *KWH PASCABAYAR TERDETEKSI!*\nTarif Pelanggan: \`${tarifDaya}\`\nTarif tidak memiliki akhiran 'T', sehingga CT tidak dapat dibuat untuk KWH Pascabayar.`);
                }
            }
        } else {
            const ss = await page.screenshot().catch(() => null);
            if (ss) await bot.sendPhoto(chatId, ss, { caption: "Gagal menemukan kolom IDPEL." });
            throw new Error("Gagal menemukan kolom input Id Pelanggan.");
        }

        // Fungsi helper untuk memilih combobox ExtJS secara presisi
        const selectExtJSCombo = async (labelName, targetVal) => {
            await checkPause(chatId); // Tahan sebelum interaksi jika di-pause
            const id = await targetFrame.evaluate((lName) => {
                const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes(lName));
                if (!lbl) return null;
                const inp = lbl.closest('.x-form-item').querySelector('input');
                if (!inp) return null;
                // Klik tombol panah dropdown jika ada
                const trig = lbl.closest('.x-form-item').querySelector('.x-form-trigger');
                if (trig) trig.click(); else inp.click();
                inp.id = 'combo_' + Math.random().toString(36).substr(2, 5);
                return inp.id;
            }, labelName);

            if (!id) throw new Error(`Input dropdown ${labelName} tidak ditemukan`);

            // Ketik untuk memfilter
            await targetFrame.click(`#${id}`, { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await targetFrame.type(`#${id}`, targetVal, { delay: 50 });
            await new Promise(r => setTimeout(r, 1500)); // Tunggu daftar muncul

            // Cari dan klik elemen dropdown yang teksnya persis sama via DOM Events (bypass Puppeteer click errors)
            const targetClicked = await targetFrame.evaluate((tVal) => {
                const items = Array.from(document.querySelectorAll('.x-combo-list-item, .x-boundlist-item'));
                const target = items.find(i => i.textContent.trim().toUpperCase() === tVal.toUpperCase() && i.offsetParent !== null);
                if (target) {
                    target.scrollIntoView({ block: 'center' });
                    // ExtJS ComboBox mendeteksi event mousedown untuk memilih item
                    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    return true;
                }
                return false;
            }, targetVal);

            if (!targetClicked) throw new Error(`Opsi "${targetVal}" tidak terdeteksi di dropdown ${labelName}. Menghentikan proses.`);
            
            await new Promise(r => setTimeout(r, 500));
            await page.keyboard.press('Tab'); // Trigger blur event untuk validasi
            await new Promise(r => setTimeout(r, 500));
        };

        // 2. Pilih Jenis Pengaduan (Menggunakan Klik Presisi)
        await checkPause(chatId);
        bot.sendMessage(chatId, `📝 Memilih Jenis Pengaduan...`);
        await selectExtJSCombo('Jenis Pengaduan', 'PERMINTAAN CLEAR TAMPER');

        // 3. Isi Uraian
        await checkPause(chatId);
        bot.sendMessage(chatId, `📝 Mengisi Uraian: ${nogan}...`);
        await targetFrame.evaluate((labelName) => {
            const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes(labelName));
            if (label) {
                const input = label.closest('.x-form-item').querySelector('textarea, input');
                input.focus();
                input.id = 'final_target_uraian';
            }
        }, 'Uraian:');
        await targetFrame.click('#final_target_uraian', { clickCount: 3 }).catch(() => {});
        await targetFrame.type('#final_target_uraian', nogan, { delay: 50 }).catch(() => {});
        await new Promise(r => setTimeout(r, 1000));

        // 4. Pilih Alasan Clear Tamper (Menggunakan Klik Presisi)
        await checkPause(chatId);
        bot.sendMessage(chatId, `📝 Memilih Alasan Clear Tamper...`);
        await selectExtJSCombo('Alasan Clear Tamper', 'Muncul Informasi Call, Overload atau Lock');
        

        // Screenshot sebelum Save
        const diagnosticSS = await page.screenshot().catch(() => null);
        if (diagnosticSS) await bot.sendPhoto(chatId, diagnosticSS, { caption: "Status Form sebelum Save" });

        // Tahan di sini jika user meminta pause
        await checkPause(chatId);

        // 5. Klik Save
        bot.sendMessage(chatId, `💾 Menyimpan Pengaduan...`);
        await targetFrame.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
            const saveBtn = btns.find(b => b.textContent.trim() === 'Save' && b.offsetParent !== null);
            if (saveBtn) {
                saveBtn.focus();
                saveBtn.click();
            }
        });

        // 6. Tunggu dan Klik OK pada Popup Success
        bot.sendMessage(chatId, `⏳ Menunggu konfirmasi sukses...`);
        await new Promise(r => setTimeout(r, 2500));
        await targetFrame.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
            const okBtn = btns.find(b => b.textContent.trim() === 'OK' && b.offsetParent !== null);
            if (okBtn) okBtn.click();
        });
        await new Promise(r => setTimeout(r, 1500));

        // 7. Ambil Nomor Pengaduan (No Agenda) - VISUAL BLOCK
        bot.sendMessage(chatId, `🔍 Menyalin No Agenda (Visual Block)...`);
        let noAgenda = null;
        for (let i = 0; i < 3; i++) {
            noAgenda = await targetFrame.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input'));
                const target = inputs.find(inp => {
                    const val = inp.value ? inp.value.trim() : '';
                    return val.length >= 12 && val.startsWith('17') && /^\d+$/.test(val) && inp.offsetParent !== null;
                });
                if (target) {
                    target.focus();
                    target.select(); // Visual block (biru)
                    return target.value.trim();
                }
                return null;
            });
            if (noAgenda) break;
            await new Promise(r => setTimeout(r, 1500));
        }

        if (!noAgenda) {
            const ss = await page.screenshot().catch(() => null);
            if (ss) await bot.sendPhoto(chatId, ss, { caption: "No Agenda tidak ditemukan di layar." });
            throw new Error("Gagal memindai No Agenda dari layar. Berhenti.");
        }
        bot.sendMessage(chatId, `📝 No Agenda ditemukan: <code>${noAgenda}</code>.`);

        // 8. Navigasi ke Aktivasi No Meter
        bot.sendMessage(chatId, `🚚 Navigasi ke Menu Aktivasi No Meter...`);
        await clickMenu(page, ['PELAYANAN PELANGGAN', 'Perintah Kerja', 'Aktivasi No Meter']);
        bot.sendMessage(chatId, `⏳ Menunggu halaman Aktivasi No Meter terbuka...`);
        await new Promise(r => setTimeout(r, 6000));

        // Bersihkan popup Informasi Pesta Siap Bongkar jika muncul lagi
        bot.sendMessage(chatId, `🔍 Membersihkan popup Informasi jika ada...`);
        for (let i = 0; i < 3; i++) {
            await closePopups(page);
            await new Promise(r => setTimeout(r, 500));
        }

        // Mencari frame Aktivasi No Meter (Deep Scanner)
        let aktivasiFrame = null;
        for (const frame of page.frames()) {
            const isAktivasi = await frame.evaluate(() => {
                return document.body.innerText.includes('Pencarian') || 
                       document.body.innerText.includes('No Agenda') ||
                       document.querySelector('input[id*="ext-comp"]') !== null;
            });
            if (isAktivasi) {
                // Pastikan ada input pencarian di frame ini
                const hasInput = await frame.evaluate(() => {
                    return Array.from(document.querySelectorAll('input')).some(i => i.offsetParent !== null);
                });
                if (hasInput) {
                    aktivasiFrame = frame;
                    break;
                }
            }
        }
        if (!aktivasiFrame) aktivasiFrame = page;

        // 9. Input No Agenda di Aktivasi (Force Paste)
        bot.sendMessage(chatId, `📝 Menempelkan No Agenda di Aktivasi...`);
        const inputIdentified = await aktivasiFrame.evaluate((val) => {
            // Cara 1: Cari label
            const labels = Array.from(document.querySelectorAll('label, span'));
            const label = labels.find(l => l.textContent.includes('No Agenda') && l.offsetParent !== null);
            let target = null;
            if (label) {
                target = label.closest('.x-form-item')?.querySelector('input') || label.parentElement.querySelector('input');
            }
            
            // Cara 2: Cari input pertama yang kosong dan visible
            if (!target) {
                const allInputs = Array.from(document.querySelectorAll('input'));
                target = allInputs.find(i => i.offsetParent !== null && i.type === 'text' && i.id.includes('ext-comp'));
            }

            if (target) {
                target.style.border = "5px solid red"; // Tandai merah
                target.focus();
                target.id = 'target_input_aktivasi_final';
                return true;
            }
            return false;
        }, noAgenda);

        if (inputIdentified) {
            await aktivasiFrame.click('#target_input_aktivasi_final', { clickCount: 3 }).catch(() => null);
            await new Promise(r => setTimeout(r, 500));
            
            // Clear isi dengan Backspace berulang atau pastikan terhapus
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Backspace');
            await new Promise(r => setTimeout(r, 1500)); // Tunggu sistem ready

            bot.sendMessage(chatId, `⌨️ Mengetik No Agenda: ${noAgenda}...`);
            await aktivasiFrame.type('#target_input_aktivasi_final', noAgenda, { delay: 100 });
            await new Promise(r => setTimeout(r, 1000));
            
            const ssAktivasi = await page.screenshot().catch(() => null);
            if (ssAktivasi) await bot.sendPhoto(chatId, ssAktivasi, { caption: "Status kolom No Agenda (Cek Kotak Merah)" });

            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 1000));
            
            // Klik Tombol Cari
            await aktivasiFrame.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, .x-btn-text, .x-form-trigger'));
                const findBtn = btns.find(b => (b.textContent.includes('Cari') || b.className.includes('search')) && b.offsetParent !== null);
                if (findBtn) findBtn.click();
            });
            await new Promise(r => setTimeout(r, 5000));

            // 10. Klik Tombol SIMPAN
            bot.sendMessage(chatId, `💾 Menyimpan Aktivasi...`);
            const saveSuccess = await aktivasiFrame.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
                const saveBtn = btns.find(b => b.textContent.trim().toUpperCase() === 'SIMPAN' && b.offsetParent !== null);
                if (saveBtn) {
                    saveBtn.click();
                    return true;
                }
                return false;
            });

            if (saveSuccess) {
                bot.sendMessage(chatId, `⏳ Menunggu popup konfirmasi...`);
                await new Promise(r => setTimeout(r, 4000));
                
                // Popup 1: Ya
                const yaClicked = await aktivasiFrame.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
                    const yaBtn = btns.find(b => b.textContent.trim() === 'Ya' && b.offsetParent !== null);
                    if (yaBtn) { yaBtn.click(); return true; }
                    return false;
                });
                if (yaClicked) bot.sendMessage(chatId, `✅ Konfirmasi 'Ya' diklik.`);
                
                await new Promise(r => setTimeout(r, 4000));
                
                // Popup 2: OK
                const okClicked = await aktivasiFrame.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
                    const okBtn = btns.find(b => b.textContent.trim() === 'OK' && b.offsetParent !== null);
                    if (okBtn) { okBtn.click(); return true; }
                    return false;
                });
                if (okClicked) bot.sendMessage(chatId, `✅ Konfirmasi 'OK' diklik.`);
                
                bot.sendMessage(chatId, `🎉 **Aktivasi Berhasil Disimpan!**`);
            } else {
                bot.sendMessage(chatId, `⚠️ Tombol SIMPAN tidak merespon/tidak ditemukan.`);
            }
        } else {
            throw new Error("Gagal menemukan kolom input No Agenda di halaman Aktivasi.");
        }

        // 11. Monitoring & Ambil Token CT
        bot.sendMessage(chatId, `🔍 Menuju Monitoring Permohonan Token...`);
        await clickMenu(page, ['PELAYANAN PELANGGAN', 'Monitoring', 'Monitoring Permohonan Token']);
        await new Promise(r => setTimeout(r, 12000));

        // Bersihkan popup Informasi Pesta Siap Bongkar jika muncul lagi
        bot.sendMessage(chatId, `🔍 Membersihkan popup Informasi jika ada...`);
        for (let i = 0; i < 3; i++) {
            await closePopups(page);
            await new Promise(r => setTimeout(r, 500));
        }

        // Cari frame yang memuat konten Monitoring (AP2T pakai iframe)
        bot.sendMessage(chatId, `🎯 Mendeteksi frame Monitoring...`);
        
        let monitorFrame = null;
        const frames = page.frames();
        for (const frame of frames) {
            try {
                const found = await frame.evaluate(() => {
                    return !!Array.from(document.querySelectorAll('*')).find(el =>
                        el.innerText && el.innerText.includes('Jenis Permohonan') && el.offsetParent !== null
                    );
                });
                if (found) {
                    monitorFrame = frame;
                    break;
                }
            } catch (e) { /* skip frame yang tidak bisa diakses */ }
        }

        // Jika tidak ditemukan di frame, coba di halaman utama
        if (!monitorFrame) monitorFrame = page;

        // Sekarang cari dan isi input di frame yang benar
        const visualResult = await monitorFrame.evaluate(() => {
            const allElements = Array.from(document.querySelectorAll('*'));
            const label = allElements.find(el =>
                el.innerText && el.innerText.trim().includes('Jenis Permohonan') &&
                el.offsetParent !== null && el.children.length === 0
            );

            if (label) {
                const rect = label.getBoundingClientRect();
                // Toleransi sangat ketat (15px) agar hanya baris Jenis Permohonan yang terpilih
                const inputs = Array.from(document.querySelectorAll('input, select')).filter(i => {
                    const iRect = i.getBoundingClientRect();
                    return iRect.left > rect.left && 
                           Math.abs(iRect.top - rect.top) < 15 && 
                           i.offsetParent !== null;
                });
                inputs.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

                if (inputs.length >= 2) {
                    inputs[0].id = 'final_dropdown_visual';
                    inputs[1].id = 'final_agenda_visual';
                    inputs[0].style.border = '3px solid red';
                    inputs[1].style.border = '3px solid blue';
                    return 'OK';
                }
                return 'ONLY_FOUND_' + inputs.length;
            }
            return 'LABEL_NOT_FOUND';
        });

        if (visualResult === 'OK') {
            // Isi Dropdown Jenis Permohonan
            const dropdownEl = await monitorFrame.$('#final_dropdown_visual');
            await dropdownEl.click({ clickCount: 3 }).catch(()=>null);
            await new Promise(r => setTimeout(r, 500));
            await page.keyboard.press('Backspace');
            await page.keyboard.type('PER NOAGENDA', { delay: 100 });
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 1500));

            // Isi No Agenda
            const agendaEl = await monitorFrame.$('#final_agenda_visual');
            await agendaEl.click({ clickCount: 3 }).catch(()=>null);
            await new Promise(r => setTimeout(r, 500));
            await page.keyboard.press('Backspace');
            await page.keyboard.type(noAgenda, { delay: 100 });
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 1000));

            // Klik Tombol Filter
            await monitorFrame.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
                const filterBtn = btns.find(b => b.textContent.trim() === 'Filter' && b.offsetParent !== null);
                if (filterBtn) filterBtn.click();
            });

            bot.sendMessage(chatId, `✅ Filter berhasil diisi! Memantau Token...`);
        } else {
            bot.sendMessage(chatId, `❌ Gagal deteksi: ${visualResult}. Proses dihentikan.`);
            return;
        }

        // Loop Filter & Ambil Token dari CLEAR TAMPER
        bot.sendMessage(chatId, `🔄 Memantau Token... (Menunggu Status 3)`);
        
        let tokenCT = null;
        let retries = 0;
        const maxRetries = 30; // Max 150 detik

        while (retries < maxRetries) {
            // Klik Filter di frame yang benar
            await monitorFrame.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
                const filterBtn = btns.find(b => b.textContent.trim() === 'Filter' && b.offsetParent !== null);
                if (filterBtn) filterBtn.click();
            });
            
            await new Promise(r => setTimeout(r, 5000)); 

            // Scan tabel di frame yang benar — cari kolom CLEAR TAMPER dari baris status 3
            const foundToken = await monitorFrame.evaluate((currentAgenda) => {
                // Cari baris dengan STATUSAGENDA = 3
                const rows = Array.from(document.querySelectorAll('tr, .x-grid3-row'));
                const row3 = rows.find(r => {
                    const cells = Array.from(r.querySelectorAll('td'));
                    return cells.some(c => c.textContent.trim() === '3');
                });

                if (row3) {
                    // Cari angka 20 digit di baris tersebut yang BUKAN No Agenda
                    const cells = Array.from(row3.querySelectorAll('td'));
                    const tokenCell = cells.find(c => {
                        const val = c.textContent.trim().replace(/\s/g, '');
                        // Harus 20 digit dan tidak boleh sama dengan No Agenda yang kita cari
                        return /^\d{20}$/.test(val) && val !== currentAgenda;
                    });
                    
                    if (tokenCell) return tokenCell.textContent.trim().replace(/\s/g, '');
                    return 'WAIT'; // Baris 3 ada tapi token belum muncul atau masih No Agenda saja
                }
                return null; // Belum ada baris status 3
            }, noAgenda);

            if (foundToken && foundToken !== 'WAIT') {
                tokenCT = foundToken;
                break;
            }
            
            retries++;
            if (retries % 6 === 0) bot.sendMessage(chatId, `⏳ Masih menunggu status menjadi '3'...`);
        }

        if (tokenCT) {
            // Kirim HANYA token Clear Tamper ke Telegram
            bot.sendMessage(chatId, `🎉 *TOKEN CLEAR TAMPER:*\n\`${tokenCT}\``, { parse_mode: 'Markdown' });

            // KIRIM DATA KE GOOGLE SHEETS
            bot.sendMessage(chatId, `📡 Menyimpan rekapan ke Google Sheets...`);
            try {
                // Dapatkan nama user Telegram sebagai "Pembuat"
                // Chat ID bisa kita gunakan untuk mencari tahu info chat dari bot (tapi butuh request terpisah)
                // Sementara kita asumsikan 'Operator' atau mencoba fetch chat.
                const chatInfo = await bot.getChat(chatId).catch(() => ({ first_name: 'Operator' }));
                const pembuat = chatInfo.first_name || 'Operator';
                
                // Format Tanggal dan Waktu (Local PC Time)
                const now = new Date();
                const pad = n => n.toString().padStart(2, '0');
                const tanggalWaktu = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

                const dataRekap = {
                    tanggalWaktu: tanggalWaktu,
                    idPelanggan: idpel,
                    namaPelanggan: namaPelanggan,
                    noGangguan: nogan,
                    tokenCT: tokenCT,
                    pembuat: pembuat
                };

                const webAppUrl = process.env.SPREADSHEET_URL || 'https://script.google.com/macros/s/AKfycbxAskrmNvQUl_2LU3tAiOmvQe7Vg3LBgvQ5_luucALirKtwiyoVCQwE1TahITURsjex/exec';
                const response = await fetch(webAppUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dataRekap)
                });
                
                const resultText = await response.text();
                if (resultText.includes('error') || response.status !== 200) {
                    bot.sendMessage(chatId, `⚠️ Terkirim ke Spreadsheet, tapi ada pesan: ${resultText.substring(0, 50)}`);
                } else {
                    bot.sendMessage(chatId, `✅ Rekapan berhasil disimpan ke Spreadsheet!`);
                }
            } catch (err) {
                console.error("Gagal menyimpan ke GSheets:", err.message);
                bot.sendMessage(chatId, `⚠️ Gagal menyimpan ke Spreadsheet: ${err.message}`);
            }

        } else {
            bot.sendMessage(chatId, `⚠️ Waktu habis. Status belum '3' atau Token CLEAR TAMPER belum muncul di tabel.`);
        }
        
        // Rapikan tab HANYA JIKA SUKSES
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('.x-tab-strip-closable'));
            tabs.forEach(t => {
                const text = t.textContent;
                if (text.includes('Aktivasi') || text.includes('Pengaduan')) {
                    const close = t.querySelector('.x-tab-strip-close');
                    if (close) close.click();
                }
            });
        });

    } catch (e) {
        console.error("CT Error:", e);
        bot.sendMessage(chatId, `❌ Terjadi error saat proses CT: ${e.message}\n\n*Catatan:* Browser SENGAJA DIBIARKAN TERBUKA agar Anda bisa mengecek layar PC untuk melihat pesan error aslinya. Tutup tab secara manual di PC jika sudah selesai.`, { parse_mode: 'Markdown' });
        
        // Jika error karena logout, coba login ulang sekali
        if (e.message.includes('not found') || e.message.includes('disconnected')) {
            bot.sendMessage(chatId, `🔄 Sesi terputus, mencoba memulihkan...`);
            isLoggedIn = false;
        }
    }
}



// ===== FUNGSI: Eksekusi Cari Nomor Meter (/nomet) =====
async function processCariNomet(nomet, chatId) {
    if (!browser || !page || !isLoggedIn) {
        return bot.sendMessage(chatId, `⚠️ Bot belum login ke AP2T. Silakan /login terlebih dahulu.`);
    }

    try {
        bot.sendMessage(chatId, `🔍 Membuka menu Info Pelanggan...`);
        await clickMenu(page, ['INFO PELANGGAN', 'Info Pelanggan']);
        await new Promise(r => setTimeout(r, 6000));

        // Bersihkan popup jika muncul
        bot.sendMessage(chatId, `🧹 Menghapus popup jika ada...`);
        for (let i = 0; i < 3; i++) {
            await closePopups(page);
            await new Promise(r => setTimeout(r, 500));
        }

        // Cari frame Info Pelanggan
        let infoFrame = null;
        const frames = page.frames();
        for (const frame of frames) {
            try {
                const isInfo = await frame.evaluate(() => {
                    return document.body.innerText.includes('Unit UPI') || document.body.innerText.includes('Main Result');
                });
                if (isInfo) {
                    infoFrame = frame;
                    break;
                }
            } catch (e) {}
        }
        if (!infoFrame) infoFrame = page;

        bot.sendMessage(chatId, `📝 Mengatur filter pencarian...`);
        
        // 1. Ubah Dropdown menjadi 'Nomor Meter'
        const filterComboId = await infoFrame.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('.x-form-text'));
            const combo = inputs.find(i => i.value === 'Id Pelanggan' || i.value === 'Nomor Meter' || i.value === 'Nama');
            if (combo) {
                combo.id = 'filter_combo_nomet';
                return combo.id;
            }
            return null;
        });

        if (filterComboId) {
            await infoFrame.click(`#${filterComboId}`, { clickCount: 3 }).catch(() => null);
            await new Promise(r => setTimeout(r, 500));
            await page.keyboard.press('Backspace');
            await page.keyboard.type('Nomor Meter', { delay: 100 });
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 1000));
        }

        // 2. Isi Input Nomor Meter di sebelahnya
        const filterInputId = await infoFrame.evaluate(() => {
            const combo = document.getElementById('filter_combo_nomet');
            if (!combo) return null;
            const inputs = Array.from(document.querySelectorAll('.x-form-text'));
            // Cari input teks yang posisinya di kanan dropdown
            const target = inputs.find(i => i !== combo && 
                Math.abs(i.getBoundingClientRect().top - combo.getBoundingClientRect().top) < 20 && 
                i.getBoundingClientRect().left > combo.getBoundingClientRect().left
            );
            if (target) {
                target.id = 'filter_input_nomet';
                return target.id;
            }
            return null;
        });

        if (!filterInputId) throw new Error("Kolom input Nomor Meter tidak ditemukan.");

        await infoFrame.click(`#${filterInputId}`, { clickCount: 3 }).catch(() => null);
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Backspace');
        await page.keyboard.type(nomet, { delay: 100 });
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 1000));

        // 3. Klik Search
        bot.sendMessage(chatId, `🔎 Mencari data meter...`);
        await infoFrame.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
            const searchBtn = btns.find(b => b.textContent.trim() === 'Search' && b.offsetParent !== null);
            if (searchBtn) searchBtn.click();
        });

        // 4. Tunggu hasil
        await new Promise(r => setTimeout(r, 6000));

        // 5. Ekstrak Hasil dari Grid
        const result = await infoFrame.evaluate(() => {
            // Ambil baris pertama dari grid Main Result
            const row = document.querySelector('.x-grid3-row');
            if (row) {
                const cells = Array.from(row.querySelectorAll('.x-grid3-cell-inner'));
                if (cells.length >= 2) {
                    return {
                        idpel: cells[0].textContent.trim(),
                        nama: cells[1].textContent.trim()
                    };
                }
            }
            return null;
        });

        if (result && result.idpel) {
            bot.sendMessage(chatId, 
                `✅ **Data Ditemukan!**\n\n` +
                `🆔 **ID Pelanggan:** \`${result.idpel}\`\n` +
                `👤 **Nama:** ${result.nama}\n\n` +
                `*(Sentuh/klik ID Pelanggan di atas untuk langsung meng-copy, lalu bisa digunakan untuk /ct)*`, 
                { parse_mode: 'Markdown' }
            );
        } else {
            const ss = await page.screenshot().catch(() => null);
            if (ss) await bot.sendPhoto(chatId, ss, { caption: "Tampilan hasil (Data kosong atau error)" });
            bot.sendMessage(chatId, `⚠️ Data untuk nomor meter ${nomet} tidak ditemukan atau belum muncul.`);
        }

    } catch (e) {
        console.error("Nomet Error:", e);
        bot.sendMessage(chatId, `❌ Terjadi error saat mencari nomet: ${e.message}`);
    }
}

// ===== FUNGSI: Cek & Ambil Token (Monitoring Permohonan Token) =====
async function handleMonitoringToken(idpel, chatId, mode) {
    if (!browser || !page || !isLoggedIn) {
        return bot.sendMessage(chatId, `⚠️ Bot belum login ke AP2T. Silakan /login terlebih dahulu.`);
    }

    try {
        bot.sendMessage(chatId, `🔍 Menuju Monitoring Permohonan Token...`);
        await clickMenu(page, ['PELAYANAN PELANGGAN', 'Monitoring', 'Monitoring Permohonan Token']);
        await new Promise(r => setTimeout(r, 8000));

        // Bersihkan popup jika ada
        for (let i = 0; i < 3; i++) {
            await closePopups(page);
            await new Promise(r => setTimeout(r, 500));
        }

        bot.sendMessage(chatId, `🎯 Mencari form filter Jenis Permohonan...`);
        
        let monitorFrame = null;
        for (const frame of page.frames()) {
            try {
                const found = await frame.evaluate(() => {
                    return !!Array.from(document.querySelectorAll('*')).find(el =>
                        el.innerText && el.innerText.includes('Jenis Permohonan') && el.offsetParent !== null
                    );
                });
                if (found) { monitorFrame = frame; break; }
            } catch (e) {}
        }
        if (!monitorFrame) monitorFrame = page;

        const visualResult = await monitorFrame.evaluate(() => {
            const allElements = Array.from(document.querySelectorAll('*'));
            const label = allElements.find(el =>
                el.innerText && el.innerText.trim().includes('Jenis Permohonan') &&
                el.offsetParent !== null && el.children.length === 0
            );

            if (label) {
                const rect = label.getBoundingClientRect();
                const inputs = Array.from(document.querySelectorAll('input, select')).filter(i => {
                    const iRect = i.getBoundingClientRect();
                    return iRect.left > rect.left && Math.abs(iRect.top - rect.top) < 15 && i.offsetParent !== null;
                });
                inputs.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

                if (inputs.length >= 2) {
                    inputs[0].id = 'token_dropdown_visual';
                    inputs[1].id = 'token_agenda_visual';
                    return 'OK';
                }
                return 'ONLY_FOUND_' + inputs.length;
            }
            return 'LABEL_NOT_FOUND';
        });

        if (visualResult === 'OK') {
            // Pilih Jenis Permohonan berdasarkan panjang input (11 = Nomor Meter, selain itu IDPEL)
            const filterType = idpel.length === 11 ? 'PER NOMOR METER' : 'PER IDPEL';
            const dropdownEl = await monitorFrame.$('#token_dropdown_visual');
            await dropdownEl.click({ clickCount: 3 }).catch(()=>null);
            await new Promise(r => setTimeout(r, 500));
            await page.keyboard.press('Backspace');
            await page.keyboard.type(filterType, { delay: 100 });
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 1500));

            // Isi IDPEL
            const agendaEl = await monitorFrame.$('#token_agenda_visual');
            await agendaEl.click({ clickCount: 3 }).catch(()=>null);
            await new Promise(r => setTimeout(r, 500));
            await page.keyboard.press('Backspace');
            await page.keyboard.type(idpel, { delay: 100 });
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 1000));

            // Klik Filter
            await monitorFrame.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
                const filterBtn = btns.find(b => b.textContent.trim() === 'Filter' && b.offsetParent !== null);
                if (filterBtn) filterBtn.click();
            });

            bot.sendMessage(chatId, `⏳ Mencari data...`);
            await new Promise(r => setTimeout(r, 6000));
        } else {
            bot.sendMessage(chatId, `❌ Gagal deteksi form: ${visualResult}.`);
            return;
        }

        if (mode === 'cek') {
            const ss = await page.screenshot().catch(() => null);
            if (ss) await bot.sendPhoto(chatId, ss, { caption: `📸 Hasil Monitoring Token untuk Input: ${idpel}` });
            bot.sendMessage(chatId, `✅ Pengecekan token selesai.`);
        } else if (mode === 'ambil') {
            // mode ambil token clear tamper
            const tokenResult = await monitorFrame.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('.x-grid3-row'));
                if (rows.length === 0) return 'NO_CLEAR_TAMPER';

                // HANYA cek baris pertama (transaksi terbaru)
                const firstRow = rows[0];
                const cells = Array.from(firstRow.querySelectorAll('td'));
                
                const isClearTamper = cells.some(c => c.textContent.trim().toUpperCase().includes('CLEAR TAMPER'));

                if (isClearTamper) {
                    // Cari token 20 digit di baris tersebut
                    const tokenCell = cells.find(c => {
                        const val = c.textContent.trim().replace(/\s/g, '');
                        return /^\d{20}$/.test(val);
                    });
                    if (tokenCell) return tokenCell.textContent.trim().replace(/\s/g, '');
                    return 'TOKEN_NOT_READY';
                }
                
                return 'NO_CLEAR_TAMPER';
            });

            if (tokenResult === 'NO_CLEAR_TAMPER') {
                bot.sendMessage(chatId, `ℹ️ Status CLEAR TAMPER tidak ada untuk IDPEL ${idpel}.`);
            } else if (tokenResult === 'TOKEN_NOT_READY') {
                bot.sendMessage(chatId, `⚠️ Transaksi CLEAR TAMPER ditemukan, tapi token belum muncul (mungkin belum diproses).`);
                const ss = await page.screenshot().catch(() => null);
                if (ss) await bot.sendPhoto(chatId, ss, { caption: `📸 Screenshot tabel saat ini.` });
            } else if (tokenResult) {
                bot.sendMessage(chatId, `🎉 *TOKEN CLEAR TAMPER DITEMUKAN:*\n\`${tokenResult}\``, { parse_mode: 'Markdown' });
            }
        } else if (mode === 'cetak') {
            bot.sendMessage(chatId, `⏳ Mengambil data transaksi teratas untuk dicetak...`);
            
            // Ambil No Agenda dari baris pertama dan KLIK barisnya
            const topAgenda = await monitorFrame.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('.x-grid3-row'));
                if (rows.length === 0) return null;
                const firstRow = rows[0];
                
                // Klik barisnya agar terpilih di sistem AP2T
                const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
                firstRow.dispatchEvent(evt);
                firstRow.click();
                
                const cells = Array.from(firstRow.querySelectorAll('td'));
                if (cells.length > 0) return cells[0].textContent.trim();
                return null;
            });

            if (!topAgenda) {
                bot.sendMessage(chatId, `⚠️ Data tidak ditemukan untuk input ${idpel}.`);
            } else {
                bot.sendMessage(chatId, `📄 Memilih baris teratas (No Agenda: ${topAgenda}) dan mengklik 'Cetak Token'...`);
                
                // Klik tombol Cetak Token
                await monitorFrame.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, .x-btn-text'));
                    const cetakBtn = btns.find(b => b.textContent.trim().toUpperCase() === 'CETAK TOKEN' && b.offsetParent !== null);
                    if (cetakBtn) cetakBtn.click();
                });
                
                bot.sendMessage(chatId, `⚙️ Menunggu popup laporan dari server...`);
                
                // Cari tab popup baru yang mengandung 'ReportServlet'
                let popupPage = null;
                for (let i = 0; i < 20; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    const pages = await browser.pages();
                    popupPage = pages.find(p => p.url().includes('ReportServlet'));
                    if (popupPage) break;
                }

                if (!popupPage) {
                    bot.sendMessage(chatId, `❌ Timeout menunggu jendela laporan terbuka. Laporan belum siap.`);
                    return;
                }

                bot.sendMessage(chatId, `📄 Laporan terdeteksi. Mengubah format RPT ke PDF dan mengambil gambar (SS)...`);
                
                try {
                    const rptUrl = popupPage.url();
                    const pdfUrl = rptUrl.replace('.rpt', '.pdf'); // Ubah ekstensi
                    
                    // Kita gunakan popupPage yang sudah ada (origin: ap2t.pln.co.id) agar tidak kena block CORS
                    // Timpa isi halaman popup dengan PDF.js viewer buatan kita sendiri
                    await popupPage.evaluate(`
                        document.open();
                        document.write(\`
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"></script>
                                <script>
                                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
                                </script>
                                <style>
                                    body { margin: 0; padding: 0; background: #333; display: flex; justify-content: center; }
                                    canvas { background: white; margin-top: 10px; box-shadow: 0px 0px 10px rgba(0,0,0,0.5); }
                                </style>
                            </head>
                            <body>
                                <canvas id="the-canvas"></canvas>
                            </body>
                            </html>
                        \`);
                        document.close();
                    `);
                    
                    // Tunggu pdfjsLib ter-load
                    await new Promise(r => setTimeout(r, 2000));

                    // Fungsi render PDF
                    await popupPage.evaluate(async (url) => {
                        window.pdfError = null;
                        window.pdfRendered = false;
                        try {
                            // Karena kita berada di domain ap2t, getDocument otomatis membawa cookie sesi
                            const loadingTask = pdfjsLib.getDocument(url);
                            const pdf = await loadingTask.promise;
                            const page = await pdf.getPage(1);
                            
                            // Skala besar agar hasil gambar HD
                            const scale = 2.0; 
                            const viewport = page.getViewport({scale: scale});
                            
                            const canvas = document.getElementById('the-canvas');
                            const context = canvas.getContext('2d');
                            canvas.height = viewport.height;
                            canvas.width = viewport.width;
                            
                            const renderContext = { canvasContext: context, viewport: viewport };
                            await page.render(renderContext).promise;
                            
                            window.pdfRendered = true;
                        } catch(e) {
                            window.pdfError = e.message;
                        }
                    }, pdfUrl);
                    
                    // Tunggu proses render selesai (max 20 detik)
                    await popupPage.waitForFunction('window.pdfRendered === true || window.pdfError', { timeout: 20000 });
                    
                    const hasError = await popupPage.evaluate(() => window.pdfError);
                    if (hasError) throw new Error("PDFjs Error: " + hasError);

                    // Ambil elemen canvas untuk bounding box
                    const canvasHandle = await popupPage.$('#the-canvas');
                    const boundingBox = await canvasHandle.boundingBox();
                    
                    // Set viewport yang cukup besar agar screenshot tidak terpotong window chrome
                    await popupPage.setViewport({ width: Math.max(1000, Math.ceil(boundingBox.width) + 100), height: 1200 });
                    
                    // Screenshot khusus area canvas. Ambil bagian atas (55%)
                    const ss = await popupPage.screenshot({
                        clip: {
                            x: boundingBox.x,
                            y: boundingBox.y,
                            width: boundingBox.width,
                            height: boundingBox.height * 0.55 // Potong persis seperti lampiran user
                        }
                    });
                    
                    if (ss) {
                        await bot.sendPhoto(chatId, ss, { caption: `✅ Cetak Token Berhasil\nNo Agenda: \`${topAgenda}\``, parse_mode: 'Markdown' });
                    } else {
                        throw new Error("Screenshot blank.");
                    }

                } catch(e) {
                    bot.sendMessage(chatId, `❌ Gagal mengambil gambar laporan: ${e.message}`);
                } finally {
                    // Tutup popup setelah selesai
                    if (popupPage && !popupPage.isClosed()) {
                        await popupPage.close().catch(()=>{});
                    }
                }

            }
        }
        
        // Tutup tab Monitoring untuk merapikan
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('.x-tab-strip-closable'));
            tabs.forEach(t => {
                if (t.textContent.includes('Monitoring Permohonan Token')) {
                    const close = t.querySelector('.x-tab-strip-close');
                    if (close) close.click();
                }
            });
        });

    } catch (e) {
        console.error("Monitoring Error:", e);
        bot.sendMessage(chatId, `❌ Terjadi error saat monitoring: ${e.message}`);
    }
}

// ===== COMMANDS =====

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `🤖 *Bot Otomasi AP2T PLN*\n\n` +
        `Gunakan format perintah berikut:\n` +
        `/login - Login awal\n` +
        `/ct <idpel> <no_gangguan> - Proses CT Otomatis\n` +
        `/nomet <no_meter> - Cari IDPEL via No Meter\n` +
        `/cek_token <idpel> - Screenshot tabel token\n` +
        `/ambil_token <idpel> - Ambil 20 digit token CT\n` +
        `/cetak_token <idpel> - Cetak PDF Token teratas\n` +
        `/status - Cek layar browser\n` +
        `/pause - Tahan proses sementara\n` +
        `/resume - Lanjut jalankan proses\n` +
        `/simpan\\_akun - Simpan profil akun baru\n` +
        `/pakai\\_akun - Gunakan profil akun tersimpan\n` +
        `/daftar\\_akun - Lihat profil tersimpan\n` +
        `/set\\_ap2t <user> <pass> - Ganti Akun AP2T (Bisa manual)\n` +
        `/set\\_webmail <user> <pass> - Ganti Akun Webmail (Bisa manual)\n` +
        `/reset\\_akun - Jika bot macet\n` +
        `/stop\\_bot - Matikan sistem bot di PC\n` +
        `/logout - Keluar dan tutup browser`,
        { parse_mode: 'Markdown' }
    );
});


bot.onText(/^\/start$/, (msg) => {
    const chatId = msg.chat.id.toString();
    const isSuperAdmin = (chatId === SUPER_ADMIN_ID);
    const name = isSuperAdmin ? "Super Admin" : (authorizedUsers[chatId] || "User");
    
    let txt = `🤖 **Sistem Otomasi AP2T Aktif**\n\nSelamat Datang, **${name}**!\n`;
    if (isSuperAdmin) {
        txt += `\nAnda memiliki wewenang Super Admin. Ketik /cek_akses untuk melihat daftar pegawai.\n`;
    } else {
        txt += `\nSistem siap digunakan.\n`;
    }
    txt += `\nKetik /login untuk memulai proses.\nUntuk melihat menu lengkap, tekan tombol Menu di kiri bawah.`;
    
    bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
});


bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    if (page && !page.isClosed()) {
        const ss = await page.screenshot().catch(() => null);
        if (ss) bot.sendPhoto(chatId, ss, { caption: `Status saat ini. Akun: ${getAccount(chatId)}` });
    } else {
        bot.sendMessage(chatId, `ℹ️ Browser tidak aktif.`);
    }
});

bot.onText(/\/login/, async (msg) => {
    const chatId = msg.chat.id;
    if (checkAndSetBusy(chatId)) return;
    try { await startSmartLogin(chatId); }
    finally { releaseBusy(); }
});

bot.onText(/\/reset_akun/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🔄 Mereset semua koneksi...`);
    killChromeAndClean();
    browser = null; page = null; isLoggedIn = false;
    releaseBusy();
    bot.sendMessage(chatId, `✅ Selesai. Silakan /login kembali.`);
});

bot.onText(/\/ct (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `📥 Perintah CT diterima. Sedang memproses...`);
    
    const parts = match[1].trim().split(/\s+/);
    if (parts.length < 2) {
        return bot.sendMessage(chatId, `⚠️ Format salah. Gunakan: \`/ct <idpel> <no_gangguan>\``, { parse_mode: 'Markdown' });
    }
    const [idpel, nogan] = parts;
    
    if (isLoggingIn) return bot.sendMessage(chatId, `⏳ Bot sedang sibuk login. Mohon tunggu sebentar lalu ulangi.`);
    
    ctQueue.push({ idpel, nogan, chatId });
    
    if (isProcessingCT) {
        bot.sendMessage(chatId, `⏳ Anda masuk dalam antrean (Posisi: ${ctQueue.length}). Bot sedang memproses permintaan sebelumnya...`);
    } else {
        processQueue();
    }
});

bot.onText(/\/nomet (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const nomet = match[1].trim();
    if (!nomet) {
        return bot.sendMessage(chatId, `⚠️ Format salah. Gunakan: \`/nomet <no_meter>\``, { parse_mode: 'Markdown' });
    }
    if (checkAndSetBusy(chatId)) return;
    try {
        await processCariNomet(nomet, chatId);
    } finally {
        releaseBusy();
    }
});

bot.onText(/\/cek_token (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const idpel = match[1].trim();
    if (!idpel) {
        return bot.sendMessage(chatId, `⚠️ Format salah. Gunakan: \`/cek_token <idpel>\``, { parse_mode: 'Markdown' });
    }
    if (checkAndSetBusy(chatId)) return;
    try {
        await handleMonitoringToken(idpel, chatId, 'cek');
    } finally {
        releaseBusy();
    }
});

bot.onText(/\/ambil_token (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const idpel = match[1].trim();
    if (!idpel) {
        return bot.sendMessage(chatId, `⚠️ Format salah. Gunakan: \`/ambil_token <idpel>\``, { parse_mode: 'Markdown' });
    }
    if (checkAndSetBusy(chatId)) return;
    try {
        await handleMonitoringToken(idpel, chatId, 'ambil');
    } finally {
        releaseBusy();
    }
});

bot.onText(/\/cetak_token (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const idpel = match[1].trim();
    if (!idpel) {
        return bot.sendMessage(chatId, `⚠️ Format salah. Gunakan: \`/cetak_token <idpel>\``, { parse_mode: 'Markdown' });
    }
    if (checkAndSetBusy(chatId)) return;
    try {
        await handleMonitoringToken(idpel, chatId, 'cetak');
    } finally {
        releaseBusy();
    }
});

bot.onText(/\/logout/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🚪 Menutup sesi dan Logout...`);
    killChromeAndClean();
    browser = null; page = null; isLoggedIn = false;
    bot.sendMessage(chatId, `✅ Selesai. Browser telah ditutup.`);
});

bot.onText(/\/pause/, (msg) => {
    isPaused = true;
    bot.sendMessage(msg.chat.id, `⏸️ **Bot Di-Pause!**\nBot akan berhenti sejenak sebelum menekan tombol *Save*. \nAnda punya waktu tak terbatas untuk mengecek langsung layar komputer Anda.\n\nKetik /resume jika Anda sudah selesai mengecek dan ingin bot melanjutkan pekerjaannya.`, { parse_mode: 'Markdown' });
});

bot.onText(/\/resume/, (msg) => {
    if (isPaused) {
        isPaused = false;
        bot.sendMessage(msg.chat.id, `▶️ **Bot Dilanjutkan!**\nMelanjutkan proses yang tertunda...`);
    } else {
        bot.sendMessage(msg.chat.id, `Bot saat ini sedang tidak di-pause.`);
    }
});

// === Fungsi Bantuan untuk Update ENV ===
const updateEnv = (key, value) => {
    const envPath = require('path').join(process.cwd(), '.env');
    let envContent = '';
    if (require('fs').existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }
    if (envContent.includes(`${key}=`)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
        envContent += `\n${key}=${value}`;
    }
    require('fs').writeFileSync(envPath, envContent.trim() + '\n');
};

bot.onText(/\/set_ap2t (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const parts = match[1].trim().split(/\s+/);
    
    if (parts.length < 2) {
        return bot.sendMessage(chatId, `⚠️ **Format salah!**\nGunakan format:\n\`/set_ap2t <user_ap2t> <pass_ap2t>\`\n\n*Contoh:*\n\`/set_ap2t 9514012B4Y Rahasia123\``, { parse_mode: 'Markdown' });
    }
    
    const [ap2tUser, ap2tPass] = parts;
    
    
    
    updateEnv('MAIN_USERNAME', ap2tUser);
    updateEnv('MAIN_PASSWORD', ap2tPass);
    
    let extraMsg = '';
    const cAcc = getAccount(chatId);
    if (cAcc !== "none" && cAcc !== "main") {
        const profiles = loadProfiles();
        if (profiles[cAcc]) {
            profiles[cAcc].ap2t_user = ap2tUser;
            profiles[cAcc].ap2t_pass = ap2tPass;
            saveProfiles(profiles);
            extraMsg = `\n*(Profil '${cAcc}' juga ikut diperbarui)*`;
        }
    }
    
    bot.sendMessage(chatId, `✅ **Akun AP2T Berhasil Diperbarui!**\nUser: \`${ap2tUser}\`\nPass: *(diperbarui)*${extraMsg}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/set_webmail (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const parts = match[1].trim().split(/\s+/);
    
    if (parts.length < 2) {
        return bot.sendMessage(chatId, `⚠️ **Format salah!**\nGunakan format:\n\`/set_webmail <user_webmail> <pass_webmail>\`\n\n*Contoh:*\n\`/set_webmail pusat\\\\sandy\\_hanif RahasiaWeb\``, { parse_mode: 'Markdown' });
    }
    
    const [webmailUser, webmailPass] = parts;
    getCredentials(accountType).web_user = webmailUser;
    getCredentials(accountType).web_pass = webmailPass;
    
    updateEnv('WEBMAIL_USERNAME', webmailUser);
    updateEnv('WEBMAIL_PASSWORD', webmailPass);
    
    let extraMsg = '';
    const cAcc = getAccount(chatId);
    if (cAcc !== "none" && cAcc !== "main") {
        const profiles = loadProfiles();
        if (profiles[cAcc]) {
            profiles[cAcc].web_user = webmailUser;
            profiles[cAcc].web_pass = webmailPass;
            saveProfiles(profiles);
            extraMsg = `\n*(Profil '${cAcc}' juga ikut diperbarui)*`;
        }
    }
    
    bot.sendMessage(chatId, `✅ **Akun Webmail Berhasil Diperbarui!**\nUser: \`${webmailUser}\`\nPass: *(diperbarui)*${extraMsg}`, { parse_mode: 'Markdown' });
});

// === Fitur Multi-Akun (Profil) ===
const profilesPath = require('path').join(process.cwd(), 'profiles.json');
function loadProfiles() {
    if (!require('fs').existsSync(profilesPath)) return {};
    try { return JSON.parse(fs.readFileSync(profilesPath, 'utf8')); } catch(e) { return {}; }
}
function saveProfiles(data) {
    require('fs').writeFileSync(profilesPath, JSON.stringify(data, null, 2));
}

bot.onText(/\/simpan_akun (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const parts = match[1].trim().split(/\s+/);
    if (parts.length < 5) {
        return bot.sendMessage(chatId, `⚠️ **Format salah!**\n\nGunakan format:\n\`/simpan_akun <nama_profil> <user_ap2t> <pass_ap2t> <user_webmail> <pass_webmail>\`\n\n*Contoh:*\n\`/simpan_akun shift\\_pagi 9514... pass123 pusat\\\\sandy passweb\``, { parse_mode: 'Markdown' });
    }
    const [nama, uA, pA, uW, pW] = parts;
    const profiles = loadProfiles();
    profiles[nama.toLowerCase()] = { ap2t_user: uA, ap2t_pass: pA, web_user: uW, web_pass: pW };
    saveProfiles(profiles);
    bot.sendMessage(chatId, `✅ **Profil \`${nama}\` berhasil disimpan!**\nAP2T dan Webmail untuk akun ini sudah saling terhubung. Gunakan \`/pakai_akun ${nama.replace(/_/g, '\\_')}\` untuk menggunakannya.`, { parse_mode: 'Markdown' });
});

bot.onText(/\/daftar_akun/, (msg) => {
    const chatId = msg.chat.id;
    const profiles = loadProfiles();
    const keys = Object.keys(profiles);
    if (keys.length === 0) return bot.sendMessage(chatId, `ℹ️ Belum ada profil akun yang tersimpan.`);
    let text = `📋 **Daftar Profil Akun:**\n\n`;
    keys.forEach(k => {
        text += `- \`${k}\` (AP2T: \`${profiles[k].ap2t_user}\`)\n`;
    });
    text += `\nGunakan \`/pakai_akun <nama_profil>\` untuk beralih akun.`;
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/pakai_akun (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const nama = match[1].trim().toLowerCase();
    const profiles = loadProfiles();
    
    if (!profiles[nama]) {
        return bot.sendMessage(chatId, `⚠️ **Profil \`${nama}\` tidak ditemukan!**\nKetik /daftar_akun untuk melihat profil yang tersedia.`, { parse_mode: 'Markdown' });
    }
    
    const p = profiles[nama];
    
    // Update memori
    
    
    getCredentials(accountType).web_user = p.web_user;
    getCredentials(accountType).web_pass = p.web_pass;
    userAccounts[chatId] = nama;
    
    // Update .env
    updateEnv('MAIN_USERNAME', p.ap2t_user);
    updateEnv('MAIN_PASSWORD', p.ap2t_pass);
    updateEnv('WEBMAIL_USERNAME', p.web_user);
    updateEnv('WEBMAIL_PASSWORD', p.web_pass);
    
    bot.sendMessage(chatId, `🔄 **Beralih ke profil \`${nama}\`...**\n\n✅ Berhasil! Sekarang bot menggunakan akun:\nAP2T: \`${p.ap2t_user}\`\nWebmail: \`${p.web_user}\`\n\n*Jika bot sedang login di browser, mohon jalankan /logout lalu /login agar sistem menggunakan akun yang baru ini.*`, { parse_mode: 'Markdown' });
});

// Daftarkan Menu Perintah Telegram agar muncul otomatis (Tombol Menu)

// ===== STAGE 3: AUTOSTART & AUTO-UPDATER =====
bot.onText(/^\/autostart_on$/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== SUPER_ADMIN_ID) return bot.sendMessage(chatId, `⛔ Ditolak! Anda bukan Super Admin.`);
    try {
        const exePath = process.execPath;
        const vbsPath = require('path').join(process.cwd(), 'set_autostart.vbs');
        const vbsCode = `
Set WshShell = CreateObject("WScript.Shell")
startupFolder = WshShell.SpecialFolders("Startup")
Set shortcut = WshShell.CreateShortcut(startupFolder & "\\Bot_AP2T.lnk")
shortcut.TargetPath = "${exePath}"
shortcut.WorkingDirectory = "${process.cwd()}"
shortcut.Save
        `;
        require('fs').writeFileSync(vbsPath, vbsCode);
        require('child_process').execSync(`cscript //nologo "${vbsPath}"`);
        require('fs').unlinkSync(vbsPath);
        bot.sendMessage(chatId, `✅ **Auto-Start Diaktifkan!**\nBot akan otomatis menyala tanpa terlihat setiap kali komputer ini dihidupkan.`, { parse_mode: 'Markdown' });
    } catch(err) {
        bot.sendMessage(chatId, `❌ Gagal mengaktifkan auto-start: ${err.message}`);
    }
});

bot.onText(/^\/autostart_off$/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== SUPER_ADMIN_ID) return bot.sendMessage(chatId, `⛔ Ditolak! Anda bukan Super Admin.`);
    try {
        const startupPath = require('path').join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Bot_AP2T.lnk');
        if (require('fs').existsSync(startupPath)) {
            require('fs').unlinkSync(startupPath);
            bot.sendMessage(chatId, `✅ **Auto-Start Dimatikan!**\nBot tidak akan menyala otomatis lagi.`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `ℹ️ Auto-start memang sedang tidak aktif.`);
        }
    } catch(err) {
        bot.sendMessage(chatId, `❌ Gagal mematikan auto-start: ${err.message}`);
    }
});

bot.onText(/^\/update_bot$/, async (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== SUPER_ADMIN_ID) return bot.sendMessage(chatId, `⛔ Ditolak! Anda bukan Super Admin.`);
    
    bot.sendMessage(chatId, `🔄 **Mengecek versi terbaru di GitHub...**\nMohon tunggu sekitar 10-30 detik...\nPastikan Anda sudah menaruh GITHUB_REPO di file .env`, { parse_mode: 'Markdown' });
    try {
        const githubRepo = process.env.GITHUB_REPO;
        if (!githubRepo) {
            return bot.sendMessage(chatId, `❌ Variabel GITHUB_REPO belum disetting di .env!\n\nSilakan buka file .env dan tambahkan:\n\`GITHUB_REPO=username/nama-repo\`\n(Dan \`GITHUB_TOKEN=...\` jika repo di-private).`, { parse_mode: 'Markdown' });
        }
        
        const headers = {};
        if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
        
        const apiRes = await axios.get(`https://api.github.com/repos/${githubRepo}/releases/latest`, { headers });
        const assets = apiRes.data.assets;
        const exeAsset = assets.find(a => a.name.endsWith('.exe'));
        
        if (!exeAsset) return bot.sendMessage(chatId, `❌ Tidak ditemukan file .exe pada rilis terbaru di GitHub!`);
        
        bot.sendMessage(chatId, `📥 **Mendownload pembaruan...**\nVersi: ${apiRes.data.tag_name}\nUkuran: ${(exeAsset.size / 1024 / 1024).toFixed(2)} MB`, { parse_mode: 'Markdown' });
        
        const downloadRes = await axios.get(exeAsset.url, { headers: { ...headers, Accept: 'application/octet-stream' }, responseType: 'stream' });
        const newExePath = require('path').join(process.cwd(), 'update_temp.exe');
        const writer = fs.createWriteStream(newExePath);
        downloadRes.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        const currentExe = process.execPath;
        const batPath = require('path').join(process.cwd(), 'update.bat');
        // Get the filename of currentExe
        const exeName = require('path').basename(currentExe);
        const batContent = `
@echo off
timeout /t 3 /nobreak > NUL
del "${currentExe}"
ren "update_temp.exe" "${exeName}"
start "" "${exeName}"
del "%~f0"
`;
        require('fs').writeFileSync(batPath, batContent);
        
        bot.sendMessage(chatId, `✅ **Download Selesai!**\nSistem akan merestart otomatis dalam 3 detik untuk menerapkan pembaruan...`, { parse_mode: 'Markdown' });
        
        const { spawn } = require('child_process');
        const p = spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore' });
        p.unref();
        
        setTimeout(() => process.exit(0), 500);
    } catch(err) {
        let msgErr = err.message;
        if (err.response) msgErr += ` (${err.response.status})`;
        bot.sendMessage(chatId, `❌ Gagal melakukan update:\n${msgErr}`);
    }
});

// end injection

// 1. MENU UNTUK PEGAWAI BIASA
bot.setMyCommands([
    { command: 'start', description: 'Mulai Bot' },
    { command: 'get_token', description: 'Buka Webmail & Ambil Token' },
    { command: 'cek_idpel', description: 'Cek Status IDPEL' },
    { command: 'ct', description: 'Proses CT Normal' },
    { command: 'resume', description: 'Lanjutkan proses tertahan' },
    { command: 'set_ap2t', description: 'Ganti User & Pass AP2T' },
    { command: 'set_webmail', description: 'Ganti User & Pass Webmail' },
    { command: 'pakai_akun', description: 'Beralih Profil Akun' },
    { command: 'daftar_akun', description: 'Lihat Semua Profil' },
    { command: 'logout', description: 'Logout & Tutup Browser' },
    { command: 'reset_akun', description: 'Reset Jika Bot Macet' },
    { command: 'stop_bot', description: 'Matikan Bot Total dari PC' } // Sesuai permintaan: tetap ada
]).then(() => {
    console.log('✅ Menu Pegawai berhasil didaftarkan.');
});

// 2. MENU KHUSUS SUPER ADMIN (Disuntikkan hanya ke ID Super Admin)
bot.setMyCommands([
    { command: 'start', description: 'Mulai Bot' },
    { command: 'get_token', description: 'Buka Webmail & Ambil Token' },
    { command: 'cek_idpel', description: 'Cek Status IDPEL' },
    { command: 'ct', description: 'Proses CT Normal' },
    { command: 'resume', description: 'Lanjutkan proses tertahan' },
    { command: 'set_ap2t', description: 'Ganti User & Pass AP2T' },
    { command: 'set_webmail', description: 'Ganti User & Pass Webmail' },
    { command: 'pakai_akun', description: 'Beralih Profil Akun' },
    { command: 'daftar_akun', description: 'Lihat Semua Profil' },
    { command: 'logout', description: 'Logout & Tutup Browser' },
    { command: 'reset_akun', description: 'Reset Jika Bot Macet' },
    { command: 'stop_bot', description: 'Matikan Bot Total dari PC' },
    // --- KHUSUS ADMIN ---
    { command: 'autostart_on', description: 'Bot nyala otomatis saat PC hidup' },
    { command: 'autostart_off', description: 'Matikan autostart' },
    { command: 'update_bot', description: 'Download Update dari GitHub' },
    { command: 'tambah_akses', description: 'Tambah Pegawai Baru' },
    { command: 'hapus_akses', description: 'Cabut akses Pegawai' },
    { command: 'cek_akses', description: 'Daftar Pegawai Terdaftar' }
], { scope: { type: 'chat', chat_id: process.env.OWNER_CHAT_ID } }).then(() => {
    console.log('✅ Menu Super Admin berhasil disuntikkan secara eksklusif.');
}).catch(err => {
    console.log('Gagal menyuntikkan menu Admin, mungkin OWNER_CHAT_ID salah.');
});


console.log('🤖 Bot AP2T berjalan. Kirim /start di Telegram.');
