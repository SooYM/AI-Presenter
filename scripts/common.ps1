$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$HarnessRoot = Join-Path $env:USERPROFILE '.codex\harness'
$StorageRoot = Join-Path $ProjectRoot 'storage'
$Utf8 = New-Object Text.UTF8Encoding($false)
function Write-PrivateFile([string]$Path, [string]$Content) {
    [IO.File]::WriteAllText($Path, $Content, $Utf8)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $Path /inheritance:r /grant:r "${identity}:(F)" 'SYSTEM:(F)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not restrict permissions on $Path." }
}
function Write-Lifecycle([string]$Event, [string]$Service, [int]$Port, [string]$Detail) {
    & (Join-Path $HarnessRoot 'Write-PortEvent.ps1') -Event $Event -Owner docchat -Service $Service -Port $Port -ProjectPath $ProjectRoot -Detail $Detail
}
function Assert-Reservation([int]$Port, [string]$Service) {
    $registry = Get-Content (Join-Path $HarnessRoot 'ports.json') -Raw | ConvertFrom-Json
    $matches = @($registry.reservations | Where-Object { $_.port -eq $Port -and $_.status -eq 'reserved' })
    if ($matches.Count -ne 1 -or $matches[0].owner -ne 'docchat' -or $matches[0].service -ne $Service -or $matches[0].projectPath.TrimEnd('\') -ne $ProjectRoot.TrimEnd('\')) {
        throw "Port $Port must be registered to docchat/$Service at $ProjectRoot before startup."
    }
}
function Get-PortListener([int]$Port) { @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq $Port) }
function Assert-FreePort([int]$Port) {
    $listeners = @(Get-PortListener $Port)
    if ($listeners.Count) { throw "Port $Port already listens under PID $($listeners[0].OwningProcess). No process was stopped." }
}
function Get-LocalSettings {
    $path = Join-Path $StorageRoot 'local-settings.json'
    if (-not (Test-Path -LiteralPath $path)) { throw 'Local setup is missing. Run scripts/setup-local.ps1 explicitly first.' }
    Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}
function Assert-OwnDatabase($Settings) {
    $listeners = @(Get-PortListener 3251)
    if (-not $listeners.Count) { return $false }
    $ownerId = $listeners[0].OwningProcess
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
    $expectedConfig = Join-Path $StorageRoot 'mysql.ini'
    if (-not $process -or $process.ExecutablePath -ne (Join-Path $Settings.mysqlBin 'mysqld.exe') -or -not $process.CommandLine.Contains($expectedConfig)) {
        throw "Port 3251 belongs to an unverified process (PID $ownerId). No process was stopped."
    }
    return $true
}
function Start-OwnDatabase($Settings) {
    Assert-Reservation 3251 mysql
    if (Assert-OwnDatabase $Settings) { return }
    $config = Join-Path $StorageRoot 'mysql.ini'
    $data = Join-Path $StorageRoot 'mysql'
    if (-not (Test-Path (Join-Path $data 'auto.cnf'))) { throw 'Owned MySQL instance is not initialized. Startup never initializes data.' }
    Write-Lifecycle 'starting' mysql 3251 'Starting verified project-owned MySQL instance.'
    $dbProcess = Start-Process -FilePath (Join-Path $Settings.mysqlBin 'mysqld.exe') -ArgumentList ('--defaults-file="' + $config + '"') -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $dbProcess.Refresh()
        if ($dbProcess.HasExited) { throw 'MySQL exited. Inspect storage/mysql-error.log.' }
        try {
            & (Join-Path $Settings.mysqlBin 'mysqladmin.exe') ('--defaults-extra-file=' + (Join-Path $StorageRoot 'mysql-admin.cnf')) ping --silent 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0 -and (Assert-OwnDatabase $Settings)) {
                Write-Lifecycle 'ready' mysql 3251 "Verified MySQL process $($dbProcess.Id) responds to authenticated ping."
                return
            }
        } catch { }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'MySQL did not become ready within 45 seconds; inspect its log. No fallback port selected.'
}
