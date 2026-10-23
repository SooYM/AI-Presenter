import {useCallback,useEffect,useLayoutEffect,useRef} from 'react';

/** Keep reading inside the transcript; never scroll the page or its composer. */
export function useConversationScroll(lastAssistantId:number|undefined,pendingQuestion:string,ready=true){
  const container=useRef<HTMLDivElement>(null),following=useRef(true),frame=useRef<number|undefined>(undefined);
  const forceReply=useCallback((id:number)=>{
    following.current=true;
    const reveal=()=>{
      const panel=container.current,reply=panel?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      if(!panel||!reply||!panel.clientHeight||!reply.offsetHeight)return false;
      panel.scrollTop+=reply.getBoundingClientRect().top-panel.getBoundingClientRect().top-16;
      return true;
    };
    window.cancelAnimationFrame(frame.current||0);
    if(!reveal())frame.current=requestAnimationFrame(reveal);
  },[]);
  const followActive=useCallback((element:HTMLElement,progress=0)=>{
    const panel=container.current;
    if(!following.current||!panel||!panel.clientHeight||!panel.contains(element)||!element.offsetHeight)return;
    const bounds=element.getBoundingClientRect(),top=panel.scrollTop+bounds.top-panel.getBoundingClientRect().top;
    const available=Math.max(1,panel.clientHeight-40);
    if(bounds.height>available){
      // Older whole-answer audio has no segment cues. Track its viewport from actual audio progress.
      panel.scrollTop=top-16+(bounds.height-available)*Math.max(0,Math.min(1,progress));
    }else if(top<panel.scrollTop+16||top+bounds.height>panel.scrollTop+panel.clientHeight-24){
      panel.scrollTop=top-16;
    }
  },[]);
  useLayoutEffect(()=>{if(lastAssistantId!==undefined)forceReply(lastAssistantId);else following.current=true;},[lastAssistantId,forceReply,ready]);
  useLayoutEffect(()=>{if(pendingQuestion&&following.current&&container.current)container.current.scrollTop=container.current.scrollHeight;},[pendingQuestion,ready]);
  useEffect(()=>{
    const panel=container.current;if(!panel)return;
    const manual=()=>{following.current=false;};
    const keyboard=(event:KeyboardEvent)=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))manual();};
    panel.addEventListener('wheel',manual,{passive:true});panel.addEventListener('touchstart',manual,{passive:true});panel.addEventListener('pointerdown',manual);panel.addEventListener('keydown',keyboard);
    return()=>{panel.removeEventListener('wheel',manual);panel.removeEventListener('touchstart',manual);panel.removeEventListener('pointerdown',manual);panel.removeEventListener('keydown',keyboard);window.cancelAnimationFrame(frame.current||0);};
  },[ready]);
  return{container,forceReply,followActive};
}
