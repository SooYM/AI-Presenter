import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useContinuousVoice, type VoicePhase } from './useContinuousVoice';
import {usePresentation} from './usePresentation';
import {PresentationStage,type SlideMediaHandle} from './PresentationStage';
import {ScriptEditor} from './ScriptEditor';
import {useConversationScroll} from './useConversationScroll';
import {SpokenText,useSpeechPlayback} from './useSpeechPlayback';
import { ArrowUpIcon, CheckIcon, ChevronDownIcon, Cross2Icon, FileTextIcon, GearIcon, PlusIcon, ReloadIcon, SpeakerLoudIcon, StopIcon, TrashIcon } from '@radix-ui/react-icons';

type Document = { id: number; name: string; size: number; status: string; error?: string | null; createdAt: string };
type Citation = { documentId: number; name: string; quote: string };
type Message = { id: number; role: 'user' | 'assistant'; content: string; speechSegments?:string[]; kind?:'chat'|'slide-narration'; citations: Citation[]; createdAt: string };
type Session = { csrfToken: string; configured: boolean; aiConfigured: boolean };
type Confirmation = { title: string; description: string; label: string; action: () => Promise<void> };
const emptySession: Session = { csrfToken: '', configured: false, aiConfigured: false };
function readableSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export default function App() {
  const [session, setSession] = useState<Session>(emptySession);
  const sessionRef = useRef(session); sessionRef.current = session;
  const activityAt = useRef(Date.now());
  const idleReset = useRef<Promise<void> | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [connected, setConnected] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const knownReady = useRef(new Set<number>());
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [notice, setNotice] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [presentationMode,setPresentationMode]=useState(false);
  const [scriptOpen,setScriptOpen]=useState(false);
  const [captionsVisible,setCaptionsVisible]=useState(()=>{try{return localStorage.getItem('ai-presenter-captions')!=='hidden';}catch{return true;}});
  const [slideFocus,setSlideFocus]=useState(false);
  const [focusQuestionOpen,setFocusQuestionOpen]=useState(false);
  const [floorQuestion,setFloorQuestion]=useState('');
  const [floorAnswer,setFloorAnswer]=useState<Message|null>(null);
  const shellRef=useRef<HTMLDivElement>(null);
  const fullscreenSeen=useRef(false);
  const stageRef=useRef<SlideMediaHandle>(null);
  const narrationIds=useRef(new Set<number>());
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [voice, setVoice] = useState('coral');
  const [rate, setRate] = useState(1);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const speech=useSpeechPlayback({csrfToken:session.csrfToken,voice,rate});
  const {speaking,audioLoading,activeSegmentIndex,playbackProgress}=speech;
  const stopSpeech=speech.stop,playAnswer=speech.play;
  const busyRef = useRef(false);
  const libraryDialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const deckInput=useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const lastAssistantId=[...messages].reverse().find(message=>message.role==='assistant')?.id;
  const microphoneSupported = !!navigator.mediaDevices?.getUserMedia && 'MediaRecorder' in window;
  const ready = documents.filter(document => document.status === 'ready');
  const selectedReady = ready.filter(document => selected.includes(document.id));
  const hasSources=selectedReady.length>0||presentationMode;
  const working = !!busy;
  const workspaceReady = connected && session.configured;
  const conversationScroll=useConversationScroll(lastAssistantId,pendingQuestion,workspaceReady);
  useEffect(() => { busyRef.current = working; }, [working]);

  const api = useCallback(async <T,>(action: string, body?: object | FormData, signal?: AbortSignal,params?:Record<string,string|number>): Promise<T> => {
    const form = body instanceof FormData;
    const query=new URLSearchParams({action,...Object.fromEntries(Object.entries(params||{}).map(([key,value])=>[key,String(value)]))});
    const response = await fetch(`./api/index.php?${query}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'X-CSRF-Token': sessionRef.current.csrfToken, ...(!form ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('The server is unavailable. Check the PHP service and try again.');
    const data = await response.json();
    if (!response.ok) {
      if (data.error?.code === 'csrf_invalid') {
        const fresh = await fetch('./api/index.php?action=session', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (fresh.ok) { storeSession(await fresh.json()); setMessages([]); setQuestion(''); stopSpeech(); }
      }
      throw new Error(data.error?.message || 'Request failed. Please try again.');
    }
    return data as T;
  }, []);
  const continuous = useContinuousVoice({
    enabled: workspaceReady && session.aiConfigured && hasSources && microphoneSupported,
    onUtterance: voiceTurn,
    onPause: () => { stopSpeech(); setBusy(''); setPendingQuestion(''); },
    onError: message=>{presentation.fail(message);setError(message);},
    onSpeechStart:()=>presentation.questionStarted(),
    onSpeechCancelled:()=>{presentation.questionFinished();presentation.listeningReady();},
  });
  const presentation=usePresentation({enabled:workspaceReady,api,documentIds:selectedReady.map(document=>document.id),play:playAnswer,playMedia:async(page,signal)=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));signal.throwIfAborted();await stageRef.current?.playMedia(page,signal);},prefetch:speech.prefetch,stop:()=>{stopSpeech();stageRef.current?.stopMedia();},stopQuestions:continuous.pause,startQuestions:signal=>{requestAnimationFrame(()=>{if(!signal.aborted){if(microphoneSupported)void continuous.start();else presentation.fail('Microphone access is required for floor questions. Connect a microphone or use conversation mode.');}});},onError:setError,onNarration:message=>{activityAt.current=Date.now();narrationIds.current.add(message.id);setFloorAnswer(null);setFloorQuestion('');setFocusQuestionOpen(false);}});
  function openScript(){presentation.pause();continuous.pause();setScriptOpen(true);}
  function toggleCaptions(){setCaptionsVisible(value=>{try{localStorage.setItem('ai-presenter-captions',value?'hidden':'visible');}catch{}return !value;});}
  function enterSlideFocus(){
    setSlideFocus(true);
    // Request during the same trusted click; narration fetches must not consume activation first.
    if(!document.fullscreenElement&&shellRef.current?.requestFullscreen){
      try{void shellRef.current.requestFullscreen().catch(()=>{});}catch{/* CSS focus remains available. */}
    }
  }
  function leaveSlideFocus(){
    presentation.pause();continuous.pause();setSlideFocus(false);setFocusQuestionOpen(false);
    fullscreenSeen.current=false;
    if(document.fullscreenElement===shellRef.current)void document.exitFullscreen().catch(()=>{});
  }
  useEffect(()=>{
    const changed=()=>{
      if(document.fullscreenElement===shellRef.current){fullscreenSeen.current=true;return;}
      if(fullscreenSeen.current){fullscreenSeen.current=false;presentation.pause();continuous.pause();setSlideFocus(false);setFocusQuestionOpen(false);}
    };
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&slideFocus&&!document.querySelector('dialog[open]')){presentation.pause();continuous.pause();setSlideFocus(false);setFocusQuestionOpen(false);fullscreenSeen.current=false;if(document.fullscreenElement===shellRef.current)void document.exitFullscreen().catch(()=>{});}};
    document.addEventListener('fullscreenchange',changed);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('fullscreenchange',changed);document.removeEventListener('keydown',escape);};
  },[presentation.pause,continuous.pause,slideFocus]);
  useEffect(()=>{if(slideFocus&&(!presentationMode||!presentation.deck))leaveSlideFocus();},[slideFocus,presentationMode,presentation.deck?.id]);
  useEffect(()=>{if(presentation.deck)setPresentationMode(true);},[presentation.deck?.id]);
  useEffect(()=>{if(continuous.phase==='listening')presentation.listeningReady();},[continuous.phase,presentation.listeningReady]);
  const voiceLabels: Record<VoicePhase,string> = {paused:'Voice paused',requesting:'Opening microphone…',listening:'Listening — ask your question',transcribing:'Transcribing your question…',thinking:'Finding the answer…',speaking:'Speaking — microphone is off'};
  function storeSession(value: Session) { sessionRef.current = value; setSession(value); }
  const refreshDocuments = useCallback(async () => {
    const data = await api<{ documents: Document[] }>('documents');
    setDocuments(data.documents);
    const newlyReady = data.documents.filter(document => document.status === 'ready' && !knownReady.current.has(document.id));
    setSelected(current => [...new Set([...current.filter(id => data.documents.some(document => document.id === id && document.status === 'ready')), ...newlyReady.map(document => document.id)])]);
    data.documents.filter(document => document.status === 'ready').forEach(document => knownReady.current.add(document.id));
  }, [api]);
  async function loadSession() {
    setInitializing(true); setError('');
    try { storeSession(await api<Session>('session')); setConnected(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not connect to the server.'); setConnected(false); }
    finally { setInitializing(false); }
  }
  useEffect(() => { void loadSession(); }, []);
  useEffect(() => {
    if (!workspaceReady) return;
    let active = true;
    void Promise.all([refreshDocuments(), api<{ messages: Message[] }>('messages')]).then(([, history]) => { if (active) setMessages(history.messages.filter(message=>message.kind!=='slide-narration'&&!narrationIds.current.has(message.id))); }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [workspaceReady, api, refreshDocuments]);
  useEffect(() => {
    if (!workspaceReady || !documents.some(document => document.status === 'processing')) return;
    const interval = window.setInterval(() => { void refreshDocuments().catch(cause => setError(cause.message)); }, 5000);
    return () => window.clearInterval(interval);
  }, [workspaceReady, documents, refreshDocuments]);
  async function run(name: string, action: () => Promise<void>) {
    setBusy(name); setError(''); setNotice('');
    try { await action(); }
    catch (cause) { if(!(cause instanceof DOMException&&cause.name==='AbortError'))setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(''); }
  }
  async function speak(message: Message) {
    const wasSpeaking = speaking === message.id;
    presentation.pause();
    continuous.pause();
    if (wasSpeaking) { stopSpeech(); return; }
    conversationScroll.forceReply(message.id);
    try { await playAnswer(message); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'AI voice is unavailable.'); }
  }
  async function voiceTurn(audio: Blob, signal: AbortSignal, phase: (value: VoicePhase) => void) {
    activityAt.current = Date.now();
    setError(''); setNotice(''); setBusy('transcribe');
    try {
      await idleReset.current; signal.throwIfAborted();
      const form = new FormData(); form.append('audio',audio,audio.type.includes('mp4') ? 'question.mp4' : 'question.webm');
      const transcript = await api<{text:string}>('transcribe',form,signal); signal.throwIfAborted();
      const text = transcript.text.trim();
      if (!text) throw new Error('No clear speech was detected. Move closer to the microphone, then resume voice.');
      setQuestion(''); setPendingQuestion(text);setFloorQuestion(text);setFloorAnswer(null);setFocusQuestionOpen(false); setBusy('chat'); phase('thinking');
      const result = await api<{message:Message}>('chat',{message:text,documentIds:selectedReady.map(document => document.id),...(presentationMode&&presentation.deck?{presentationId:presentation.deck.id,page:presentation.page}:{})},signal); signal.throwIfAborted();
      setFloorAnswer(result.message);
      const history = await api<{messages:Message[]}>('messages',undefined,signal); signal.throwIfAborted();
      setMessages(history.messages.filter(message=>message.kind!=='slide-narration'&&!narrationIds.current.has(message.id))); setPendingQuestion(''); setBusy('speech'); phase('speaking');
      await playAnswer(result.message,signal); signal.throwIfAborted();
      activityAt.current = Date.now();
      presentation.questionFinished();
    } finally { if (!signal.aborted) { setBusy(''); setPendingQuestion(''); } }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || working) return;
    presentation.pause();continuous.pause();
    const file = files[0];
    if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) { setError('Choose a PDF, DOCX, TXT, or Markdown file.'); return; }
    if (file.size > 30 * 1024 * 1024) { setError('Choose a file no larger than 30 MB.'); return; }
    await run('upload', async () => {
      const form = new FormData(); form.append('file', file);
      let uploaded = false;
      try { await api('upload', form); uploaded = true; }
      finally {
        // Failed provider calls can still leave a removable failed document row.
        try { await refreshDocuments(); }
        catch (cause) { if (uploaded) throw cause; }
      }
      setNotice(`${file.name} uploaded. It will be available when indexing finishes.`);
    });
    if (fileInput.current) fileInput.current.value = '';
  }
  async function uploadDeck(files:FileList|null){
    if(!files?.length||working)return;presentation.pause();continuous.pause();
    const file=files[0];
    if(!/\.(pptx|pdf)$/i.test(file.name)){setError('Choose a PowerPoint PPTX or PDF slide deck.');return;}
    if(file.size>30*1024*1024){setError('Choose a slide deck no larger than 30 MB.');return;}
    await run('deck',async()=>{
      const body=new FormData();body.append('file',file);
      const result=await api<{presentation:{id:number}}>('upload-presentation',body);
      await presentation.refresh();await presentation.prepare(result.presentation.id);await presentation.select(result.presentation.id);
      setPresentationMode(true);setLibraryOpen(false);setNotice('Your slides are ready. Start the presentation when you are ready.');
    });
    if(deckInput.current)deckInput.current.value='';
  }
  async function chooseDeck(id:number){
    await run('deck-select',async()=>{await presentation.select(id);setPresentationMode(true);setLibraryOpen(false);});
  }
  function deleteDeck(id:number,name:string){
    presentation.pause();continuous.pause();libraryDialog.current?.close();setLibraryOpen(false);
    setConfirmation({title:'Delete this shared slide deck?',description:`“${name}” and its prepared slide pages will be removed. Supporting documents stay in the library.`,label:'Delete slide deck',action:async()=>{await api('delete-presentation',{id});if(presentation.deck?.id===id){presentation.reset();setPresentationMode(false);}await presentation.refresh();}});
  }
  async function ask(event: FormEvent) {
    event.preventDefault(); const text = question.trim();
    if (!text || working || !hasSources) return;
    const presentationQuestion=presentationMode&&presentation.active;
    const signal=presentationQuestion?presentation.askQuestion(false):undefined;
    if(presentationQuestion)presentation.questionStarted();
    continuous.pause();
    stopSpeech(); setPendingQuestion(text);setFloorQuestion(text);setFloorAnswer(null);setFocusQuestionOpen(false);
    let answered=false;
    await run('chat', async () => {
      const result = await api<{ message: Message }>('chat', { message: text, documentIds: selectedReady.map(document => document.id),...(presentationMode&&presentation.deck?{presentationId:presentation.deck.id,page:presentation.page}:{}) },signal);
      setFloorAnswer(result.message);
      const history = await api<{ messages: Message[] }>('messages',undefined,signal);signal?.throwIfAborted();
      setMessages(history.messages.filter(message=>message.kind!=='slide-narration'&&!narrationIds.current.has(message.id))); setQuestion('');
      if(presentationQuestion)await playAnswer(result.message,signal);else if (autoSpeak) void speak(result.message);
      answered=true;
    });
    if(presentationQuestion&&answered&&!signal?.aborted){presentation.questionFinished();requestAnimationFrame(()=>void continuous.start());}
    else if(presentationQuestion&&!signal?.aborted)presentation.pause();
    setPendingQuestion(''); if(!slideFocus)composer.current?.focus();
  }
  function deleteDocument(document: Document) {
    libraryDialog.current?.close(); setLibraryOpen(false);
    presentation.pause();continuous.pause();
    setConfirmation({ title: 'Delete this shared document?', description: `“${document.name}” will be removed from this kiosk’s library and search index for all visitors. Existing chat messages remain.`, label: 'Delete document', action: async () => {
      await api('delete-document', { id: document.id }); await refreshDocuments(); setNotice(`${document.name} deleted.`);
    } });
  }
  function newConversation() {
    presentation.pause();continuous.pause();
    setConfirmation({ title: 'Start a new conversation?', description: 'This resets the conversation on this screen for the next visitor. Shared documents stay in the library.', label: 'Start new conversation', action: async () => {
      stopSpeech();
      storeSession(await api<Session>('new-session', {})); setMessages([]); setQuestion('');presentation.reset();setPresentationMode(false);narrationIds.current.clear();
      speech.reset();
      setNotice('Ready for your next question.');
    } });
  }
  useEffect(() => {
    if (!workspaceReady) return;
    const noteActivity = () => { activityAt.current = Date.now(); };
    window.addEventListener('pointerdown', noteActivity);
    window.addEventListener('keydown', noteActivity);
    const timer = window.setInterval(() => {
      if (Date.now() - activityAt.current < 15 * 60 * 1000 || busyRef.current || idleReset.current) return;
      activityAt.current = Date.now(); presentation.reset();setPresentationMode(false);stopSpeech(); setMessages([]); setQuestion(''); setConfirmation(null);
      speech.reset();
      idleReset.current = api<Session>('new-session', {}).then(storeSession).catch(cause => { continuous.pause(); setError(cause.message); }).finally(() => { idleReset.current = null; });
      setNotice('The inactive conversation was cleared. Ready for the next visitor.');
    }, 10000);
    return () => { window.clearInterval(timer); window.removeEventListener('pointerdown', noteActivity); window.removeEventListener('keydown', noteActivity); };
  }, [workspaceReady, api]);
  useEffect(() => {
    if (!continuous.active&&!presentation.active) return;
    let alive = true;
    const heartbeat = window.setInterval(() => {
      if (idleReset.current) return;
      const token = sessionRef.current.csrfToken;
      void api<Session>('session').then(value => {
        if (alive && !idleReset.current && sessionRef.current.csrfToken === token && value.csrfToken !== token) storeSession(value);
      }).catch(cause => { if (alive) { continuous.pause(); setError(cause.message); } });
    },5 * 60 * 1000);
    return () => { alive = false; window.clearInterval(heartbeat); };
  }, [continuous.active,presentation.active,api]);

  useEffect(() => {
    const dialog = libraryDialog.current;
    if (!dialog) return;
    if (libraryOpen && !dialog.open) dialog.showModal();
    if (!libraryOpen && dialog.open) dialog.close();
  }, [libraryOpen]);
  const auraPhase = activeSegmentIndex !== null ? 'speaking' : working||audioLoading||presentation.phase==='preparing'?'thinking':continuous.phase;
  return <div ref={shellRef} className={`app-shell kiosk-shell ${slideFocus?'slide-focused':''}`} data-aura={auraPhase}>
    <a className="skip-link" href="#main">Skip to conversation</a>
    <div className="ambient-field" aria-hidden="true"><div className="aura-halo aura-halo-one" /><div className="aura-halo aura-halo-two" /><div className="aura-orbit aura-orbit-one" /><div className="aura-orbit aura-orbit-two" /><div className="aura-core" /></div>
    <dialog ref={libraryDialog} className="library" aria-labelledby="settings-title" onCancel={() => setLibraryOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setLibraryOpen(false); } }}>
      <div className="drawer-heading"><h2 id="settings-title">Slides, documents & voice</h2><button className="icon-button" aria-label="Close settings" onClick={() => setLibraryOpen(false)}><Cross2Icon /></button></div>
        {notice && <div className="notice success" role="status"><span>{notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Cross2Icon /></button></div>}
      <div id="library-content" className="library-content">
        <div className="library-title"><h3>Document library</h3><span className="count">{documents.length}</span></div>
        <p className="small muted">Shared with everyone at this kiosk.</p>
        <input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md" className="visually-hidden" tabIndex={-1} aria-label="Upload document" onChange={event => void upload(event.target.files)} />
        <button className="upload-button" disabled={!workspaceReady || !session.aiConfigured || working || continuous.active} onClick={() => fileInput.current?.click()}><PlusIcon />{busy === 'upload' ? 'Uploading document…' : 'Upload document'}</button>
        <p className="file-hint">PDF, DOCX, TXT, MD · up to 30 MB</p>
        {documents.length > 0 && <div className="selection-tools"><label><input type="checkbox" checked={ready.length > 0 && selectedReady.length === ready.length} disabled={!ready.length || working || continuous.active} onChange={event => setSelected(event.target.checked ? ready.map(document => document.id) : [])} /> Select all ready</label><button className="icon-button" aria-label="Refresh document status" disabled={working || continuous.active} onClick={() => void run('refresh', refreshDocuments)}><ReloadIcon /></button></div>}
        <div className="document-list">
          {documents.map(document => <div className={`document-row ${selected.includes(document.id) ? 'is-selected' : ''}`} key={document.id}>
            <label className="document-select"><input type="checkbox" checked={selected.includes(document.id)} disabled={document.status !== 'ready' || working || continuous.active} onChange={event => setSelected(current => event.target.checked ? [...current, document.id] : current.filter(id => id !== document.id))} /><span className="document-info"><strong title={document.name}>{document.name}</strong><span className={`document-status status-${document.status}`}>{document.status === 'ready' ? <><CheckIcon /> Ready</> : document.status === 'processing' ? 'Indexing…' : document.status === 'failed' ? 'Could not index' : document.status} <span>· {readableSize(document.size)}</span></span></span></label>
            <button className="icon-button delete-document" aria-label={`Delete ${document.name}`} disabled={working} onClick={() => deleteDocument(document)}><TrashIcon /></button>
            {document.error && <p className="document-error">{document.error}</p>}
          </div>)}
          {!documents.length && <div className="library-empty"><FileTextIcon /><p>Add your source documents.</p><span>Answers stay grounded in the files you select.</span></div>}
        </div>
        <section className="speech-panel deck-panel" aria-labelledby="deck-title"><h3 id="deck-title">Slide presentations</h3><p>Upload slides to present their actual pages. Selected documents support audience questions.</p>
        <input ref={deckInput} type="file" accept=".pptx,.pdf" className="visually-hidden" tabIndex={-1} aria-label="Upload slide deck" onChange={event=>void uploadDeck(event.target.files)}/>
        <button className="upload-button" disabled={!workspaceReady||!session.aiConfigured||working} onClick={()=>deckInput.current?.click()}><PlusIcon/>{busy==='deck'?'Preparing slides…':'Upload slide deck'}</button><p className="file-hint">PPTX or PDF · up to 30 MB · 40 pages</p>
        <div className="deck-list">{presentation.decks.map(deck=><div className="document-row" key={deck.id}><div className="document-info"><strong>{deck.name}</strong><span className={`document-status status-${deck.status}`}>{deck.status==='ready'?`${deck.pageCount} slides · Ready`:deck.status==='processing'?`Preparing ${deck.preparedPages} / ${deck.pageCount||'?'} pages`:'Preparation failed'}</span></div><button className="icon-button" aria-label={`Delete slide deck ${deck.name}`} disabled={working} onClick={()=>deleteDeck(deck.id,deck.name)}><TrashIcon/></button>{deck.error&&<p className="document-error">{deck.error}</p>}{deck.status==='ready'?<button className="text-button" disabled={working} onClick={()=>void chooseDeck(deck.id)}>Open presentation</button>:<button className="text-button" disabled={working} onClick={()=>void run('deck',async()=>{await presentation.prepare(deck.id);await presentation.refresh();})}>Continue preparation</button>}</div>)}</div>
        <button className="text-button" disabled={!presentation.deck||working} onClick={openScript}>View / edit current script</button><label htmlFor="presentation-language">Presentation language</label><select id="presentation-language" value={presentation.language} onChange={event=>presentation.setLanguage(event.target.value as 'en'|'zh')}><option value="en">English</option><option value="zh">中文</option></select>
        {presentation.deck&&<fieldset className="question-policy" disabled={working||!presentation.questionPolicy}><legend>Ask questions after these slides</legend><div className="question-presets"><button type="button" className="text-button" onClick={()=>void run('question-policy',()=>presentation.saveQuestionPages([]))}>None</button><button type="button" className="text-button" onClick={()=>void run('question-policy',()=>presentation.saveQuestionPages([presentation.deck!.pageCount]))}>Last slide</button><button type="button" className="text-button" onClick={()=>void run('question-policy',()=>presentation.saveQuestionPages(presentation.slides.map(slide=>slide.page)))}>All slides</button></div><div className="question-page-list">{presentation.slides.map(slide=><label key={slide.page}><input type="checkbox" aria-label={`Question break after slide ${slide.page}`} checked={presentation.questionPolicy?.pages.includes(slide.page)||false} onChange={event=>void run('question-policy',()=>presentation.saveQuestionPages(event.target.checked?[...(presentation.questionPolicy?.pages||[]),slide.page]:(presentation.questionPolicy?.pages||[]).filter(page=>page!==slide.page)))}/><span>Slide {slide.page}{slide.title?` · ${slide.title}`:''}</span></label>)}</div><p>Shared for this deck. Only selected slides open the microphone and question countdown. “Ask a question” always works.</p></fieldset>}
        {presentation.policyError&&<div className="notice error" role="alert"><span>{presentation.policyError}</span><button className="text-button" onClick={()=>void run('question-policy',presentation.refreshQuestionPolicy)}>Reload question settings</button></div>}
        {presentation.deck&&<div className="animation-preparation"><h3>PowerPoint media</h3>{presentation.animationProgress?<p role="status">Preparing media {presentation.animationProgress.index} / {presentation.animationProgress.total} · slide {presentation.animationProgress.page}</p>:<p>{presentation.slides.some(slide=>slide.animationStatus==='ready'||slide.videoStatus==='ready')?`${presentation.slides.filter(slide=>slide.animationStatus==='ready'||slide.videoStatus==='ready').length} slides with media ready.`: /\.pdf$/i.test(presentation.deck.name)?'PDF pages are static. Upload the original PPTX for supported PowerPoint animations.':'Embedded videos play with sound after narration. PowerPoint animations play silently during narration.'}</p>}{presentation.slides.some(slide=>slide.animationStatus==='failed'||slide.videoStatus==='failed')&&<><p className="document-error">Some media could not be prepared. Animations use a static fallback; embedded videos must be retried before presenting.</p><button className="text-button" disabled={!!presentation.animationProgress||working} onClick={()=>void presentation.prepareAnimations(true)}>Retry failed media</button></>}</div>}
        <label htmlFor="question-break">Question window length</label><select id="question-break" value={presentation.questionSeconds} onChange={event=>presentation.setQuestionSeconds(Number(event.target.value))}>{[5,8,15,30].map(seconds=><option key={seconds} value={seconds}>{seconds} seconds</option>)}</select><p>On selected slides, the microphone listens after narration and any animation finish. Speech holds the next slide until its answer finishes. “Ask a question” interrupts narration.</p>
        </section><div className="speech-panel"><h3>Voice preferences</h3><label htmlFor="voice">AI voice</label><select id="voice" value={voice} onChange={event => { continuous.pause(); stopSpeech(); setVoice(event.target.value); }}><option value="coral">Coral</option><option value="alloy">Alloy</option><option value="sage">Sage</option></select><label htmlFor="rate">Playback speed</label><select id="rate" value={rate} onChange={event => { const speed = Number(event.target.value); setRate(speed);  }}><option value={0.8}>0.8× — relaxed</option><option value={1}>1× — normal</option><option value={1.2}>1.2× — faster</option><option value={1.5}>1.5× — quick</option></select><label className="auto-speak"><input type="checkbox" disabled={continuous.active} checked={autoSpeak} onChange={event => { setAutoSpeak(event.target.checked); if (!event.target.checked) stopSpeech(); }} /> Read typed answers aloud</label><p>Voice is AI-generated. Microphone recordings are sent to OpenAI for transcription.</p></div>
      </div>
    </dialog>
    <ScriptEditor slides={presentation.slides} open={scriptOpen} deck={presentation.deck} language={presentation.language} page={presentation.page} api={api} onClose={()=>setScriptOpen(false)} onSaved={(page,content)=>{presentation.scriptSaved(page,content);speech.reset();setFloorAnswer(null);setFloorQuestion('');}}/>
    <main id="main" className="main-panel">
      <header className="topbar"><h1><span className="brand-signal" aria-hidden="true" />AI Presenter</h1><div className="topbar-actions">{presentation.deck&&<button className="text-button" aria-pressed={presentationMode} onClick={()=>{presentation.pause();continuous.pause();setPresentationMode(!presentationMode);}}>{presentationMode?'Conversation':'Slides'}</button>}<button className="text-button new-conversation" disabled={!workspaceReady || !!busy} onClick={newConversation}><PlusIcon /><span>New conversation</span></button><button className="icon-button settings-toggle" aria-label="Documents and voice settings" aria-haspopup="dialog" aria-expanded={libraryOpen} onClick={() => { presentation.pause(); continuous.pause(); setLibraryOpen(true); }}><GearIcon /></button></div></header>
      <div className="feedback-area">
        {workspaceReady && !session.aiConfigured && <div className="notice setup-notice" role="status"><span><strong>Voice and answers are not connected yet.</strong> Add the server API key, then refresh.</span></div>}
        {error && <div className="notice error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Cross2Icon /></button></div>}

      </div>
      {!workspaceReady ? <div className="welcome-wrap"><section className="welcome login-panel"><h2>{initializing ? 'Connecting…' : connected ? 'Kiosk setup is incomplete' : 'Connection unavailable'}</h2>{!initializing && <><p>Check the kiosk connection, then try again.</p><button className="primary-button" onClick={() => void loadSession()}><ReloadIcon /> Reconnect</button></>}</section></div> : <>
        <div ref={conversationScroll.container} className={`conversation ${presentationMode?'presentation-conversation':''}`} aria-label="Conversation">
          {presentationMode&&presentation.deck&&<PresentationStage ref={stageRef} deck={presentation.deck} slides={presentation.slides} page={presentation.page} phase={presentation.phase} active={presentation.active} secondsLeft={presentation.secondsLeft} narration={presentation.narration} language={presentation.language} speaking={speaking} activeSegmentIndex={activeSegmentIndex} playbackProgress={playbackProgress} captionsVisible={captionsVisible} onToggleCaptions={toggleCaptions} onScript={openScript} focused={slideFocus} scriptsReady={presentation.scriptsReady} animationsReady={presentation.animationsReady} scriptProgress={presentation.scriptProgress} scriptError={presentation.scriptError} preparingScript={presentation.preparingScript} onPrepareScript={()=>void presentation.prepareScript()} answer={floorAnswer} audienceQuestion={floorQuestion} onFocus={enterSlideFocus} onExit={leaveSlideFocus} questionForm={slideFocus&&focusQuestionOpen?<form className="focus-question-form" onSubmit={ask}><label htmlFor="floor-question">{presentation.language==='zh'?'请说出或输入问题':'Speak or type your question'}</label><textarea id="floor-question" rows={2} value={question} maxLength={4000} disabled={working} onChange={event=>setQuestion(event.target.value)} onFocus={()=>presentation.questionStarted()} placeholder={presentation.language==='zh'?'输入问题…':'Enter your question…'} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/><div><button type="button" className="text-button" onClick={()=>{setFocusQuestionOpen(false);presentation.questionFinished();if(continuous.phase==='listening')presentation.listeningReady();}}>{presentation.language==='zh'?'返回幻灯片':'Back to slides'}</button><button className="send-button" type="submit" disabled={working||!question.trim()||!session.aiConfigured}>{presentation.language==='zh'?'发送':'Send'}<ArrowUpIcon/></button></div></form>:undefined} onToggle={()=>{if(presentation.active)presentation.pause();else{enterSlideFocus();setError('');void presentation.start(presentation.phase==='completed'?1:undefined);}}} onPage={presentation.go} onQuestion={()=>{setError('');if(slideFocus)setFocusQuestionOpen(true);presentation.askQuestion();if(slideFocus)presentation.questionStarted();}} onImageError={()=>{presentation.pause();setError('This slide could not load. Check the connection, then select the deck again.');}}/>}

          {!messages.length && !pendingQuestion ? presentationMode?null: <div className="empty-conversation"><p>{ready.length ? 'Speak, or enter your question.' : documents.some(document => document.status === 'processing') ? 'Your document is getting ready.' : 'Add a document to begin.'}</p>{!ready.length && <button className="text-button" onClick={() => { presentation.pause(); continuous.pause(); setLibraryOpen(true); }}>Open document settings <ArrowUpIcon /></button>}</div> : <div className="messages">{messages.map(message => <article className={`message message-${message.role}`} data-message-id={message.id} key={message.id}><div className="message-label">{message.role === 'assistant' ? 'AI Presenter' : 'You'}</div><div className="message-content">{message.role === 'assistant' ? <SpokenText message={message} activeIndex={speaking===message.id?activeSegmentIndex:null} progress={playbackProgress} onActiveSegment={conversationScroll.followActive}/> : message.content}</div>{message.role === 'assistant' && <><div className="message-actions"><button className={`text-button ${speaking === message.id ? 'speaking' : ''}`} disabled={!session.aiConfigured || (!!busy && !continuous.active)} onClick={() => void speak(message)}>{speaking === message.id ? <StopIcon /> : <SpeakerLoudIcon />}{speaking === message.id ? audioLoading ? 'Cancel voice loading' : 'Stop audio' : 'Listen'}</button>{message.citations?.length > 0 && <span className="source-count">{message.citations.length} {message.citations.length === 1 ? 'source' : 'sources'}</span>}</div>{message.citations?.length > 0 && <details className="sources"><summary>View supporting passages <ChevronDownIcon /></summary>{message.citations.map((citation, index) => <div className="source" key={`${citation.documentId}-${index}`}><h3><FileTextIcon />{citation.name}</h3><blockquote>{citation.quote}</blockquote></div>)}</details>}</>}</article>)}{pendingQuestion && <><article className="message message-user"><div className="message-label">You</div><div className="message-content">{pendingQuestion}</div></article><div className="answer-pending" role="status"><span className="thinking-light" aria-hidden="true" /><span>Finding your answer…</span></div></>}</div>}
        </div>
        <div className="composer-area">
          <p data-testid="voice-status" data-phase={continuous.phase} data-active={continuous.active} className="recording-hint" role="status"><span className="status-dot" />{voiceLabels[continuous.phase]}</p>
          <form className="composer" onSubmit={ask}><label htmlFor="question" className="visually-hidden">Question about selected documents</label><textarea ref={composer} id="question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={4000} placeholder="Enter your question…" rows={1} disabled={working || !hasSources || !session.aiConfigured} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div className="composer-bottom"><button data-testid="voice-toggle" className={`record-button ${continuous.active ? 'is-recording' : ''}`} type="button" disabled={!continuous.active && !presentation.active && (!microphoneSupported || !!busy || !hasSources || !session.aiConfigured)} aria-pressed={continuous.active||presentation.active} onClick={() => { if (presentation.active) presentation.pause(); else if (continuous.active) continuous.pause(); else { setError(''); setNotice(''); stopSpeech(); void continuous.start(); } }}>{continuous.active||presentation.active ? <><StopIcon />Pause voice</> : <><SpeakerLoudIcon />Start / resume voice</>}</button><button className="send-button" type="submit" aria-label={busy === 'chat' ? 'Finding an answer' : 'Send question'} disabled={working || !question.trim() || !hasSources || !session.aiConfigured}><span>Send</span><ArrowUpIcon /></button></div></form>
          {!microphoneSupported && <p className="composer-note">Voice is unavailable in this browser. You can type instead.</p>}
          <p className="composer-note">AI-generated voice · Answers from your selected documents</p>
        </div>
      </>}
    </main>
    <AlertDialog.Root open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }}><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="dialog"><AlertDialog.Title>{confirmation?.title}</AlertDialog.Title><AlertDialog.Description>{confirmation?.description}</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel asChild><button className="secondary-button">Cancel</button></AlertDialog.Cancel><AlertDialog.Action asChild><button className="danger-button" onClick={() => { if (confirmation) void run('delete', confirmation.action); }}>{confirmation?.label}</button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </div>;
}
