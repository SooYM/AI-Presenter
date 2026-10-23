[CmdletBinding()]
param([switch]$Check)
. (Join-Path $PSScriptRoot 'scripts\common.ps1')
Assert-Reservation 3250 web
Assert-Reservation 3251 mysql
$settings = Get-LocalSettings
if (-not (Test-Path (Join-Path $ProjectRoot '.env'))) { throw 'Missing .env. Run explicit setup first.' }
if (-not (Test-Path (Join-Path $ProjectRoot 'public\index.html'))) { throw 'Frontend build missing. Run npm ci and npm run build first.' }
$phpOptions = @('-d','display_errors=0','-d','log_errors=1','-d',('error_log=' + (Join-Path $StorageRoot 'php-error.log')),'-d','upload_max_filesize=30M','-d','post_max_size=32M')
$caBundle = Join-Path $StorageRoot 'windows-ca.pem'
if (-not (Test-Path -LiteralPath $caBundle -PathType Leaf)) { throw 'Project CA bundle missing. Run scripts/export-local-ca.ps1 before startup.' }
$phpOptions += @('-d', ('curl.cainfo=' + $caBundle), '-d', ('openssl.cafile=' + $caBundle))
$phpModules = @(& $settings.php -m)
if ('zip' -notin $phpModules) {
    $zipLibrary = Join-Path (Split-Path $settings.php -Parent) 'ext\php_zip.dll'
    if (-not (Test-Path $zipLibrary)) { throw 'PHP ZIP extension missing; required for safe DOCX uploads.' }
    $phpOptions += @('-d', ('extension=' + $zipLibrary))
}
if ($Check) {
    if (-not (Assert-OwnDatabase $settings)) { throw 'Project database is stopped. Run webapp docchat to start the verified instance.' }
    & $settings.php @phpOptions (Join-Path $ProjectRoot 'backend\console.php') check
    if ($LASTEXITCODE -ne 0) { throw 'Backend configuration check failed.' }
    Write-Output 'Configuration and database checks passed. OpenAI network and document indexing require separate live verification.'
    exit 0
}
Assert-FreePort 3250
Start-OwnDatabase $settings
& $settings.php @phpOptions (Join-Path $ProjectRoot 'backend\console.php') check
if ($LASTEXITCODE -ne 0) { throw 'Backend preflight failed. No HTTP server started.' }
Write-Lifecycle 'starting' web 3250 'Starting project PHP server after database verification.'
# Start a tracked child so readiness can be proven before this foreground launcher waits.
$arguments = @($phpOptions | ForEach-Object { '"' + $_ + '"' }) + @('-S','127.0.0.1:3250','-t',('"' + (Join-Path $ProjectRoot 'public') + '"'))
$webProcess = Start-Process -FilePath $settings.php -ArgumentList $arguments -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $StorageRoot 'web-output.log') -RedirectStandardError (Join-Path $StorageRoot 'web-error.log')
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $ready = $false
    do {
        $webProcess.Refresh()
        if ($webProcess.HasExited) { throw 'PHP server exited. Inspect storage/web-error.log.' }
        try {
            $response = Invoke-RestMethod 'http://127.0.0.1:3250/api/index.php?action=health' -TimeoutSec 2
            if ($response.ok -eq $true) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $ready) { throw 'HTTP/database readiness failed within 30 seconds.' }
    Write-Lifecycle 'ready' web 3250 "Verified HTTP health and database; PHP PID $($webProcess.Id)."
    Write-Output 'AI Presenter: http://127.0.0.1:3250 - Ctrl+C stops this HTTP server. Owned database remains running.'
    if (-not $response.aiConfigured) { Write-Output 'OpenAI key is not configured. Run scripts/set-openai-key.ps1 in another terminal.' }
    $webProcess.WaitForExit()
    if ($webProcess.ExitCode -ne 0) { throw "PHP server exited with code $($webProcess.ExitCode)." }
} finally {
    $webProcess.Refresh()
    if (-not $webProcess.HasExited) {
        # Only this exact child process is stopped; unknown port owners are never touched.
        $webProcess.Kill()
        $webProcess.WaitForExit()
    }
    Write-Lifecycle 'stopped' web 3250 "Tracked PHP child $($webProcess.Id) stopped; database retained."
    $webProcess.Dispose()
}
