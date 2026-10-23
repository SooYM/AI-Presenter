import {useCallback, useEffect, useRef, useState} from 'react';

export type PresenterMessage = {id:number;role:'user'|'assistant';content:string;speechSegments?:string[];citations:{documentId:number;name:string;quote:string}[];createdAt:string};
export type Deck = {id:number;name:string;status:'processing'|'ready'|'failed';pageCount:number;preparedPages:number;error?:string|null;createdAt:string};
export type Slide = {page:number;title:string;imageUrl:string;textPreview?:string;animationStatus?:'none'|'pending'|'ready'|'failed';animationUrl?:string|null;animationDuration?:number|null;animationError?:string|null;containsVideo?:boolean;videoOnly?:boolean;videoStatus?:'none'|'pending'|'ready'|'failed';videoUrl?:string|null;videoDuration?:number|null;videoError?:string|null};
export type QuestionPolicy={presentationId:number;pages:number[];revision:string};
export type PresentationPhase = 'paused'|'preparing'|'speaking'|'video'|'questions'|'answering'|'completed';
export type PresentationApi = <T>(action:string,body?:object|FormData,signal?:AbortSignal,params?:Record<string,string|number>)=>Promise<T>;
type ScriptProgress={presentationId:number;language:'en'|'zh';scope:string;preparedPages:number;pageCount:number;done:boolean;pages:number[]};
type Progress = {presentationId:number;page:number;language:'en'|'zh';state:string};
type Options = {enabled:boolean;api:PresentationApi;documentIds:number[];play:(message:PresenterMessage,signal:AbortSignal,onStart?:()=>void)=>Promise<void>;playMedia:(page:number,signal:AbortSignal)=>Promise<void>;prefetch:(message:PresenterMessage,signal:AbortSignal)=>Promise<void>;stop:()=>void;startQuestions:(signal:AbortSignal)=>void;stopQuestions:()=>void;onError:(message:string)=>void;onNarration:(message:PresenterMessage)=>void};

