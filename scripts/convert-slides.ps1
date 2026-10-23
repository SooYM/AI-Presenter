[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
$sourcePath=[IO.Path]::GetFullPath($Source)
$destinationPath=[IO.Path]::GetFullPath($Destination)
if ([IO.Path]::GetFileName($sourcePath) -ne 'source.pptx' -or [IO.Path]::GetFileName($destinationPath) -ne 'deck.pdf' -or [IO.Path]::GetDirectoryName($sourcePath) -ne [IO.Path]::GetDirectoryName($destinationPath) -or -not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw 'Invalid private conversion paths.' }
if (@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count) { throw 'PowerPoint is already open. Close it before converting, or upload a PDF.' }
$mutex=[Threading.Mutex]::new($false,'Local\AI-Presenter.PowerPointConversion')
$locked=$false;$application=$null;$presentation=$null
try {
    $locked=$mutex.WaitOne(0)
    if(-not $locked){throw 'Another presentation conversion is active.'}
    if (@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count) { throw 'PowerPoint is already open.' }
    $application=New-Object -ComObject PowerPoint.Application
    $application.AutomationSecurity=3
    $application.DisplayAlerts=1
    $presentation=$application.Presentations.Open($sourcePath,-1,0,0)
    if($presentation.Slides.Count -lt 1 -or $presentation.Slides.Count -gt 40){throw 'Supported slide count is1 to40.'}
    # ppSaveAsPDF=32 avoids ExportAsFixedFormat optional COM argument binding.
    $presentation.SaveAs($destinationPath,32)
    if(-not (Test-Path -LiteralPath $destinationPath -PathType Leaf)){throw 'PowerPoint did not create a PDF.'}
    Write-Output 'PDF export completed.'
} finally {
    if($presentation){try{$presentation.Close()}catch{};[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)}
    # This instance was created only after two checks found no existing PowerPoint.
    # Never terminate a process or close any presentation not opened by this helper.
    if($application){try{if($application.Presentations.Count -eq 0){$application.Quit()}}catch{};[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)}
    if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()
    [GC]::Collect();[GC]::WaitForPendingFinalizers()
}
