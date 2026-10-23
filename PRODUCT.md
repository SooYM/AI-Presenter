# AI Presenter

## Platform
web

## Purpose
At a touchscreen kiosk, upload documents, speak or type questions grounded only in those documents, inspect cited passages, and hear an AI-generated answer.

## Confirmed requirements
User requested a simple chatbot with LLM capability, document-only RAG, and text-to-speech. User selected OpenAI, then confirmed a browser kiosk without login, voice or typing input, and visitor uploads.
Global workspace instructions require durable storage, server-enforced permissions, actual backend validation, PHP/MySQL compatibility, and static React/TypeScript assets.

## Scope decisions
No account or login. Multiple shared kiosk documents, a persistent conversation scoped to the current browser visitor, and PDF/DOCX/TXT/MD uploads.
Continuous voice uses local speech-end detection, OpenAI transcription, automatic document-grounded answering, and spoken replies. Listening resumes after each reply. A single Start unlocks browser permission; Pause releases the microphone and cancels the loop. Typed questions remain available. OpenAI generates answer audio from a persisted assistant reply.
New conversation clears the current visitor's chat and audio. The screen clears after 15 minutes without interaction. Documents remain shared.
No signup, collaborative editing, or billing UI.

## Stack
React and TypeScript build to static assets. PHP API and MySQL persist application state. OpenAI indexes and retrieves document passages.
API credentials remain on the server. MediaRecorder captures up to 60 seconds per question. Playback uses MP3 audio, with Coral, Alloy, or Sage voices and a playback-speed control.

## Verification limits
No deployment, provider credential, physical microphone/speaker playback, or screen-reader conformance claim is implied by implementation.


## Confirmed screen direction
User requested a futuristic science-fiction aura, then specified that the main screen should show only the user's spoken or entered text and AI text with voice. The conversation is primary; document management and voice preferences stay in a closed settings drawer. The aura tracks actual voice state without adding a dashboard or large orb.

## Slide presenting and Chinese
Visitors can separately upload PPTX/PDF decks (30 MB, 40 pages). Preparation stores actual rendered pages. Select a deck, English or Chinese narration, and a 5–30 second audience question window (default 8 seconds). Narration uses persisted, grounded assistant messages; page advances follow real audio completion. The floor timer starts only once microphone capture reports listening. Detected speech holds advancement until its answer completes. Ask a question interrupts narration; Pause cancels speech, requests, listening, and advancement. Resume replays the current slide. Refresh restores deck/page/language paused. Selected support documents plus the current deck ground floor questions; replies follow the question language.
Speech highlights exact server-provided segments on actual audio playback events. At most two upcoming segments prefetch; no word timing is estimated. Older messages use whole-answer highlighting.

## Focused presenting and upfront scripts
Start enters native browser fullscreen when available, with an uncropped slide filling the display. A CSS full-viewport fallback remains available. Pause retains this focused view; Exit or Escape pauses all playback/listening and returns to the regular app. Compact overlays retain captions, audience questions, typed input, and explicit controls.
The whole script prepares after a deck is selected, before Start is enabled. Scripts belong permanently to each deck, slide, and language. Supporting-document changes do not regenerate narration. Failed preparation can retry from cached pages. During presentation, page narration reads cached scripts only. The next page's opening speech segment prefetches while the current page plays. The chosen 5–30 second audience-question interval remains intentional, separate from script or audio preparation.

## Saved script editing and captions
View / edit script pauses playback and opens the saved per-slide text. Save stores the text verbatim, with revision checks to prevent overwriting another edit. Cancel discards the current draft; reload saved version explicitly replaces it after an error or conflict. Saved text remains attached to that slide and language across restarts, model changes, and support-document selections. Save clears pending narration and audio prefetches before later playback.
Captions display one current spoken segment on one visual line. The subtitle strip reserves space beneath the slide artwork. Hide / Show captions persists locally and does not interrupt audio. Long lines remain horizontally scrollable; automatic position follows actual audio progress, without claiming word alignment. Touching or scrolling the line switches that segment to manual scrolling.

## Selected question breaks and PowerPoint animation
Question-break pages are saved globally for each deck, independently of its saved scripts. Unconfigured decks ask only after the last slide. Settings provide individual slide checkboxes and None / Last slide / All slides presets. Unchecked pages advance after narration and any animation finish, without opening the microphone or starting a question countdown. Manual Ask a question remains available on every page.
Original PPTX slides with supported authored animation/timing render through native PowerPoint into per-slide MP4 clips. Clips play muted from the first actual narration-audio play event, hold their last frame when finished, and do not loop. Automatic advancement waits for both narration and clip completion. Pause, Exit, hidden pages, and slide navigation cancel playback. Pending, failed, or unplayable clips explicitly show a static fallback; failed preparation can retry in settings. PDF pages remain static. Native export preserves timed visual effects, while interactive click triggers/hyperlinks are not interactive controls, and isolated clips cannot reproduce every cross-slide transition or Morph relationship.

Start waits until pending native animation exports finish. Failed exports retain a clearly labeled static fallback and can retry in settings.

## Conversation reading and loading feedback
A new assistant reply opens at its beginning. Speech follows its actual active segment inside the conversation panel; older whole-answer audio uses actual playback progress for long text. Wheel, touch, scrollbar, or navigation-key reading pauses following until a new reply or an explicit Listen action. These scrolls leave the composer and page position fixed. Real pending requests use a slow breathing cyan glow; reduced-motion users receive a static loading state.

## Embedded slide video
PPTX embedded videos use their original audio after non-video narration finishes. Video-only slides with an empty saved script play directly, without generated filler or TTS. Ordinary animation clips remain muted and concurrent with narration. Video playback must end before a question break or automatic advancement. Browser audio permission failures expose Play video; playback errors expose Retry and keep the presentation waiting. Pending or failed embedded-video preparation blocks Start until retried. Pause, Exit, navigation and hidden pages cancel video; Resume restarts the current slide. Captions clear while the slide video plays.
