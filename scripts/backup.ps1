[CmdletBinding()]
param([string]$Destination = '')
. (Join-Path $PSScriptRoot 'common.ps1')
$settings = Get-LocalSettings
if (-not (Assert-OwnDatabase $settings)) { throw 'Owned database must be running for backup.' }
if (@(Get-PortListener 3250).Count) { throw 'Stop the foreground webapp docchat session first so database and uploaded files remain consistent.' }
if (-not $Destination) { $Destination = Join-Path $StorageRoot ('backups\' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')) }
if (Test-Path -LiteralPath $Destination) { throw 'Backup destination already exists. Select a new directory; backups are never overwritten.' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $Destination /inheritance:r /grant:r "${identity}:(OI)(CI)(F)" 'SYSTEM:(OI)(CI)(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect backup directory.' }
$sql = Join-Path $Destination 'database.sql'
& (Join-Path $settings.mysqlBin 'mysqldump.exe') ('--defaults-extra-file=' + (Join-Path $StorageRoot 'mysql-admin.cnf')) --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF ('--result-file=' + $sql) docchat
if ($LASTEXITCODE -ne 0 -or (Get-Item $sql).Length -eq 0) { throw 'Database dump failed; backup is incomplete.' }
& $settings.php (Join-Path $ProjectRoot 'scripts\backup-files.php') $Destination
if ($LASTEXITCODE -ne 0) { throw 'Document copy failed; backup is incomplete.' }
Copy-Item -LiteralPath (Join-Path $ProjectRoot '.env') -Destination (Join-Path $Destination '.env')
& $settings.php (Join-Path $ProjectRoot 'scripts\database-inventory.php') | Set-Content -LiteralPath (Join-Path $Destination 'database-check.json') -Encoding UTF8
if ($LASTEXITCODE -ne 0) { throw 'Backup database validation failed.' }
$manifest = @(Get-ChildItem -LiteralPath $Destination -File -Recurse | ForEach-Object { @{path=$_.FullName.Substring($Destination.Length).TrimStart('\'); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash; bytes=$_.Length} })
[IO.File]::WriteAllText((Join-Path $Destination 'manifest.json'), ($manifest | ConvertTo-Json -Depth 4), $Utf8)
Write-Output "Backup created: $Destination. Store an encrypted off-device copy; perform the README restore drill before relying on recovery."
