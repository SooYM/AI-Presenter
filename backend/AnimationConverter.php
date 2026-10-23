<?php
declare(strict_types=1);

/** Native PowerPoint renders its own effects; source decks are never modified. */
final class AnimationConverter {
    private static array $inspectionCache=[];
    private const NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
    private static function inspect(string $source): array {
        $key=(realpath($source)?:$source).':'.(@filemtime($source)?:0).':'.(@filesize($source)?:0);
        if(isset(self::$inspectionCache[$key]))return self::$inspectionCache[$key];
        if (!class_exists('ZipArchive')) throw new ApiError(503,'animation_runtime_missing','PowerPoint animation detection needs the PHP ZIP extension.');
        $zip=new ZipArchive();
        if($zip->open($source)!==true)throw new ApiError(415,'invalid_deck','The PowerPoint deck could not be read.');
        $xml=static function(string $name)use($zip):DOMDocument{
            $text=$zip->getFromName($name);
            if(!is_string($text)||strlen($text)>2*1024*1024)throw new ApiError(415,'invalid_deck','PowerPoint slide metadata is unreadable or oversized.');
            $doc=new DOMDocument();if(!@$doc->loadXML($text,LIBXML_NONET))throw new ApiError(415,'invalid_deck','PowerPoint slide metadata is malformed.');return $doc;
        };
        try {
            $presentation=$xml('ppt/presentation.xml');$relations=$xml('ppt/_rels/presentation.xml.rels');$targets=[];
            foreach($relations->getElementsByTagName('Relationship')as$relation){
                if(strtolower($relation->getAttribute('TargetMode'))==='external')continue;
                $target=str_replace('\\','/',$relation->getAttribute('Target'));
                if(preg_match('~^(?:/ppt/)?(?:slides/)(slide[1-9][0-9]*\.xml)$~',$target,$match))$targets[$relation->getAttribute('Id')]='ppt/slides/'.$match[1];
            }
            $slides=$presentation->getElementsByTagNameNS(self::NS,'sldId');
            if($slides->length<1||$slides->length>40)throw new ApiError(413,'slide_limit','Presentations must contain between 1 and 40 slides.');
            $pages=[];$page=0;
            foreach($slides as $slide){
                $page++;$id=$slide->getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
                if(!isset($targets[$id]))throw new ApiError(415,'invalid_deck','A PowerPoint slide relationship is invalid.');
                $doc=$xml($targets[$id]);$xpath=new DOMXPath($doc);$xpath->registerNamespace('p',self::NS);
                $effects=$xpath->query('//p:timing//p:anim | //p:timing//p:animEffect | //p:timing//p:animMotion | //p:timing//p:animClr | //p:timing//p:animScale | //p:timing//p:animRot | //p:timing//p:set | //p:timing//p:cmd | //p:timing//p:video | //p:transition/*[not(self::p:sndAc)]');
                $xpath->registerNamespace('a','http://schemas.openxmlformats.org/drawingml/2006/main');
                $videos=$xpath->query('//*[local-name()="videoFile"]');$count=$videos===false?0:$videos->length;$linked=false;
                $relationships=[];$relationPath=dirname($targets[$id]).'/_rels/'.basename($targets[$id]).'.rels';
                if($zip->locateName($relationPath)!==false){foreach($xml($relationPath)->getElementsByTagName('Relationship')as$rel)$relationships[$rel->getAttribute('Id')]=$rel;}
                foreach($videos as$video){$rid=$video->getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','link');$rel=$relationships[$rid]??null;
                    if(!$rel||strtolower($rel->getAttribute('TargetMode'))==='external')$linked=true;
                    elseif(!preg_match('~^(?:\.\./media/|/ppt/media/)[^/]+$~',str_replace('\\','/',$rel->getAttribute('Target'))))$linked=true;
                }
                $text=[];foreach($xpath->query('//p:sp//a:p')as$paragraph){$line=[];foreach($xpath->query('.//a:t',$paragraph)as$node)$line[]=$node->textContent;if($line)$text[]=implode('',$line);}
                $pages[$page]=['hasVideo'=>$count>0,'videoCount'=>$count,'linkedVideo'=>$linked,'nonVideoText'=>implode("\n",$text),'animated'=>($effects!==false&&$effects->length>0)||$count>0];
            }
            if(count(self::$inspectionCache)>=8)self::$inspectionCache=[];
            return self::$inspectionCache[$key]=$pages;
        } finally {$zip->close();}
    }

    public static function animatedPages(string $source): array {return array_keys(array_filter(self::inspect($source),static fn($page)=>$page['animated']));}
    public static function videoPages(string $source): array {return array_keys(array_filter(self::inspect($source),static fn($page)=>$page['hasVideo']));}
    public static function pageMedia(string $source,int $page): array {
        $media=self::inspect($source)[$page]??null;if($media===null)throw new ApiError(400,'invalid_slide','Choose a valid slide.');unset($media['animated']);return $media;
    }

