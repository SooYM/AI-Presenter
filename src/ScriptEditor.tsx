import {useEffect,useRef,useState} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import type {Deck,Slide,PresentationApi} from './usePresentation';
type ScriptPage={page:number;content:string;revision:string;source:'generated'|'manual';updatedAt:string};
type Props={open:boolean;deck:Deck|null;slides:Slide[];language:'en'|'zh';page:number;api:PresentationApi;onClose:()=>void;onSaved:(page:number,content:string)=>void};
export function ScriptEditor(props:Props){
  const dialog=useRef<HTMLDialogElement>(null);
  const [pages,setPages]=useState<ScriptPage[]>([]),[page,setPage]=useState(1),[draft,setDraft]=useState('');
  const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const emptyAllowed=props.slides.some(slide=>slide.page===page&&slide.videoOnly);
  const selected=pages.find(value=>value.page===page),dirty=!!selected&&selected.content!==draft,zh=props.language==='zh';
  const load=async(signal?:AbortSignal)=>{
    if(!props.deck)return;setLoading(true);setError('');setNotice('');
    try{const result=await props.api<{pages:ScriptPage[]}>('script',undefined,signal,{id:props.deck.id,language:props.language});signal?.throwIfAborted();setPages(result.pages);const initial=result.pages.find(value=>value.page===props.page)||result.pages[0];setPage(initial?.page||props.page);setDraft(initial?.content||'');}
    catch(cause){if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Could not load the saved script.');}
    finally{if(!signal?.aborted)setLoading(false);}
  };
  useEffect(()=>{
    if(!props.open){dialog.current?.close();return;}
    dialog.current?.showModal();const request=new AbortController();void load(request.signal);return()=>request.abort();
  },[props.open,props.deck?.id,props.language]);
  async function save(){
    if(!selected||!props.deck||(!draft.trim()&&!emptyAllowed))return;setSaving(true);setError('');setNotice('');
    try{const result=await props.api<{page:ScriptPage}>('save-script',{id:props.deck.id,page,language:props.language,content:draft,revision:selected.revision});setPages(values=>values.map(value=>value.page===page?result.page:value));setDraft(result.page.content);props.onSaved(page,result.page.content);setNotice(zh?'已保存。演示将逐字朗读此讲稿。':'Saved. The presenter will read this script verbatim.');}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not save the script. Your edits remain here.');}
    finally{setSaving(false);}
  }
  return <dialog ref={dialog} className="script-editor" aria-labelledby="script-editor-title" onCancel={event=>{if(saving)event.preventDefault();else props.onClose();}} onKeyDown={event=>{if(event.key==='Escape')event.stopPropagation();}}>
    <div className="drawer-heading"><h2 id="script-editor-title">{zh?'查看 / 编辑讲稿':'View / edit script'}</h2><button className="icon-button" disabled={saving} aria-label="Close script editor" onClick={props.onClose}><Cross2Icon/></button></div>
    <p className="script-editor-deck">{props.deck?.name} · {zh?'中文':'English'}</p>
    {error&&<div className="notice error" role="alert"><span>{error}</span><button className="text-button" disabled={saving} onClick={()=>void load()}>{zh?'载入已保存版本':'Reload saved version'}</button></div>}
    {notice&&<div className="notice success" role="status">{notice}</div>}
    {loading?<p role="status">{zh?'正在载入已保存讲稿…':'Loading saved script…'}</p>:pages.length?<>
      <label htmlFor="script-page">{zh?'幻灯片':'Slide'}</label><select id="script-page" value={page} disabled={saving||dirty} onChange={event=>{const next=Number(event.target.value);setPage(next);setDraft(pages.find(value=>value.page===next)?.content||'');setNotice('');setError('');}}>{pages.map(value=><option key={value.page} value={value.page}>{value.page} / {props.deck?.pageCount} · {value.source==='manual'?(zh?'已编辑':'Edited'):(zh?'已生成':'Generated')}</option>)}</select>
      <label htmlFor="script-content">{zh?'演讲稿文字':'Spoken script'}</label><textarea id="script-content" data-testid="script-content" value={draft} disabled={saving} maxLength={12000} onChange={event=>{setDraft(event.target.value);setNotice('');}}/>
      <p className="script-editor-hint">{zh?'更改仅适用于此幻灯片及语言。支持文档仍用于回答提问。':'Edits stay with this slide and language. Supporting documents remain available for questions.'}{dirty&&(zh?' 请先保存，或取消更改。':' Save or cancel your changes before switching slides.')}</p>
      <div className="dialog-actions"><button className="secondary-button" disabled={saving} onClick={props.onClose}>{zh?'取消':'Cancel'}</button><button className="primary-button" data-testid="save-script" disabled={saving||!dirty||(!draft.trim()&&!emptyAllowed)} onClick={()=>void save()}>{saving?(zh?'正在保存…':'Saving…'):(zh?'保存讲稿':'Save script')}</button></div>
    </>:<p>{zh?'尚未有已保存讲稿。请先准备此语言的讲稿。':'No script is saved yet. Prepare this presentation language first.'}</p>}
  </dialog>;
}
