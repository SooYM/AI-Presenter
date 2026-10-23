import { useCallback, useEffect, useRef, useState } from 'react';

export type VoicePhase = 'paused' | 'requesting' | 'listening' | 'transcribing' | 'thinking' | 'speaking';
type Options = {
  enabled: boolean;
  onUtterance: (audio: Blob, signal: AbortSignal, phase: (value: VoicePhase) => void) => Promise<void>;
  onPause: () => void;
  onError: (message: string) => void;
  onSpeechStart?: () => void;
  onSpeechCancelled?: () => void;
};

const aborted = () => new DOMException('Voice conversation paused.', 'AbortError');

export function useContinuousVoice(options: Options) {
  const latest = useRef(options); latest.current = options;
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>('paused');
  const generation = useRef(0);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const captureCleanup = useRef<(() => void) | null>(null);
  const mounted = useRef(true);

  const pause = useCallback(() => {
    const wasRunning = running.current;
    running.current = false; generation.current += 1;
    controller.current?.abort(); controller.current = null;
    captureCleanup.current?.(); captureCleanup.current = null;
    if (wasRunning) latest.current.onPause();
    if (mounted.current) { setActive(false); setPhase('paused'); }
  }, []);

  const start = useCallback(async () => {
    if (running.current || !latest.current.enabled || document.hidden) return;
    running.current = true;
    const run = ++generation.current;
    const request = new AbortController(); controller.current = request;
    const isCurrent = () => running.current && generation.current === run && !request.signal.aborted;
    const changePhase = (value: VoicePhase) => { if (isCurrent() && mounted.current) setPhase(value); };
    setActive(true);
    try {
      while (isCurrent()) {
        changePhase('requesting');
        const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
        // Permission prompts may resolve after Pause or after leaving this page.
        if (!isCurrent()) { stream.getTracks().forEach(track => track.stop()); break; }
        captureCleanup.current = () => stream.getTracks().forEach(track => track.stop());
        const context = new AudioContext();
        captureCleanup.current = () => { stream.getTracks().forEach(track => track.stop()); void context.close(); };
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser(); analyser.fftSize = 2048;
        source.connect(analyser); // Never route the microphone to speakers.
        const mime = ['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, mime ? {mimeType:mime,audioBitsPerSecond:64000} : undefined);
        const samples = new Float32Array(analyser.fftSize);
        const chunks: BlobPart[] = [];
        let timer: number | undefined;
        let cleaned = false;
        let rejectCapture: (reason: unknown) => void = () => {};
        const release = () => {
          if (cleaned) return; cleaned = true;
          window.clearInterval(timer);
          recorder.onstop = null; recorder.onerror = null; recorder.ondataavailable = null;
          if (recorder.state !== 'inactive') recorder.stop();
          stream.getTracks().forEach(track => track.stop());
          source.disconnect(); analyser.disconnect(); void context.close();
        };
        const cancel = () => { release(); rejectCapture(aborted()); };
        captureCleanup.current = cancel;
        await context.resume();
        if (!isCurrent()) { release(); break; }
        if (context.state !== 'running') { release(); throw new Error('Audio capture could not start. Tap Start / resume voice again.'); }
        const audio = await new Promise<Blob | null>((resolve,reject) => {
          rejectCapture = reject;
          let speech = false; let voicedMs = 0; let hotMs = 0; let lastVoice = 0; let noise = 0.004;
          const began = performance.now(); let previous = began;
          const finish = () => { if (recorder.state === 'recording') recorder.stop(); };
          recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          recorder.onstop = () => {
            const blob = speech && voicedMs >= 250 ? new Blob(chunks,{type:recorder.mimeType || 'audio/webm'}) : null;
            release(); resolve(blob);
          };
          recorder.onerror = () => { release(); reject(new Error('Microphone recording failed. Check the device, then resume voice.')); };
          stream.getAudioTracks().forEach(track => track.addEventListener('ended',() => {
            if (!cleaned) { release(); reject(new Error('The microphone disconnected. Reconnect it, then resume voice.')); }
          },{once:true}));
          recorder.start(250); changePhase('listening');
          timer = window.setInterval(() => {
            if (!isCurrent()) { cancel(); return; }
            const now = performance.now(); const elapsed = Math.min(100, now - previous); previous = now;
            analyser.getFloatTimeDomainData(samples);
            let energy = 0; for (const sample of samples) energy += sample * sample;
            const rms = Math.sqrt(energy / samples.length);
            const threshold = Math.max(0.012, Math.min(0.045, noise * 3));
            const voiced = rms > (speech ? threshold * 0.65 : threshold);
            if (voiced) {
              hotMs += elapsed;
              if (speech || hotMs >= 100) { if (!speech) latest.current.onSpeechStart?.(); speech = true; voicedMs += elapsed; lastVoice = now; }
            } else {
              hotMs = 0;
              if (!speech && rms < threshold) noise = Math.max(0.002, noise * 0.98 + rms * 0.02);
            }
            if (speech && now - lastVoice >= 1200) finish();
            // Rotate silent buffers without transcription requests or retained audio.
            else if (!speech && now - began >= 30000) finish();
            else if (now - began >= 60000) finish();
          },50);
        });
        captureCleanup.current = null;
        if (!isCurrent()) break;
        if (!audio || audio.size === 0) { latest.current.onSpeechCancelled?.(); continue; }
        // The capture was fully released before sending audio or playing a reply.
        changePhase('transcribing');
        await latest.current.onUtterance(audio,request.signal,changePhase);
        if (!isCurrent()) break;
        // Let the last speaker audio decay before reopening the microphone.
        await new Promise<void>((resolve,reject) => {
          const abort = () => { window.clearTimeout(timeout); reject(aborted()); };
          const timeout = window.setTimeout(() => { request.signal.removeEventListener('abort',abort); resolve(); },350);
          request.signal.addEventListener('abort',abort,{once:true});
        });
      }
    } catch (cause) {
      if (isCurrent()) {
        const name = cause instanceof DOMException ? cause.name : '';
        const message = name === 'NotAllowedError' ? 'Microphone access was denied. Allow microphone access, then resume voice.' : name === 'NotFoundError' ? 'No microphone was found. Connect one, then resume voice.' : cause instanceof Error ? cause.message : 'Voice conversation stopped. Check the connection, then resume.';
        pause(); latest.current.onError(message);
      }
    }
  }, [pause]);

  useEffect(() => { if (!options.enabled && running.current) pause(); }, [options.enabled,pause]);
  useEffect(() => {
    const hide = () => { if (document.hidden && running.current) pause(); };
    document.addEventListener('visibilitychange',hide);
    return () => { document.removeEventListener('visibilitychange',hide); };
  },[pause]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pause(); };
  },[pause]);
  return {active,phase,start,pause};
}
