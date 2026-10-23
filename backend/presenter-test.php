<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__.'/bootstrap.php';
require __DIR__.'/GroundedPresenter.php';

function check(bool $ok, string $name): void {
    if (!$ok) { fwrite(STDERR,"FAIL: $name\n"); exit(1); }
    echo "PASS: $name\n";
}
$sources = [['source'=>0,'fileId'=>'office','text'=>'The office opens at 09:00. It does not open on Sunday.']];
$allowed = ['office'=>['id'=>1,'name'=>'hours.txt']];
$draft = ['answerable'=>true,'sentences'=>[
    ['text'=>'You can visit the office from 9 a.m.','evidence'=>[['source'=>0,'quote'=>'The office opens at 09:00.']]],
    ['text'=>'The office is open on Sunday.','evidence'=>[['source'=>0,'quote'=>'It does not open on Sunday.']]],
]];
$claims = GroundedPresenter::prepareDraft($draft,$sources,$allowed);
check(count($claims)===2,'exact evidence alone does not assert semantic approval');
$answer = GroundedPresenter::finish($claims,['answersQuestion'=>true,'specificSubjectSupported'=>true,'verdicts'=>[['sentence'=>0,'supported'=>true],['sentence'=>1,'supported'=>false]]]);
check($answer['content']==='You can visit the office from 9 a.m. [1]' && count($answer['citations'])===1,'approved paraphrase retained and reversed negation rejected');
check($answer['citations'][0]['quote']==='The office opens at 09:00.','source quotation retained outside natural answer');
$bad = $draft;
$bad['sentences'][0]['evidence'][]=['source'=>0,'quote'=>'Visitors receive free meals.'];
check(count(GroundedPresenter::prepareDraft($bad,$sources,$allowed))===1,'one invalid evidence rejects entire associated sentence');
$bad['sentences']=[$bad['sentences'][0]];
check(GroundedPresenter::prepareDraft($bad,$sources,$allowed)===[],'no unsupported sentence survives partial evidence');
foreach ([[], ['answersQuestion'=>true,'specificSubjectSupported'=>true,'verdicts'=>[]], ['answersQuestion'=>true,'specificSubjectSupported'=>true,'verdicts'=>[['sentence'=>0,'supported'=>true],['sentence'=>0,'supported'=>true]]], ['answersQuestion'=>true,'specificSubjectSupported'=>true,'verdicts'=>[['sentence'=>0,'supported'=>true],['sentence'=>99,'supported'=>true]]], ['answersQuestion'=>true,'specificSubjectSupported'=>true,'verdicts'=>[['sentence'=>0,'supported'=>'true'],['sentence'=>1,'supported'=>true]]]] as $index=>$review) {
    check(GroundedPresenter::finish($claims,$review)['citations']===[],"malformed review $index fails closed");
}
check(GroundedPresenter::finish($claims,['answersQuestion'=>true,'specificSubjectSupported'=>true,'verdicts'=>[['sentence'=>0,'supported'=>false],['sentence'=>1,'supported'=>false]]])['citations']===[],'all rejected claims produce refusal');
$zh = ['answerable'=>true,'sentences'=>[['text'=>'办公室上午九点开始办公。','evidence'=>[['source'=>0,'quote'=>'The office opens at 09:00.']]]]];
$zhClaims = GroundedPresenter::prepareDraft($zh,$sources,$allowed);
check(GroundedPresenter::finish($zhClaims,['answersQuestion'=>true,'specificSubjectSupported'=>true,'verdicts'=>[['sentence'=>0,'supported'=>true]]],'几点开门？')['content']==='办公室上午九点开始办公。 [1]','approved Chinese translation remains natural');
check(str_contains(GroundedPresenter::finish([],[],'几点开门？')['content'],'所选资料'),'Chinese question has Chinese refusal');
$slideAllowed=['office'=>['id'=>0,'name'=>'Deck · Slide 1','presentationId'=>7,'page'=>1]];
$slide=GroundedPresenter::prepareDraft($zh,$sources,$slideAllowed);
check($slide[0]['citations'][0]['presentationId']===7 && $slide[0]['citations'][0]['page']===1,'slide citations retain trusted deck and page');
$long=$zh; $long['sentences'][0]['text']=str_repeat('a',501);
check(GroundedPresenter::prepareDraft($long,$sources,$allowed)===[],'speech paragraph length bounded');
$answer=GroundedPresenter::finish($claims,['answersQuestion'=>true,'specificSubjectSupported'=>true,'verdicts'=>[['sentence'=>1,'supported'=>true],['sentence'=>0,'supported'=>true]]]);
check(substr_count($answer['content'],"\n\n")===1,'verified sentences stay separate for audio highlighting');
check(GroundedPresenter::finish($claims,['answersQuestion'=>false,'verdicts'=>[['sentence'=>0,'supported'=>true],['sentence'=>1,'supported'=>true]]])['citations']===[],'supported but irrelevant answer fails direct-answer gate');
check(GroundedPresenter::finish($claims,['verdicts'=>[['sentence'=>0,'supported'=>true],['sentence'=>1,'supported'=>true]]])['citations']===[],'missing relevance decision fails closed');
check(GroundedPresenter::finish($claims,['answersQuestion'=>true,'specificSubjectSupported'=>false,'verdicts'=>[['sentence'=>0,'supported'=>true],['sentence'=>1,'supported'=>true]]])['citations']===[],'unsupported subject subtype fails closed despite relevant supported parent category');
$taskReview=['answersQuestion'=>false,'specificSubjectSupported'=>false,'verdicts'=>[['sentence'=>0,'supported'=>true],['sentence'=>1,'supported'=>false]]];
check(GroundedPresenter::finish($claims,$taskReview,'Present this slide.','en','slide')['content']==='You can visit the office from 9 a.m. [1]','slide narration uses factual sentence verdicts without audience-question scope gate');
check(GroundedPresenter::finish($claims,$taskReview,'When does it open?','en','answer')['citations']===[],'audience question still requires exact subject and answer relevance');
check(GroundedPresenter::finish($claims,['verdicts'=>[['sentence'=>0,'supported'=>false],['sentence'=>1,'supported'=>false]]],'Present this slide.','en','slide')['citations']===[],'slide mode never bypasses per-sentence factual rejection');


