<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/bootstrap.php';
require __DIR__.'/SlideConverter.php';
require __DIR__.'/Presentations.php';
$checks=0;
function check(bool $condition,string $label):void{global $checks;if(!$condition)throw new RuntimeException($label);$checks++;}
check(speechSegments("Hello. [1]\n\n你好。 [2][3]")===["Hello. [1]","你好。 [2][3]"],'English/Chinese exact segment boundaries');
check(speechSegments('')===[],'Empty speech');
$long=str_repeat('中',1300);$segments=speechSegments($long);check(implode('',$segments)===$long&&max(array_map('mb_strlen',$segments))<=600,'Long Chinese speech retains every character');
check(preg_replace('/ (?:\[\d+\])+(?=\n\n|$)/u','',"Hello. [1][2]\n\n你好。 [3]")==="Hello.\n\n你好。",'Speech strips all consecutive terminal citations');
$scope=new ReflectionMethod(Presentations::class,'scriptScope');
$documents=[['id'=>1,'name'=>'Reference','file_id'=>'file-one','vector_store_id'=>'store-one','created_at'=>'2026-10-23 00:00:00']];
$original=$scope->invoke(null);
check($original===$scope->invoke(null),'Script scope stable across retries');
check($original===$scope->invoke(null,[],'gpt-4o-mini'),'Supporting documents never invalidate saved scripts');
$changed=$documents;$changed[0]['file_id']='file-two';
check($original===$scope->invoke(null,$changed,'gpt-4o-mini'),'Replacing supporting content preserves saved scripts');
check($original===$scope->invoke(null,$documents,'different-model'),'Changing narration model preserves saved scripts');
$videoScope=new ReflectionMethod(Presentations::class,'videoScriptScope');
check($videoScope->invoke(null)!==$original,'Video static-only scripts cannot reuse old generated canonical text');
check($videoScope->invoke(null)===$videoScope->invoke(null),'Video static-only scope remains stable across reruns');
$pageJson=new ReflectionMethod(Presentations::class,'scriptPage');
$generated=['page_number'=>1,'scope_hash'=>$original,'content'=>'Saved text','citations'=>'[]','created_at'=>'2026-10-23 00:00:00'];
$generatedPage=$pageJson->invoke(null,$generated);check($generatedPage['source']==='generated','Generated script retains source');
$manual=$generated;$manual['scope_hash']='manual:'.str_repeat('a',56);$manual['content']='Edited words [1]';
$manualPage=$pageJson->invoke(null,$manual);check($manualPage['source']==='manual'&&$manualPage['content']==='Edited words [1]'&&$manualPage['citations']===[],'Manual script remains verbatim without stale verified citations');
check($generatedPage['revision']!==$manualPage['revision'],'Manual save changes optimistic revision');
$emptyVideo=$generated;$emptyVideo['content']='';$emptyVideo['scope_hash']=$videoScope->invoke(null);
check($pageJson->invoke(null,$emptyVideo)['noSpeech']===true,'Empty saved video-only script explicitly disables speech');
check($manualPage['noSpeech']===false,'Existing manual narration continues speaking verbatim');
$manual['scope_hash']='manual:'.str_repeat('b',56);check($manualPage['revision']!==$pageJson->invoke(null,$manual)['revision'],'Distinct edits have distinct revisions even with identical words');
$questionPages=new ReflectionMethod(Presentations::class,'questionPages');
check($questionPages->invoke(null,[3,1,3],3)===[1,3],'Question pages sorted and deduplicated');
check($questionPages->invoke(null,[],3)===[],'No automatic question pages supported');
foreach([[0],[4],['1'],[1.5],['page'=>1]] as $invalid){try{$questionPages->invoke(null,$invalid,3);throw new RuntimeException('Invalid question page accepted.');}catch(ApiError $error){check($error->errorCode==='invalid_question_pages','Invalid question page rejected');}}
foreach(['../escape.xml','ppt/vbaProject.bin','ppt/embeddings/object.bin','ppt/activeX/control.xml'] as $entry){
    $path=tempnam(sys_get_temp_dir(),'deck-check-');$zip=new ZipArchive();$zip->open($path,ZipArchive::OVERWRITE);$zip->addFromString('ppt/presentation.xml','<presentation/>');$zip->addFromString($entry,'unsafe');$zip->close();
    try{SlideConverter::validatePptx($path);throw new RuntimeException('Unsafe archive accepted');}catch(ApiError $error){check($error->errorCode==='unsafe_deck','Unsafe ZIP rejected: '.$entry);}finally{unlink($path);}
}
$path=tempnam(sys_get_temp_dir(),'deck-check-');$zip=new ZipArchive();$zip->open($path,ZipArchive::OVERWRITE);$zip->addFromString('ppt/presentation.xml','<presentation/>');$zip->addFromString('ppt/_rels/presentation.xml.rels','<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" TargetMode="External" Target="https://example.com/image.png"/></Relationships>');$zip->close();
try{SlideConverter::validatePptx($path);throw new RuntimeException('External media accepted');}catch(ApiError $error){check($error->errorCode==='unsafe_deck','External media rejected');}finally{unlink($path);}
echo $checks." presentation checks passed.\n";