    public function prepare(string $directory,int $page): array {
        $directory=realpath($directory)?:'';
        if($directory===''||!preg_match('/^[a-f0-9]{40}$/',basename($directory))||$page<1||$page>40)throw new ApiError(400,'invalid_animation','Choose a valid private slide animation.');
        $source=$directory.'/source.pptx';
        if(!is_file($source)||is_link($source))throw new ApiError(404,'animation_source_missing','The original PowerPoint file is unavailable.');
        $media=self::pageMedia($source,$page);$video=$media['hasVideo'];
        if($media['linkedVideo'])throw new ApiError(422,'linked_video_unsupported','Linked videos are unsupported. Embed the video in PowerPoint and upload again.');
        if($media['videoCount']>1)throw new ApiError(422,'multiple_videos_unsupported','Use one embedded video per slide. Split multiple videos across separate slides.');
        $file=$video?'video-'.$page.'-v2.mp4':'animation-'.$page.'.mp4';$destination=$directory.'/'.$file;$kind=$video?'video':'animation';
        if(!in_array($page,self::animatedPages($source),true))throw new ApiError(409,'slide_not_animated','This slide has no PowerPoint animation or transition to prepare.');
        if(is_file($destination)&&!is_link($destination))return ['file'=>$file,'duration'=>self::duration($destination),'kind'=>$kind];
        if(PHP_OS_FAMILY!=='Windows'||config('POWERPOINT_CONVERSION')!=='true')throw new ApiError(503,'animation_runtime_missing','PowerPoint animations need the configured Windows PowerPoint converter.');
        $powershell=config('POWERSHELL_EXE','C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
        if(!is_file($powershell)||!function_exists('proc_open'))throw new ApiError(503,'animation_runtime_missing','The local animation converter is unavailable.');
        $command=[$powershell,'-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',PROJECT_ROOT.'/scripts/export-slide-animation.ps1','-Source',$source,'-Page',(string)$page,'-VideoMode',($video?'1':'0')];
        $pipes=[];$process=proc_open($command,[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,null,['bypass_shell'=>true,'create_process_group'=>true]);
        if(!is_resource($process))throw new ApiError(503,'animation_runtime_missing','PowerPoint animation export could not start.');
        fclose($pipes[0]);stream_set_blocking($pipes[1],false);stream_set_blocking($pipes[2],false);$deadline=microtime(true)+($video?635:185);$code=-1;$output='';$errors='';
        try {
            do{
                $output.=stream_get_contents($pipes[1]);$errors.=stream_get_contents($pipes[2]);
                if(strlen($output)+strlen($errors)>1024*1024)throw new ApiError(422,'animation_failed','PowerPoint animation export returned excessive diagnostics.');
                $status=proc_get_status($process);if(!$status['running']){$code=(int)$status['exitcode'];break;}
                if(microtime(true)>$deadline){proc_terminate($process);throw new ApiError(504,'animation_timeout','PowerPoint animation export timed out. Try a shorter animation.');}
                usleep(100000);
            }while(true);
        }finally{fclose($pipes[1]);fclose($pipes[2]);$closed=proc_close($process);if($code<0)$code=$closed;}
        if($code!==0){
            error_log(json_encode(['event'=>'animation_conversion_failed','exitCode'=>$code,'requestId'=>$GLOBALS['requestId']??'cli']));
            throw new ApiError(422,'animation_failed','PowerPoint could not export this animation. Close other PowerPoint windows and retry. Linked media, unsupported interactive effects, or clips exceeding export limits need a simpler deck.');
        }
        return ['file'=>$file,'duration'=>self::duration($destination),'kind'=>$kind];
    }

    /** Independently validate actual MP4 duration and an H.264 sample entry. */
    public static function duration(string $path): float {
        $video=preg_match('/^video-[1-9][0-9]*-v2\.mp4$/',basename($path))===1;$limit=($video?512:96)*1024*1024;
        if(!is_file($path)||is_link($path)||filesize($path)<100||filesize($path)>$limit)throw new ApiError(422,'animation_invalid','The clip is missing or exceeds its supported size limit.');
        $handle=fopen($path,'rb');if($handle===false)throw new ApiError(422,'animation_invalid','The animation clip could not be read.');
        $size=filesize($path);$duration=null;$h264=false;$ftyp=false;
        try{
            $offset=0;
            while($offset+8<=$size){
                fseek($handle,$offset);$header=fread($handle,8);if(strlen($header)!==8)break;
                $box=unpack('Nsize/a4type',$header);$length=(int)$box['size'];$headerSize=8;
                if($length===1){$extended=fread($handle,8);if(strlen($extended)!==8)break;$parts=unpack('Nhigh/Nlow',$extended);if($parts['high']!==0)break;$length=(int)$parts['low'];$headerSize=16;}
                if($length===0)$length=$size-$offset;
                if($length<$headerSize||$offset+$length>$size)break;
                if($box['type']==='ftyp')$ftyp=true;
                if($box['type']==='moov'){
                    if($length-$headerSize>16*1024*1024)throw new ApiError(422,'animation_invalid','The animation metadata exceeds supported bounds.');
                    $body=fread($handle,$length-$headerSize);$h264=str_contains($body,'avc1')||str_contains($body,'avc3');$position=0;
                    while($position+8<=strlen($body)){
                        $child=unpack('Nsize/a4type',substr($body,$position,8));$childLength=(int)$child['size'];
                        if($childLength<8||$position+$childLength>strlen($body))break;
                        if($child['type']==='mvhd'){
                            $data=substr($body,$position+8,$childLength-8);$version=ord($data[0]??"\0");
                            if($version===0&&strlen($data)>=20){$values=unpack('Nscale/Nticks',substr($data,12,8));if($values['scale']>0)$duration=$values['ticks']/$values['scale'];}
                            elseif($version===1&&strlen($data)>=32){$values=unpack('Nscale/Nhigh/Nlow',substr($data,20,12));if($values['scale']>0&&$values['high']===0)$duration=$values['low']/$values['scale'];}
                        }
                        $position+=$childLength;
                    }
                }
                $offset+=$length;
            }
        }finally{fclose($handle);}
        if(!$ftyp||!$h264||$duration===null||$duration<=0||$duration>($video?605:65))throw new ApiError(422,'animation_invalid','The animation must be a valid H.264 MP4 within the supported duration limit.');
        return round($duration,3);
    }
}
