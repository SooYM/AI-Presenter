import {useCallback,useEffect,useRef,useState} from 'react';
export type SpokenMessage={id:number;content:string;speechSegments?:string[]};
export function speechParts(message:SpokenMessage){return message.speechSegments?.length?message.speechSegments:[message.content];}
export function SpokenText({message,activeIndex,progress=0,onActiveSegment}:{message:SpokenMessage;activeIndex:number|null;progress?:number;onActiveSegment?:(element:HTMLElement,progress:number)=>void}){
  const active=useRef<HTMLSpanElement|null>(null);
  useEffect(()=>{if(activeIndex!==null&&active.current)onActiveSegment?.(active.current,progress);},[activeIndex,message.id,progress,onActiveSegment]);
  return <>{speechParts(message).map((part,index)=><span key={index} ref={activeIndex===index?active:undefined} className="speaking-segment" data-testid="speaking-segment" data-active={activeIndex===index} aria-current={activeIndex===index?'true':undefined}>{index>0?'\n\n':''}{part}</span>)}</>;
}
async function fetchSpeech(message:SpokenMessage,index:number,config:{csrfToken:string;voice:string},signal:AbortSignal){
  const response=await fetch('./api/index.php?action=speech',{method:'POST',credentials:'same-origin',signal,headers:{'Content-Type':'application/json','X-CSRF-Token':config.csrfToken},body:JSON.stringify({messageId:message.id,voice:config.voice,...(message.speechSegments?.length?{segmentIndex:index}:{})})});
  if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error?.message||'AI voice is unavailable. You can still read the answer.');}
  if(!(response.headers.get('content-type')||'').startsWith('audio/'))throw new Error('The server did not return playable audio.');
  return response.blob();
}
export function useSpeechPlayback(options:{csrfToken:string;voice:string;rate:number}){
  const latest=useRef(options);latest.current=options;
  const [speaking,setSpeaking]=useState<number|null>(null),[activeSegmentIndex,setActiveIndex]=useState<number|null>(null),[audioLoading,setLoading]=useState(false),[playbackProgress,setPlaybackProgress]=useState(0);
  const controller=useRef<AbortController|null>(null),audio=useRef<HTMLAudioElement|null>(null),cancel=useRef<(()=>void)|null>(null),generation=useRef(0);
  const cache=useRef(new Map<string,Blob>()),prefetchRequests=useRef(new Set<AbortController>());
  const remember=(key:string,blob:Blob)=>{cache.current.set(key,blob);while(cache.current.size>8)cache.current.delete(cache.current.keys().next().value!);};
  const stop=useCallback(()=>{prefetchRequests.current.forEach(request=>request.abort());prefetchRequests.current.clear();generation.current++;controller.current?.abort();controller.current=null;cancel.current?.();cancel.current=null;audio.current?.pause();audio.current=null;setSpeaking(null);setActiveIndex(null);setLoading(false);setPlaybackProgress(0);},[]);
  const play=useCallback(async(message:SpokenMessage,signal?:AbortSignal,onStart?:()=>void)=>{
    stop();signal?.throwIfAborted();const token=++generation.current,request=new AbortController();controller.current=request;
    const abort=()=>request.abort();signal?.addEventListener('abort',abort,{once:true});
    const config=latest.current,parts=speechParts(message);
    const pending=new Map<number,Promise<Blob>>();
    const load=(index:number)=>{
      if(!pending.has(index)){
        const promise=(async()=>{
          const key=`${message.id}:${config.voice}:${index}`;
          const cached=cache.current.get(key);if(cached)return cached;
          const blob=await fetchSpeech(message,index,config,request.signal);request.signal.throwIfAborted();remember(key,blob);return blob;
        })();promise.catch(()=>{});pending.set(index,promise);
      }return pending.get(index)!;
    };
    setSpeaking(message.id);setLoading(true);
    try{
      for(let index=0;index<parts.length;index++){
        request.signal.throwIfAborted();const blob=await load(index);request.signal.throwIfAborted();if(generation.current!==token)throw new DOMException('Playback paused.','AbortError');
        for(let ahead=index+1;ahead<=Math.min(index+2,parts.length-1);ahead++)void load(ahead);
        const url=URL.createObjectURL(blob),player=new Audio(url);audio.current=player;player.playbackRate=latest.current.rate;
        try{await new Promise<void>((resolve,reject)=>{
          let done=false;const finish=(error?:Error)=>{if(done)return;done=true;request.signal.removeEventListener('abort',halt);player.onplay=null;player.onended=null;player.onerror=null;player.ontimeupdate=null;if(cancel.current===halt)cancel.current=null;setActiveIndex(null);error?reject(error):resolve();};
          const halt=()=>{player.pause();finish(new DOMException('Playback paused.','AbortError'));};cancel.current=halt;request.signal.addEventListener('abort',halt,{once:true});
          player.onplay=()=>{if(generation.current===token){setLoading(false);setActiveIndex(index);setPlaybackProgress(0);if(index===0)onStart?.();}};
          player.ontimeupdate=()=>{if(generation.current===token&&Number.isFinite(player.duration)&&player.duration>0)setPlaybackProgress(player.currentTime/player.duration);};
          player.onended=()=>finish();player.onerror=()=>finish(new Error('Audio could not play. Check the speaker, then resume.'));
          void player.play().catch(()=>finish(new Error('Audio could not start. Tap Listen or resume presentation to try again.')));
        });}finally{player.pause();URL.revokeObjectURL(url);if(audio.current===player)audio.current=null;pending.delete(index);}
        if(index<parts.length-1)setLoading(true);
      }
    }finally{
      request.abort();signal?.removeEventListener('abort',abort);if(generation.current===token){controller.current=null;setSpeaking(null);setActiveIndex(null);setLoading(false);}
    }
  },[stop]);
  const prefetch=useCallback(async(message:SpokenMessage,signal:AbortSignal)=>{
    signal.throwIfAborted();const config=latest.current,key=`${message.id}:${config.voice}:0`;if(cache.current.has(key))return;
    const request=new AbortController();prefetchRequests.current.add(request);const abort=()=>request.abort();signal.addEventListener('abort',abort,{once:true});
    try{const blob=await fetchSpeech(message,0,config,request.signal);request.signal.throwIfAborted();if(config.voice===latest.current.voice)remember(key,blob);}
    finally{signal.removeEventListener('abort',abort);prefetchRequests.current.delete(request);}
  },[]);
  const reset=useCallback(()=>{stop();cache.current.clear();},[stop]);
  useEffect(()=>{if(audio.current)audio.current.playbackRate=options.rate;},[options.rate]);
  useEffect(()=>{const hide=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hide);return()=>{document.removeEventListener('visibilitychange',hide);stop();};},[stop]);
  return{speaking,activeSegmentIndex,audioLoading,playbackProgress,play,prefetch,stop,reset};
}
