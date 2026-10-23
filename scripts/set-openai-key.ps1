[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
$path = Join-Path $ProjectRoot '.env'
if (-not (Test-Path $path)) { throw 'Configure .env first.' }
$secret = Read-Host 'OpenAI API key (hidden)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($value -notmatch '^sk-[A-Za-z0-9_-]{10,}$') { throw 'Expected an OpenAI API key starting with sk-.' }
    $content = Get-Content $path -Raw
    if ($content -notmatch '(?m)^OPENAI_API_KEY=') { throw 'OPENAI_API_KEY setting missing.' }
    $content = [regex]::Replace($content, '(?m)^OPENAI_API_KEY=.*$', ('OPENAI_API_KEY=' + $value))
    Write-PrivateFile $path $content
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $value = $null; $secret.Dispose() }
Write-Output 'OpenAI key saved privately. Reload AI Presenter; API configuration reloads per request.'
