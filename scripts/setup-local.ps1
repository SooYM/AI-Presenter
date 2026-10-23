[CmdletBinding()]
param(
    [string]$Php = 'C:\xampp\php\php.exe',
    [string]$MysqlBin = 'C:\Users\QIU\Desktop\Permanent\Progress Tracker\.runtime\mysql\mysql-8.4.11-winx64\bin'
)
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Reservation 3250 web
Assert-Reservation 3251 mysql
Assert-FreePort 3251
if (Test-Path (Join-Path $ProjectRoot '.env')) { throw 'Existing .env found. Setup never overwrites configuration or resets data.' }
$dataPath = Join-Path $StorageRoot 'mysql'
if (Test-Path $dataPath) { throw 'Existing MySQL directory found. Review it manually; setup never resets data.' }
foreach ($binary in @($Php, (Join-Path $MysqlBin 'mysqld.exe'), (Join-Path $MysqlBin 'mysql.exe'))) {
    if (-not (Test-Path $binary)) { throw "Required runtime missing: $binary" }
}
$version = & (Join-Path $MysqlBin 'mysqld.exe') --version
if ($version -notmatch 'Ver 8\.4\.') { throw 'Local setup is tested with MySQL 8.4 only. Provide a compatible runtime explicitly.' }
New-Item -ItemType Directory -Force $StorageRoot, $dataPath | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $StorageRoot /inheritance:r /grant:r "${identity}:(OI)(CI)(F)" 'SYSTEM:(OI)(CI)(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict storage permissions.' }
function New-Secret {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    return [Convert]::ToBase64String($bytes)
}
$rootPassword = New-Secret
$appPassword = New-Secret
$applicationSecret = New-Secret
$mysqlBase = (Split-Path $MysqlBin -Parent).Replace('\','/')
$storageUnix = $StorageRoot.Replace('\','/')
$config = @"
[mysqld]
basedir="$mysqlBase"
datadir="$storageUnix/mysql"
bind-address=127.0.0.1
port=3251
mysqlx=OFF
pid-file="$storageUnix/mysql.pid"
log-error="$storageUnix/mysql-error.log"
character-set-server=utf8mb4
collation-server=utf8mb4_0900_ai_ci
default-storage-engine=InnoDB
local-infile=OFF
"@
Write-PrivateFile (Join-Path $StorageRoot 'mysql.ini') $config
$settings = @{ php=$Php; mysqlBin=$MysqlBin; webPort=3250; mysqlPort=3251 } | ConvertTo-Json
Write-PrivateFile (Join-Path $StorageRoot 'local-settings.json') $settings
Write-PrivateFile (Join-Path $StorageRoot 'mysql-admin.cnf') @"
[client]
host=127.0.0.1
port=3251
user=root
password="$rootPassword"
protocol=TCP
"@
$initSql = Join-Path $StorageRoot 'initialize.sql'
Write-PrivateFile $initSql @"
ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPassword';
CREATE DATABASE docchat CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'docchat'@'127.0.0.1' IDENTIFIED BY '$appPassword';
GRANT SELECT, INSERT, UPDATE, DELETE ON docchat.* TO 'docchat'@'127.0.0.1';
"@
Write-Lifecycle 'initialize-requested' mysql 3251 'Explicit setup of new project-owned data directory; no existing instance data used.'
& (Join-Path $MysqlBin 'mysqld.exe') ('--defaults-file=' + (Join-Path $StorageRoot 'mysql.ini')) --initialize-insecure
if ($LASTEXITCODE -ne 0) { throw 'MySQL initialization failed. Inspect storage/mysql-error.log; no reset attempted.' }
$dbProcess = Start-Process -FilePath (Join-Path $MysqlBin 'mysqld.exe') -ArgumentList @(('--defaults-file="' + (Join-Path $StorageRoot 'mysql.ini') + '"'), ('--init-file="' + $initSql + '"')) -WindowStyle Hidden -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds(45)
$settingsObject = $settings | ConvertFrom-Json
$ready = $false
do {
    $dbProcess.Refresh()
    if ($dbProcess.HasExited) { throw 'MySQL setup process exited. Inspect storage/mysql-error.log.' }
    try {
        $ping = & (Join-Path $MysqlBin 'mysqladmin.exe') ('--defaults-extra-file=' + (Join-Path $StorageRoot 'mysql-admin.cnf')) ping --silent 2>$null
        if ($LASTEXITCODE -eq 0 -and (Assert-OwnDatabase $settingsObject)) { $ready = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 200
} while ([DateTime]::UtcNow -lt $deadline)
if (-not $ready) { throw 'Authenticated MySQL readiness timed out. No fallback or reset attempted.' }
Remove-Item -LiteralPath $initSql
$schema = Get-Content (Join-Path $ProjectRoot 'database\schema.sql') -Raw
$schema | & (Join-Path $MysqlBin 'mysql.exe') ('--defaults-extra-file=' + (Join-Path $StorageRoot 'mysql-admin.cnf')) docchat
if ($LASTEXITCODE -ne 0) { throw 'Schema import failed. Existing data preserved.' }
Write-PrivateFile (Join-Path $ProjectRoot '.env') @"
APP_ENV=local
APP_URL=http://127.0.0.1:3250
APP_SECRET='$applicationSecret'
DB_HOST=127.0.0.1
DB_PORT=3251
DB_NAME=docchat
DB_USER=docchat
DB_PASSWORD='$appPassword'
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TRANSCRIBE_MODEL=gpt-transcribe
RAG_SCORE_THRESHOLD=0.35
"@
& (Join-Path $PSScriptRoot 'export-local-ca.ps1')
Write-Lifecycle 'initialized' mysql 3251 'MySQL schema and least-privilege app account configured. Credentials saved privately, not logged.'
Write-Output 'Local database configured. AI Presenter opens directly without visitor login.'
Write-Output 'Set OpenAI key with scripts/set-openai-key.ps1, build with npm run build, then start with webapp docchat.'
