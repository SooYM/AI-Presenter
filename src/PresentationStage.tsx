import {forwardRef,useCallback,useEffect,useImperativeHandle,useRef,useState,type ReactNode} from 'react';
import {ChevronLeftIcon,ChevronRightIcon,PauseIcon,PlayIcon,QuestionMarkCircledIcon,EnterFullScreenIcon,ExitFullScreenIcon,FileTextIcon,EyeOpenIcon,EyeClosedIcon} from '@radix-ui/react-icons';
import {speechParts} from './useSpeechPlayback';
import type {Deck,Slide,PresentationPhase,PresenterMessage} from './usePresentation';
export type SlideMediaHandle={playMedia:(page:number,signal:AbortSignal)=>Promise<void>;stopMedia:()=>void};
type Props={deck:Deck;slides:Slide[];page:number;phase:PresentationPhase;active:boolean;secondsLeft:number|null;narration:PresenterMessage|null;language:'en'|'zh';speaking:number|null;activeSegmentIndex:number|null;playbackProgress:number;captionsVisible:boolean;onToggleCaptions:()=>void;onScript:()=>void;focused:boolean;scriptsReady:boolean;animationsReady:boolean;scriptProgress:{preparedPages:number;pageCount:number}|null;scriptError:string;preparingScript:boolean;onPrepareScript:()=>void;answer:PresenterMessage|null;audienceQuestion:string;questionForm?:ReactNode;onFocus:()=>void;onExit:()=>void;onToggle:()=>void;onPage:(page:number)=>void;onQuestion:()=>void;onImageError:()=>void};
function OneLineCaption({message,activeIndex,progress}:{message:PresenterMessage;activeIndex:number|null;progress:number}){
  const line=useRef<HTMLDivElement>(null),manual=useRef(false);
  const [lastIndex,setLastIndex]=useState(0);
  useEffect(()=>{setLastIndex(0);},[message.id]);
  useEffect(()=>{if(activeIndex!==null)setLastIndex(activeIndex);},[activeIndex]);
  const index=activeIndex??lastIndex,text=(speechParts(message)[index]||speechParts(message)[0]).replace(/\s+/gu,' ');
  useEffect(()=>{manual.current=false;if(line.current)line.current.scrollLeft=0;},[message.id,index]);
  useEffect(()=>{if(activeIndex!==null&&!manual.current&&line.current)line.current.scrollLeft=(line.current.scrollWidth-line.current.clientWidth)*progress;},[progress,activeIndex]);
  return <div ref={line} className="caption-line" data-testid="caption-line" tabIndex={0} role="region" aria-label="Current spoken line; scroll horizontally for the full text" onPointerDown={()=>{manual.current=true;}} onWheel={()=>{manual.current=true;}}><span className="speaking-segment" data-testid="speaking-segment" data-active={activeIndex!==null}>{text}</span></div>;
}
export const PresentationStage=forwardRef<SlideMediaHandle,Props>(function PresentationStage(props,ref){
  const slide=props.slides.find(value=>value.page===props.page),zh=props.language==='zh';
  const video=useRef<HTMLVideoElement|null>(null),cancelMedia=useRef<(()=>void)|null>(null),retryMedia=useRef<(()=>void)|null>(null),mediaAttemptedPage=useRef<number|null>(null);
  const [videoIssue,setVideoIssue]=useState(false),[animationState,setAnimationState]=useState('idle');
  const mediaCurrent=useRef({slide,videoIssue});mediaCurrent.current={slide,videoIssue};
  const stopMedia=useCallback(()=>{cancelMedia.current?.();cancelMedia.current=null;retryMedia.current=null;video.current?.pause();},[]);
  const playMedia=useCallback(async(page:number,signal:AbortSignal)=>{
    signal.throwIfAborted();mediaAttemptedPage.current=page;const value=mediaCurrent.current,player=video.current,audible=!!value.slide?.containsVideo;
    if(value.slide?.page!==page)return;
    if(audible&&(value.slide.videoStatus!=='ready'||!value.slide.videoUrl||!player))throw new Error('This slide video is unavailable. Retry media preparation in settings.');
    if(!audible&&(value.slide.animationStatus!=='ready'||!value.slide.animationUrl||value.videoIssue||!player))return;
    if(!player)return;
    stopMedia();player.muted=!audible;player.currentTime=0;
    await new Promise<void>((resolve,reject)=>{
      let done=false;
      const finish=(error?:Error)=>{if(done)return;done=true;signal.removeEventListener('abort',cancel);player.removeEventListener('ended',ended);player.removeEventListener('error',failed);player.removeEventListener('play',playing);if(cancelMedia.current===cancel)cancelMedia.current=null;retryMedia.current=null;error?reject(error):resolve();};
      const cancel=()=>{player.pause();setAnimationState(value=>value==='ended'?value:'paused');finish(new DOMException('Slide media paused.','AbortError'));};
      const ended=()=>{setAnimationState('ended');finish();};
      const failed=()=>{player.pause();if(audible){setAnimationState('error');retryMedia.current=()=>{player.load();attempt();};}else{setVideoIssue(true);setAnimationState('fallback');finish();}};
      const playing=()=>setAnimationState('playing');
      const attempt=()=>{if(done||signal.aborted)return;setAnimationState('starting');void player.play().catch(error=>{if(done||signal.aborted)return;if(audible){setAnimationState(error?.name==='NotAllowedError'?'blocked':'error');retryMedia.current=attempt;}else failed();});};
      cancelMedia.current=cancel;signal.addEventListener('abort',cancel,{once:true});player.addEventListener('ended',ended);player.addEventListener('error',failed);player.addEventListener('play',playing);attempt();
    });
  },[stopMedia]);
  useImperativeHandle(ref,()=>({playMedia,stopMedia}),[playMedia,stopMedia]);
  useEffect(()=>{stopMedia();setVideoIssue(false);setAnimationState('idle');return stopMedia;},[props.page,slide?.animationUrl,slide?.videoUrl,stopMedia]);
  useEffect(()=>{mediaAttemptedPage.current=null;},[props.page]);
  const audibleVideo=!!slide?.containsVideo;
  const animated=audibleVideo?slide?.videoStatus==='ready'&&!!slide.videoUrl:slide?.animationStatus==='ready'&&!!slide.animationUrl&&!videoIssue;
  const mediaUrl=audibleVideo?slide?.videoUrl:slide?.animationUrl;
  const animationNotice=videoIssue?(zh?'动画无法播放，现显示静态幻灯片。':'Animation could not play. Showing the static slide.'):slide?.animationStatus==='pending'?(zh?'PowerPoint 动画准备中，现显示静态幻灯片。':'PowerPoint animation is preparing. Showing the static slide.'):slide?.animationStatus==='failed'?(zh?'动画准备失败，现显示静态幻灯片。':'Animation is unavailable. Showing the static slide.'):animated&&animationState==='idle'&&mediaAttemptedPage.current===props.page?(zh?'动画已准备好。暂停并继续此页以播放动画。':'Animation is ready. Pause and resume this slide to play it.'):'';
  const caption=props.phase==='video'?null:props.focused&&props.audienceQuestion?props.answer:props.narration;
  const states:Record<PresentationPhase,string>=zh?{paused:'演示已暂停',preparing:'正在准备讲解…',speaking:'正在讲解',video:'正在播放视频',questions:'欢迎提问',answering:'正在聆听及回答',completed:'演示已结束'}:{paused:'Presentation paused',preparing:'Preparing this slide…',speaking:'Presenting',video:'Playing slide video',questions:'Questions from the floor',answering:'Listening and answering',completed:'Presentation complete'};
  return <section className={`presentation-stage ${props.focused?'is-focused':''} ${props.questionForm?'has-question-form':''} ${props.captionsVisible?'with-captions':'without-captions'}`} data-testid="presentation-stage" data-focused={props.focused} aria-label="Slide presentation">
    <div className="presentation-heading"><span className="deck-name">{props.deck.name}</span><span className="page-counter" aria-label={`Slide ${props.page} of ${props.deck.pageCount}`}>{props.page} / {props.deck.pageCount}</span>{props.scriptsReady&&!props.focused&&<span className="script-saved" data-testid="script-saved">{zh?'讲稿已保存':'Script saved'}</span>}<button className="icon-button script-button" data-testid="view-script" aria-label="View / edit script" title={zh?'查看 / 编辑讲稿':'View / edit script'} onClick={props.onScript}><FileTextIcon/></button></div>
    <div className="slide-frame" data-animation-state={animationState}>{animated&&slide?<video ref={video} key={mediaUrl} data-testid="slide-animation" src={mediaUrl!} poster={slide.imageUrl} preload="metadata" muted={!audibleVideo} playsInline onError={()=>{if(!audibleVideo){setVideoIssue(true);setAnimationState('fallback');}}} aria-label={`${audibleVideo?'Slide video with audio':'PowerPoint animation'} for slide ${props.page}`}/>:slide?<img key={slide.imageUrl} src={slide.imageUrl} alt={`Slide ${props.page} of ${props.deck.pageCount}: ${slide.title||props.deck.name}`} onError={props.onImageError}/>:<p role="status">{zh?'正在载入页面…':'Loading slide…'}</p>}</div>
    <div className="presentation-status" data-testid="presentation-status" data-phase={props.phase} data-page={props.page} role="status"><span className="status-dot"/>{states[props.phase]}{props.phase==='questions'&&props.secondsLeft!==null&&<span>{zh?`${props.secondsLeft} 秒后继续`:`Continuing in ${props.secondsLeft}s`}</span>}</div>
    {!audibleVideo&&animationNotice&&<p className="animation-notice" data-testid="animation-notice" role="status">{animationNotice}</p>}
    {audibleVideo&&(animationState==='blocked'||animationState==='error')&&<div className="video-playback-notice" role="alert" data-testid="video-playback-notice"><span>{animationState==='blocked'?(zh?'浏览器需要您点击后才能播放有声视频。':'Tap Play video to allow playback with sound.'):(zh?'视频无法播放。请重试；演示将等待。':'Video could not play. Retry playback; presentation will wait.')}</span><button className="record-button" data-testid="play-slide-video" onClick={()=>retryMedia.current?.()}><PlayIcon/>{animationState==='error'?(zh?'重试视频':'Retry video'):(zh?'播放视频':'Play video')}</button></div>}
    {audibleVideo&&slide?.videoStatus==='failed'&&<p className="animation-notice" role="alert">{zh?'视频准备失败。请在设置中重试；此页不会自动跳过。':'Video preparation failed. Retry in settings; this content will not be skipped.'}</p>}
    {!props.scriptsReady&&<div className="script-preparation" data-testid="script-preparation" role="status">{props.scriptError?<><span>{props.scriptError}</span><button className="text-button" onClick={props.onPrepareScript}>{zh?'重试脚本准备':'Retry script preparation'}</button></>:<span>{props.scriptProgress?(zh?'正在准备缺少的讲稿':'Preparing missing script'):(zh?'正在载入已保存讲稿…':'Loading saved script…')}{props.scriptProgress?` · ${props.scriptProgress.preparedPages} / ${props.scriptProgress.pageCount}`:''}</span>}</div>}
    <div className={`slide-caption ${props.captionsVisible?'':'captions-hidden'}`} aria-label="Presentation captions">{props.captionsVisible&&caption&&<OneLineCaption message={caption} activeIndex={props.speaking===caption.id?props.activeSegmentIndex:null} progress={props.playbackProgress}/>}<button className="text-button caption-toggle" data-testid="caption-toggle" aria-pressed={props.captionsVisible} aria-label={props.captionsVisible?'Hide captions':'Show captions'} onClick={props.onToggleCaptions}>{props.captionsVisible?<EyeClosedIcon/>:<EyeOpenIcon/>}<span className="caption-toggle-label">{props.captionsVisible?(zh?'隐藏字幕':'Hide captions'):(zh?'显示字幕':'Show captions')}</span></button></div>
    {props.questionForm&&<div className="focus-question-panel">{props.questionForm}</div>}
    <div className="presentation-controls"><button className="icon-button" data-testid="presentation-previous" aria-label="Previous slide" disabled={props.page<=1} onClick={()=>props.onPage(props.page-1)}><ChevronLeftIcon/></button><button className="record-button" data-testid="presentation-toggle" disabled={!props.active&&(!props.scriptsReady||!props.animationsReady)} onClick={props.onToggle}>{props.active?<><PauseIcon/>{zh?'暂停':'Pause'}</>:<><PlayIcon/>{!props.scriptsReady?(zh?'正在准备讲稿…':'Preparing script…'):!props.animationsReady?(zh?'正在准备媒体…':'Preparing media…'):props.phase==='completed'?(zh?'重新演示':'Present again'):props.focused?(zh?'继续':'Resume'):(zh?'开始 / 继续':'Start / resume')}</>}</button><button className="icon-button" data-testid="presentation-next" aria-label="Next slide" disabled={props.page>=props.deck.pageCount} onClick={()=>props.onPage(props.page+1)}><ChevronRightIcon/></button><button className="text-button" data-testid="presentation-question" onClick={props.onQuestion}><QuestionMarkCircledIcon/>{zh?'提问':'Ask a question'}</button>{props.focused?<button className="text-button" data-testid="presentation-exit" onClick={props.onExit}><ExitFullScreenIcon/>{zh?'退出':'Exit'}</button>:<button className="text-button" data-testid="presentation-fullscreen" onClick={props.onFocus}><EnterFullScreenIcon/>{zh?'全屏':'Fullscreen'}</button>}</div>
  </section>;
});