export function usePresentation(options:Options) {
  const latest=useRef(options);latest.current=options;
  const [scriptProgress,setScriptProgress]=useState<ScriptProgress|null>(null);
  const [scriptError,setScriptError]=useState('');
  const [preparingScript,setPreparingScript]=useState(false);
  const [preparedKey,setPreparedKey]=useState('');
  const scriptRequest=useRef<AbortController|null>(null);
  const preparedKeyRef=useRef('');
  const nextNarration=useRef<{key:string;message:PresenterMessage|null}|null>(null);
  const [questionPolicy,setQuestionPolicy]=useState<QuestionPolicy|null>(null);
  const policyRef=useRef<QuestionPolicy|null>(null);
  const [policyError,setPolicyError]=useState('');
  const [animationProgress,setAnimationProgress]=useState<{page:number;index:number;total:number}|null>(null);
  const animationRequest=useRef<AbortController|null>(null);
  const [decks,setDecks]=useState<Deck[]>([]);
  const [deck,setDeck]=useState<Deck|null>(null);
  const [slides,setSlides]=useState<Slide[]>([]);
  const [page,setPage]=useState(1);
  const [language,setLanguageState]=useState<'en'|'zh'>('en');
  const [questionSeconds,setQuestionSecondsState]=useState(8);
  const [phase,setPhase]=useState<PresentationPhase>('paused');
  const [active,setActive]=useState(false);
  const [secondsLeft,setSecondsLeft]=useState<number|null>(null);
  const [narration,setNarration]=useState<PresenterMessage|null>(null);
  const current=useRef({deck:null as Deck|null,slides:[] as Slide[],page:1,language:'en' as 'en'|'zh',questionSeconds:8});
  current.current={deck,slides,page,language,questionSeconds};
  const running=useRef(false),generation=useRef(0),controller=useRef<AbortController|null>(null);
  const timer=useRef<number|undefined>(undefined),deadline=useRef(0),floorResolve=useRef<(()=>void)|null>(null);
  const waitingForQuestion=useRef(false),answering=useRef(false),mounted=useRef(true);
  const prepareController=useRef<AbortController|null>(null);
  const narratedPage=useRef<number|null>(null);
  const clearTimer=()=>{window.clearInterval(timer.current);timer.current=undefined;setSecondsLeft(null);};
  const persist=useCallback(async(state:string,signal?:AbortSignal)=>{
    const value=current.current;if(!value.deck)return;
    await latest.current.api('presentation-progress',{id:value.deck.id,page:value.page,language:value.language,state},signal);
  },[]);
  const pause=useCallback((save=true)=>{
    const wasRunning=running.current;
    running.current=false;generation.current++;
    controller.current?.abort();controller.current=null;
    window.clearInterval(timer.current);timer.current=undefined;
    floorResolve.current=null;waitingForQuestion.current=false;answering.current=false;
    latest.current.stopQuestions();latest.current.stop();
    if(mounted.current){setActive(false);setPhase('paused');setSecondsLeft(null);}
    if(save&&wasRunning)void persist('paused').catch(error=>latest.current.onError(error.message));
  },[persist]);
  const refresh=useCallback(async()=>{
    const value=await latest.current.api<{presentations:Deck[]}>('presentations');setDecks(value.presentations);return value.presentations;
  },[]);
  const select=useCallback(async(id:number,restored?:Progress)=>{
    pause(false);
    const data=await latest.current.api<{presentation:Deck;slides:Slide[];questionPolicy?:QuestionPolicy}>('presentation',undefined,undefined,{id});
    if(data.presentation.status!=='ready')throw new Error('This deck is not ready. Finish preparing it in settings.');
    const policy=data.questionPolicy||(await latest.current.api<{policy:QuestionPolicy}>('question-policy',undefined,undefined,{id})).policy;
    policyRef.current=policy;setQuestionPolicy(policy);setPolicyError('');
    const nextPage=Math.min(data.presentation.pageCount,Math.max(1,restored?.page||1));
    current.current={...current.current,deck:data.presentation,slides:data.slides,page:nextPage,language:restored?.language||current.current.language};
    setDeck(data.presentation);setSlides(data.slides);setPage(nextPage);setNarration(null);
    if(restored)setLanguageState(restored.language);
    if(!restored)await persist('paused');
  },[pause,persist]);
  useEffect(()=>{
    if(!options.enabled)return;let alive=true;
    void Promise.all([refresh(),latest.current.api<{progress:Progress|null}>('presentation-progress')]).then(async([list,result])=>{
      if(!alive)return;
      if(result.progress&&list.some(value=>value.id===result.progress!.presentationId&&value.status==='ready'))await select(result.progress.presentationId,result.progress);
    }).catch(error=>{if(alive)latest.current.onError(error.message);});
    return()=>{alive=false;};
  },[options.enabled,refresh,select]);
  const refreshQuestionPolicy=useCallback(async()=>{
    if(!current.current.deck)return;const result=await latest.current.api<{policy:QuestionPolicy}>('question-policy',undefined,undefined,{id:current.current.deck.id});policyRef.current=result.policy;setQuestionPolicy(result.policy);setPolicyError('');
  },[]);
  const saveQuestionPages=useCallback(async(pages:number[])=>{
    if(!current.current.deck||!policyRef.current)return;pause();setPolicyError('');
    try{const result=await latest.current.api<{policy:QuestionPolicy}>('save-question-policy',{id:current.current.deck.id,pages,revision:policyRef.current.revision});policyRef.current=result.policy;setQuestionPolicy(result.policy);}
    catch(error){setPolicyError(error instanceof Error?error.message:'Could not save question settings.');throw error;}
  },[pause]);
  const prepareAnimations=useCallback(async(retry=false)=>{
    const value=current.current;if(!value.deck)return;
    animationRequest.current?.abort();const request=new AbortController();animationRequest.current=request;const id=value.deck.id;
    const pending=value.slides.filter(slide=>slide.animationStatus==='pending'||slide.videoStatus==='pending'||(retry&&(slide.animationStatus==='failed'||slide.videoStatus==='failed')));
    const update=(page:number,animation:Partial<Slide>)=>{if(current.current.deck?.id!==id)return;const next=current.current.slides.map(slide=>slide.page===page?{...slide,...animation}:slide);current.current.slides=next;setSlides(next);};
    try{for(let index=0;index<pending.length;index++){
      const slide=pending[index];setAnimationProgress({page:slide.page,index:index+1,total:pending.length});
      try{const result=await latest.current.api<{animation:Partial<Slide>}>('prepare-animation',{id,page:slide.page},request.signal);request.signal.throwIfAborted();update(slide.page,result.animation);}
      catch(error){if(request.signal.aborted)return;update(slide.page,slide.containsVideo?{videoStatus:'failed',videoError:error instanceof Error?error.message:'Video preparation failed.'}:{animationStatus:'failed',animationError:error instanceof Error?error.message:'Animation preparation failed.'});}
    }}finally{if(animationRequest.current===request){animationRequest.current=null;setAnimationProgress(null);}}
  },[]);
  useEffect(()=>{void prepareAnimations();return()=>animationRequest.current?.abort();},[deck?.id,prepareAnimations]);
  const scopeKey=()=>{const value=current.current;return `${value.deck?.id}:${value.language}`;};
  const prepareScript=useCallback(async()=>{
    const value=current.current;if(!value.deck)return;
    scriptRequest.current?.abort();const request=new AbortController();scriptRequest.current=request;
    const key=scopeKey(),body={id:value.deck.id,language:value.language};
    preparedKeyRef.current='';setPreparedKey('');setPreparingScript(true);setScriptError('');setScriptProgress(null);nextNarration.current=null;
    try{
      let result=await latest.current.api<{script:ScriptProgress}>('script-status',body,request.signal);
      request.signal.throwIfAborted();if(key!==scopeKey())return;setScriptProgress(result.script);
      for(let step=0;!result.script.done&&step<41;step++){
        result=await latest.current.api<{script:ScriptProgress}>('prepare-script',body,request.signal);
        request.signal.throwIfAborted();if(key!==scopeKey())return;setScriptProgress(result.script);
      }
      if(!result.script.done)throw new Error('Script preparation did not finish. Retry to continue from saved pages.');
      preparedKeyRef.current=key;setPreparedKey(key);
    }catch(error){if(!request.signal.aborted&&key===scopeKey())setScriptError(error instanceof Error?error.message:'Could not prepare the script. Retry to continue.');}
    finally{if(scriptRequest.current===request){scriptRequest.current=null;setPreparingScript(false);}}
  },[]);
  useEffect(()=>{
    pause();void prepareScript();
    return()=>{scriptRequest.current?.abort();};
  },[deck?.id,language,prepareScript,pause]);
  const scriptsReady=!!deck&&preparedKey===`${deck.id}:${language}`;
  const animationsReady=!animationProgress&&!slides.some(slide=>slide.animationStatus==='pending'||(slide.containsVideo&&slide.videoStatus!=='ready'));
  const beginCountdown=useCallback(()=>{
    if(!running.current||!waitingForQuestion.current||answering.current||timer.current!==undefined)return;
    deadline.current=Date.now()+current.current.questionSeconds*1000;setSecondsLeft(current.current.questionSeconds);
    timer.current=window.setInterval(()=>{
      const remaining=Math.max(0,Math.ceil((deadline.current-Date.now())/1000));setSecondsLeft(remaining);
      if(remaining===0){clearTimer();waitingForQuestion.current=false;floorResolve.current?.();floorResolve.current=null;}
    },100);
  },[]);
  const listeningReady=useCallback(()=>{if(running.current&&waitingForQuestion.current&&!answering.current)beginCountdown();},[beginCountdown]);
  const questionStarted=useCallback(()=>{
    if(!running.current||!waitingForQuestion.current)return;
    answering.current=true;clearTimer();setPhase('answering');
  },[]);
  const questionFinished=useCallback(()=>{
    if(!running.current||!waitingForQuestion.current)return;
    answering.current=false;setPhase('questions');
    // Countdown starts when the microphone reports that it is listening again.
  },[]);
  const start=useCallback(async(explicitPage?:number)=>{
    const value=current.current;if(!latest.current.enabled||!value.deck||value.deck.status!=='ready'||document.hidden)return;
    if(animationRequest.current||value.slides.some(slide=>slide.animationStatus==='pending'||(slide.containsVideo&&slide.videoStatus!=='ready'))){latest.current.onError('Slide media is not ready. Wait for preparation, or retry failed videos in settings.');return;}
    if(preparedKeyRef.current!==scopeKey()){latest.current.onError('Prepare the full presentation script before starting.');return;}
    pause(false);const token=++generation.current;running.current=true;
    const request=new AbortController();controller.current=request;
    const valid=()=>running.current&&generation.current===token&&!request.signal.aborted;
    if(explicitPage!==undefined){current.current.page=explicitPage;setPage(explicitPage);}
    setActive(true);
    try{
      while(valid()){
        latest.current.stopQuestions();setPhase('preparing');setSecondsLeft(null);setNarration(null);
        await persist('presenting',request.signal);if(!valid())return;
        const snapshot=current.current;
        const narrationKey=`${scopeKey()}:${snapshot.page}`;
        const result=nextNarration.current?.key===narrationKey?{message:nextNarration.current.message}:await latest.current.api<{message:PresenterMessage|null}>('slide-narration',{id:snapshot.deck!.id,page:snapshot.page,language:snapshot.language},request.signal);
        nextNarration.current=null;
        if(!valid())return;
        setNarration(result.message);if(result.message)latest.current.onNarration(result.message);setPhase('speaking');
        const audibleVideo=snapshot.slides.find(slide=>slide.page===snapshot.page)?.containsVideo;
        let media=Promise.resolve();
        const playback=result.message?latest.current.play(result.message,request.signal,audibleVideo?undefined:()=>{media=latest.current.playMedia(snapshot.page,request.signal);media.catch(()=>{});}):Promise.resolve();
        if(snapshot.page<snapshot.deck!.pageCount){
          const nextPage=snapshot.page+1,nextKey=`${scopeKey()}:${nextPage}`;
          void latest.current.api<{message:PresenterMessage|null}>('slide-narration',{id:snapshot.deck!.id,page:nextPage,language:snapshot.language},request.signal).then(async upcoming=>{if(!valid())return;nextNarration.current={key:nextKey,message:upcoming.message};if(upcoming.message)await latest.current.prefetch(upcoming.message,request.signal);}).catch(()=>{/* Prefetch is optional; normal playback can retry cached speech. */});
        }
        await playback;if(!valid())return;if(audibleVideo){setNarration(null);setPhase('video');await latest.current.playMedia(snapshot.page,request.signal);}else await media;if(!valid())return; narratedPage.current=current.current.page;
        if((policyRef.current?.pages||[current.current.deck!.pageCount]).includes(current.current.page)){
        setPhase('questions');waitingForQuestion.current=true;answering.current=false;
        await persist('questions',request.signal);if(!valid())return;
        await new Promise<void>((resolve,reject)=>{
          const abort=()=>{floorResolve.current=null;reject(new DOMException('Presentation paused.','AbortError'));};
          request.signal.addEventListener('abort',abort,{once:true});
          floorResolve.current=()=>{request.signal.removeEventListener('abort',abort);resolve();};
          latest.current.startQuestions(request.signal);
        });
        if(!valid())return;
        latest.current.stopQuestions();
        }
        if(current.current.page>=current.current.deck!.pageCount){running.current=false;setActive(false);setPhase('completed');await persist('completed',request.signal);return;}
        current.current.page++;setPage(current.current.page);
      }
    }catch(error){
      if(valid()){pause(false);void persist('paused').catch(()=>{});latest.current.onError(error instanceof Error?error.message:'Presentation stopped. Resume after checking the connection.');}
    }
  },[pause,persist]);
  const go=useCallback((nextPage:number)=>{
    const value=current.current;if(!value.deck)return;
    const target=Math.max(1,Math.min(value.deck.pageCount,nextPage));const resume=running.current;
    pause(false);current.current.page=target;setPage(target);setNarration(null);
    if(resume)void start(target);else void persist('paused').catch(error=>latest.current.onError(error.message));
  },[pause,start,persist]);
  const askQuestion=useCallback((listen=true)=>{
    if(!current.current.deck)return;
    pause(false);const request=new AbortController();controller.current=request;running.current=true;
    const token=++generation.current;setActive(true);setPhase('questions');waitingForQuestion.current=true;answering.current=false;
    floorResolve.current=()=>{
      if(generation.current!==token)return;
      const value=current.current;const finished=narratedPage.current===value.page;
      if(finished&&value.page>=value.deck!.pageCount){pause(false);setPhase('completed');void persist('completed').catch(error=>latest.current.onError(error.message));}
      else{pause(false);void start(finished?value.page+1:value.page);}
    };
    if(listen)latest.current.startQuestions(request.signal);
    void persist('questions',request.signal).catch(error=>{if(!request.signal.aborted){pause(false);latest.current.onError(error.message);}});
    return request.signal;
  },[pause,persist,start]);
  const fail=useCallback((message:string)=>{if(running.current){pause();latest.current.onError(message);}},[pause]);
  const setLanguage=useCallback((value:'en'|'zh')=>{pause();current.current.language=value;setLanguageState(value);setNarration(null);void persist('paused').catch(error=>latest.current.onError(error.message));},[pause,persist]);
  const setQuestionSeconds=useCallback((value:number)=>{pause();setQuestionSecondsState(Math.max(5,Math.min(30,value)));},[pause]);
  const scriptSaved=useCallback((savedPage:number,content:string)=>{pause();nextNarration.current=null;if(current.current.page===savedPage)setNarration(value=>value?{...value,content,speechSegments:[content],citations:[]}:value);},[pause]);
  const reset=useCallback(()=>{pause(false);setDeck(null);setSlides([]);setPage(1);setNarration(null);current.current.deck=null;preparedKeyRef.current='';setPreparedKey('');setScriptProgress(null);setScriptError('');scriptRequest.current?.abort();nextNarration.current=null;animationRequest.current?.abort();setQuestionPolicy(null);policyRef.current=null;setPolicyError('');},[pause]);
  const prepare=useCallback(async(id:number)=>{
    prepareController.current?.abort();const request=new AbortController();prepareController.current=request;
    try{
      for(let step=0;step<42;step++){
        const result=await latest.current.api<{presentation:Deck;done:boolean}>('prepare-presentation',{id},request.signal);
        setDecks(values=>values.map(value=>value.id===id?result.presentation:value));
        if(result.done){await refresh();return result.presentation;}
      }
      throw new Error('Preparation did not finish. Retry preparation to continue.');
    }finally{if(prepareController.current===request)prepareController.current=null;}
  },[refresh]);
  useEffect(()=>{
    const hide=()=>{if(document.hidden&&running.current)pause();};document.addEventListener('visibilitychange',hide);
    return()=>document.removeEventListener('visibilitychange',hide);
  },[pause]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pause(false);prepareController.current?.abort();scriptRequest.current?.abort();animationRequest.current?.abort();};},[pause]);
  return{animationsReady,questionPolicy,policyError,saveQuestionPages,refreshQuestionPolicy,animationProgress,prepareAnimations,scriptSaved,scriptProgress,scriptError,preparingScript,scriptsReady,prepareScript,decks,deck,slides,page,language,questionSeconds,phase,active,secondsLeft,narration,refresh,select,start,pause,go,askQuestion,listeningReady,questionStarted,questionFinished,fail,setLanguage,setQuestionSeconds,reset,prepare};
}
