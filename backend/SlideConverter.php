<?php
declare(strict_types=1);

/** Fixed local conversion tools. No uploaded command text or public filesystem paths. */
final class SlideConverter {
    private function executable(string $name): string {
        $directory = config('POPPLER_BIN');
        if ($directory === '') throw new ApiError(503, 'slide_runtime_missing', 'Slide rendering needs the configured Poppler runtime.');
        $path = rtrim($directory, '/\\') . DIRECTORY_SEPARATOR . $name . (PHP_OS_FAMILY === 'Windows' ? '.exe' : '');
        if (!is_file($path)) throw new ApiError(503, 'slide_runtime_missing', 'A required slide-rendering tool is unavailable.');
        return $path;
    }

    public static function validatePptx(string $path): void {
        if (!class_exists('ZipArchive')) throw new ApiError(503, 'slide_runtime_missing', 'PPTX support needs the PHP ZIP extension.');
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) throw new ApiError(415, 'invalid_deck', 'This PPTX file is not readable.');
        try {
            if ($zip->locateName('ppt/presentation.xml') === false || $zip->numFiles > 5000) throw new ApiError(415, 'invalid_deck', 'This is not a supported PPTX presentation.');
            $expanded = 0;
            for ($i=0; $i<$zip->numFiles; $i++) {
                $stat=$zip->statIndex($i); $name=(string)($stat['name'] ?? '');
                $expanded += (int)($stat['size'] ?? 0);
                if ($expanded > 150*1024*1024 || preg_match('~(^|/)(\.\.?)(/|$)|^[a-z]:|^/|\\\\~i',$name) || preg_match('~vbaProject|vbaData|/activeX/|/embeddings/|/customUI/~i',$name)) throw new ApiError(415,'unsafe_deck','PPTX contains unsupported embedded code, objects, or oversized contents. Export a PDF instead.');
                if (str_ends_with(strtolower($name),'.rels')) {
                    $xml=$zip->getFromIndex($i);
                    if ($xml === false || strlen($xml)>2*1024*1024) throw new ApiError(415,'unsafe_deck','PPTX relationships exceed supported limits.');
                    $doc=new DOMDocument();
                    if (!@$doc->loadXML($xml,LIBXML_NONET)) throw new ApiError(415,'invalid_deck','PPTX relationships are malformed.');
                    foreach($doc->getElementsByTagName('Relationship') as $relationship) {
                        if (strtolower($relationship->getAttribute('TargetMode'))==='external' && !str_ends_with($relationship->getAttribute('Type'),'/hyperlink')) throw new ApiError(415,'unsafe_deck','Linked external media is unsupported. Embed media or export a PDF.');
                    }
                }
            }
        } finally { $zip->close(); }
    }

    public function initialize(string $directory,string $type): int {
        $pdf=$directory.'/deck.pdf';
        if (!is_file($pdf)) {
            if ($type==='pdf') {
                if (!copy($directory.'/source.pdf',$pdf)) throw new ApiError(503,'slide_storage','Could not prepare the PDF copy.');
            } else {
                if (PHP_OS_FAMILY!=='Windows' || config('POWERPOINT_CONVERSION')!=='true') throw new ApiError(503,'pptx_conversion_unavailable','PPTX conversion is not enabled on this server. Export your slides as PDF, or configure the local PowerPoint converter.');
                $powershell=config('POWERSHELL_EXE','C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
                if (!is_file($powershell)) throw new ApiError(503,'pptx_conversion_unavailable','The local presentation converter is unavailable. Upload a PDF instead.');
                $this->run([$powershell,'-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',PROJECT_ROOT.'/scripts/convert-slides.ps1','-Source',$directory.'/source.pptx','-Destination',$pdf],150);
                if (!is_file($pdf)) throw new ApiError(422,'pptx_conversion_failed','PowerPoint could not convert this deck. Close other PowerPoint windows and retry, or export a PDF.');
            }
        }
        $info=$this->run([$this->executable('pdfinfo'),$pdf],20);
        if (!preg_match('/^Pages:\s*(\d+)\s*$/m',$info,$match)) throw new ApiError(415,'invalid_deck','The PDF page count could not be read. Encrypted or damaged PDFs are unsupported.');
        $pages=(int)$match[1];
        if ($pages<1 || $pages>40) throw new ApiError(413,'slide_limit','Presentations must contain between 1 and 40 slides.');
        return $pages;
    }

    public function page(string $directory,int $page): array {
        $prefix=$directory.'/slide-'.$page;
        $this->run([$this->executable('pdftoppm'),'-f',(string)$page,'-l',(string)$page,'-scale-to','1600','-png','-singlefile',$directory.'/deck.pdf',$prefix],35);
        $image=$prefix.'.png';
        if (!is_file($image) || filesize($image)>12*1024*1024 || @getimagesize($image)===false) throw new ApiError(422,'slide_render_failed','This slide could not be rendered.');
        $textBinary=rtrim(config('POPPLER_BIN'),'/\\').DIRECTORY_SEPARATOR.'pdftotext'.(PHP_OS_FAMILY==='Windows'?'.exe':'');
        // Some Poppler bundles include rendering only. The caller then uses visible-page OCR.
        $text=is_file($textBinary)?$this->run([$textBinary,'-f',(string)$page,'-l',(string)$page,'-layout','-enc','UTF-8',$directory.'/deck.pdf','-'],20):'';
        if ($text==='' && is_file(config('PYTHON_BIN'))) {
            $text=$this->run([config('PYTHON_BIN'),PROJECT_ROOT.'/scripts/extract-slide-text.py',$directory.'/deck.pdf',(string)$page],20);
        }
        $text=trim(str_replace(["\0","\x0c"],'',$text));
        if (!mb_check_encoding($text,'UTF-8')) throw new ApiError(422,'slide_text_failed','The slide text could not be decoded.');
        return ['image'=>'slide-'.$page.'.png','text'=>mb_substr($text,0,24000)];
    }

    private function run(array $command,int $timeout): string {
        if (!function_exists('proc_open')) throw new ApiError(503,'slide_runtime_missing','This server does not allow local slide conversion.');
        $pipes=[]; $process=proc_open($command,[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,null,['bypass_shell'=>true,'create_process_group'=>true]);
        if (!is_resource($process)) throw new ApiError(503,'slide_runtime_missing','Slide conversion could not start.');
        fclose($pipes[0]); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false);
        $output=''; $errors=''; $deadline=microtime(true)+$timeout; $code=-1;
        try {
            do {
                $output.=stream_get_contents($pipes[1]); $errors.=stream_get_contents($pipes[2]);
                if (strlen($output)+strlen($errors)>4*1024*1024) throw new ApiError(422,'slide_conversion_failed','Slide conversion output exceeded supported limits.');
                $status=proc_get_status($process);
                if (!$status['running']) { $code=(int)$status['exitcode']; break; }
                if (microtime(true)>$deadline) { proc_terminate($process); throw new ApiError(504,'slide_conversion_timeout','Slide conversion took too long. Try a smaller PDF.'); }
                usleep(50000);
            } while(true);
            $output.=stream_get_contents($pipes[1]);
        } finally { fclose($pipes[1]); fclose($pipes[2]); $closed=proc_close($process); if($code<0)$code=$closed; }
        if ($code!==0) {
            // Tool stderr can contain uploaded paths or document text; never expose it.
            error_log(json_encode(['event'=>'slide_conversion_failed','exitCode'=>$code,'tool'=>basename($command[0]),'requestId'=>$GLOBALS['requestId']??'cli']));
            throw new ApiError(422,'slide_conversion_failed','The slide converter could not read this file. For PPTX, close other PowerPoint windows and retry; PDF is also supported.');
        }
        return $output;
    }
}
