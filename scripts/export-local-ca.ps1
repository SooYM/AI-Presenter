[CmdletBinding()]
param([string]$StandardBundle = 'C:\xampp\apache\bin\curl-ca-bundle.crt')
. (Join-Path $PSScriptRoot 'common.ps1')
if (-not (Test-Path -LiteralPath $StorageRoot -PathType Container)) { throw 'Run local setup before exporting the project CA bundle.' }
$denied = @{}
foreach ($store in @('Cert:\CurrentUser\Disallowed', 'Cert:\LocalMachine\Disallowed')) {
    if (Test-Path $store) {
        foreach ($certificate in Get-ChildItem $store -ErrorAction Stop) { $denied[$certificate.Thumbprint] = $true }
    }
}
$certificates = @{}
foreach ($store in @('Cert:\CurrentUser\Root', 'Cert:\LocalMachine\Root')) {
    foreach ($certificate in Get-ChildItem $store -ErrorAction Stop) {
        if (-not $denied.ContainsKey($certificate.Thumbprint)) { $certificates[$certificate.Thumbprint] = $certificate }
    }
}
if (-not $certificates.Count) { throw 'No trusted public Windows root certificates were found. No CA bundle was changed.' }
$builder = New-Object Text.StringBuilder
[void]$builder.AppendLine('# Project-local public CA certificates. No private keys. Regenerate after Windows trust changes.')
$standardCount = 0
if ($StandardBundle -and (Test-Path -LiteralPath $StandardBundle -PathType Leaf)) {
    $standard = Get-Content -LiteralPath $StandardBundle -Raw
    foreach ($match in [regex]::Matches($standard, '(?s)-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----')) {
        $base64 = [regex]::Replace($match.Value, '-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s', '')
        $certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList (,[Convert]::FromBase64String($base64))
        try {
            if (-not $denied.ContainsKey($certificate.Thumbprint)) { [void]$builder.AppendLine($match.Value); $standardCount++ }
        } finally { $certificate.Dispose() }
    }
    if (-not $standardCount) { throw 'The existing standard CA bundle contained no usable certificates. No bundle was changed.' }
}
foreach ($thumbprint in @($certificates.Keys | Sort-Object)) {
    # RawData is the public DER certificate only; private-key APIs are never used.
    $base64 = [Convert]::ToBase64String($certificates[$thumbprint].RawData, [Base64FormattingOptions]::InsertLineBreaks)
    [void]$builder.AppendLine('-----BEGIN CERTIFICATE-----')
    [void]$builder.AppendLine($base64)
    [void]$builder.AppendLine('-----END CERTIFICATE-----')
}
$destination = Join-Path $StorageRoot 'windows-ca.pem'
Write-PrivateFile $destination $builder.ToString()
Write-Output "Project CA bundle refreshed: $($certificates.Count) Windows public roots and $standardCount standard bundle certificates."
Write-Output 'Restart webapp docchat to apply. TLS peer and hostname verification remain enabled.'
