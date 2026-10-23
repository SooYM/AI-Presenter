[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][ValidateRange(1,40)][int]$Page,[ValidateSet(0,1)][int]$VideoMode=0)
$ErrorActionPreference='Stop'
$sourcePath=[IO.Path]::GetFullPath($Source)
$directory=[IO.Path]::GetDirectoryName($sourcePath)
if([IO.Path]::GetFileName($sourcePath) -ne 'source.pptx' -or [IO.Path]::GetFileName($directory) -notmatch '^[a-f0-9]{40}$' -or $sourcePath.StartsWith('\\') -or -not(Test-Path -LiteralPath $sourcePath -PathType Leaf)){throw 'Invalid private animation source.'}
$file=if($VideoMode){'video-'+$Page+'-v2.mp4'}else{'animation-'+$Page+'.mp4'}
$destinationPath=Join-Path $directory $file
if(Test-Path -LiteralPath $destinationPath){throw 'An animation clip already exists.'}
if(@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count){throw 'PowerPoint is already open. Close it before preparing animations.'}
$mutex=[Threading.Mutex]::new($false,'Local\AI-Presenter.PowerPointConversion')
$locked=$false;$application=$null;$presentation=$null;$original=$null
$workCopy=Join-Path $directory ('.animation-'+$Page+'-'+[guid]::NewGuid().ToString('N')+'.pptx')
$workVideo=[IO.Path]::ChangeExtension($workCopy,'.mp4')
try{
    $locked=$mutex.WaitOne(0);if(-not$locked){throw 'Another PowerPoint conversion is active.'}
    if(@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count){throw 'PowerPoint is already open.'}
    $application=New-Object -ComObject PowerPoint.Application
    $application.AutomationSecurity=3;$application.DisplayAlerts=1
    Copy-Item -LiteralPath $sourcePath -Destination $workCopy
    $presentation=$application.Presentations.Open($workCopy,0,0,0)
    if($presentation.Slides.Count-lt1-or$presentation.Slides.Count-gt40-or$Page-gt$presentation.Slides.Count){throw 'Invalid slide count or page.'}
    for($index=$presentation.Slides.Count;$index-ge1;$index--){if($index-ne$Page){$presentation.Slides.Item($index).Delete()}}
    $slide=$presentation.Slides.Item(1)
    $slide.SlideShowTransition.Hidden=0
    if($VideoMode){
        for($seqIndex=$slide.TimeLine.InteractiveSequences.Count;$seqIndex-ge1;$seqIndex--){
            $interactive=$slide.TimeLine.InteractiveSequences.Item($seqIndex)
            for($effectIndex=$interactive.Count;$effectIndex-ge1;$effectIndex--){
                $mediaEffect=$interactive.Item($effectIndex);$target=$mediaEffect.Shape
                if($target.Type-ne16-or$target.MediaType-ne3){throw 'Non-video interactive animations need manual PowerPoint playback.'}
                $mediaEffect.Delete()
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($target);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($mediaEffect)
            }
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($interactive)
        }
    }elseif($slide.TimeLine.InteractiveSequences.Count-gt0){throw 'Shape-triggered interactive animations cannot be exported as automatic playback.'}
    $mediaSeconds=0.0;$mediaCount=0
    foreach($shape in $slide.Shapes){
        if($shape.Type-eq16-and$shape.MediaType-eq3){
            $mediaCount++;if($mediaCount-gt1){throw 'Use one embedded video per slide. Split multiple videos across separate slides.'};$length=[double]$shape.MediaFormat.Length/1000
            if($length-le0-or$length-gt600){throw 'Embedded video must have a known duration no longer than 600 seconds.'}
            $shape.AnimationSettings.PlaySettings.PlayOnEntry=-1
            $shape.AnimationSettings.PlaySettings.LoopUntilStopped=0
            $shape.AnimationSettings.PlaySettings.PauseAnimation=0
            $shape.AnimationSettings.PlaySettings.StopAfterSlides=1
            $mediaSeconds=[Math]::Max($mediaSeconds,$length)
        }
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shape)
    }
    if($VideoMode-and$mediaCount-eq0){throw 'No supported embedded video shape was found.'}
    $sequence=$slide.TimeLine.MainSequence
    if($sequence.Count-gt100){throw 'A slide supports up to 100 effects.'}
    $total=0.0;$groupStart=0.0;$previousEnd=0.0
    for($index=1;$index-le$sequence.Count;$index++){
        $effect=$sequence.Item($index);$timing=$effect.Timing
        $trigger=[int]$timing.TriggerType
        if($trigger-in@(4,5,-1)){throw 'Interactive or media-triggered animations need manual PowerPoint playback.'}
        if($trigger-eq1){$timing.TriggerType=3;$timing.TriggerDelayTime=[Math]::Max(0.4,[double]$timing.TriggerDelayTime);$trigger=3}
        $duration=[double]$timing.Duration;$repeat=[double]$timing.RepeatCount;$delay=[double]$timing.TriggerDelayTime
        if($duration-lt0-or$duration-gt60-or$repeat-lt0-or$repeat-gt10-or$delay-lt0-or$delay-gt60){throw 'Looping or lengthy effects exceed supported bounds.'}
        $duration=$duration*[Math]::Max(1,$repeat)
        if($timing.AutoReverse){$duration=$duration*2}
        if($trigger-ne2){$groupStart=$previousEnd}
        $end=$groupStart+$delay+$duration;$total=[Math]::Max($total,$end);$previousEnd=[Math]::Max($previousEnd,$end)
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($timing);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($effect)
    }
    $authored=0.0;if($slide.SlideShowTransition.AdvanceOnTime){$authored=[double]$slide.SlideShowTransition.AdvanceTime}
    $seconds=[Math]::Max(3,[Math]::Max($authored,[Math]::Max($total+1.5,$mediaSeconds+$total+1.5)))
    if($seconds-gt$(if($VideoMode){600}else{60})){throw 'Slide playback exceeds supported duration limits.'}
    $slide.SlideShowTransition.AdvanceOnClick=0;$slide.SlideShowTransition.AdvanceOnTime=-1;$slide.SlideShowTransition.AdvanceTime=$seconds
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($sequence);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($slide);$slide=$null;$sequence=$null
    $presentation.Save()
    [IO.File]::WriteAllBytes($workVideo,[byte[]]@())
    $presentation.CreateVideo($workVideo,$true,[int][Math]::Ceiling($seconds),1080,24,85)
    $deadline=[DateTime]::UtcNow.AddSeconds($(if($VideoMode){600}else{150}))
    do{
        $status=[int]$presentation.CreateVideoStatus
        if($status-eq3){break};if($status-eq4){throw 'PowerPoint video export failed.'}
        if([DateTime]::UtcNow-gt$deadline){throw 'PowerPoint video export exceeded 150 seconds.'}
        Start-Sleep -Milliseconds 200
    }while($true)
    if(-not(Test-Path -LiteralPath $workVideo -PathType Leaf)-or(Get-Item -LiteralPath $workVideo).Length-gt$(if($VideoMode){536870912}else{100663296})){throw 'Animation clip missing or larger than 96 MB.'}
    $presentation.Close();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation);$presentation=$null
    if($application.Presentations.Count-eq0){$application.Quit()}
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application);$application=$null
    [GC]::Collect();[GC]::WaitForPendingFinalizers()
    $releaseDeadline=[DateTime]::UtcNow.AddSeconds(10)
    do{
        try{$stream=[IO.File]::Open($workVideo,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None);$stream.Dispose();break}catch{if([DateTime]::UtcNow-gt$releaseDeadline){throw 'PowerPoint did not release the completed video.'};Start-Sleep -Milliseconds 100}
    }while($true)
    Move-Item -LiteralPath $workVideo -Destination $destinationPath
    Write-Output ('{"page":'+$Page+',"file":"'+$file+'"}')
}finally{
    if($original){try{$original.Close()}catch{};[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($original)}
    if($presentation){try{$presentation.Close()}catch{};[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)}
    if($application){try{if($application.Presentations.Count-eq0){$application.Quit()}}catch{};[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)}
    [GC]::Collect();[GC]::WaitForPendingFinalizers()
    foreach($temporary in @($workCopy,$workVideo)){
        $resolved=[IO.Path]::GetFullPath($temporary)
        if([IO.Path]::GetDirectoryName($resolved)-eq$directory-and[IO.Path]::GetFileName($resolved).StartsWith('.animation-')-and(Test-Path -LiteralPath $resolved -PathType Leaf)){try{Remove-Item -LiteralPath $resolved -Force}catch{}}
    }
    if($locked){$mutex.ReleaseMutex()};$mutex.Dispose();[GC]::Collect();[GC]::WaitForPendingFinalizers()
}
