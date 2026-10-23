# AI Presenter design system

## Direction
Operate surface for a public touchscreen kiosk, using a cinematic science-fiction atmosphere. The conversation is the screen: user questions and AI text replies dominate. A small settings control holds documents and voice preferences; it stays closed by default.

## Visual world
Midnight graphite surfaces, cyan-white text, cool energy halos and fine orbital linework. One ambient field responds to actual paused, listening, transcribing, thinking and speaking states. It never represents fabricated activity or telemetry. The aura remains behind the transcript rather than replacing the conversation with an orb dashboard.

## Tokens
- Background: #050a10; dialog: #0a1721; composer: #091924.
- Primary text: #edf7fc; secondary text: #9bb2c0; border: #223845.
- Active accent: #79e4f3; danger text: #ffafa4.
- Typeface: self-hosted DM Sans; 18–25px answer text, 16–21px user text, 12–13px controls.
- Body measure: up to 70 characters; transcript max-width 900px, 1000px on very large screens.
- Radius: 9px controls; 14–16px input and message surfaces.
- Focus: 2px #b1f4ff outline with 4px offset.

## Composition and interaction
Full-width transcript with a compact title bar and bottom voice/text composer. User questions align to the right on a subdued panel; AI answers remain open, large, readable prose. Source passages stay collapsed under individual answers. No permanent file sidebar, feature cards, onboarding steps, fake metrics, or marketing headline.

A single Start begins hands-free voice turns. Pause remains available through listening, transcription, generation and speech. Opening settings pauses an active voice loop. The microphone remains off while AI replies play, with the aura tracking the actual state.

Documents and voice preferences live in a native dialog drawer. It traps focus, supports Escape, and restores focus on close. Document deletion closes that drawer before opening Radix AlertDialog confirmation. Icons remain from one Radix family.

## Responsive and states
The same conversation-first composition scales to mobile. Settings becomes a full-width drawer. Touch controls have at least 44–48px targets. Long document names wrap in settings. Error and connection failures are visible; routine upload notifications stay in settings.

Reduced-motion users receive a static aura and no transitions. Reduced-transparency users receive solid surfaces and a quieter aura. Native controls and scrollbars use the dark palette, with explicit visible focus.

## Verification
Production TypeScript/Vite build passes. The mechanical detector runs once after implementation. Actual screen-reader conformance and physical kiosk acoustics are not claimed without device testing.
## Presentation mode
Deck management and language/question-break settings remain inside settings. Only a selected deck reveals the compact Slides/Conversation switch. Presentation mode shows uncropped real slide art, page count, narration caption, and explicit pause, previous/next, and floor-question controls. Captions and chat highlight exact speech segments through real audio events; cyan fill plus underline preserves a cue beyond color. Questions appear in the existing transcript. Microphone capture remains off during all AI playback. Mobile keeps slide proportions and wraps touch controls.

## Fullscreen slide focus
Presentation is an Experience surface within the existing kiosk. Original slide artwork occupies the viewport without cropping. Normal navigation, transcript, and composer recede. Compact midnight overlays carry only page/status, the spoken caption or current floor answer, and Pause/Previous/Next/Ask/Exit controls. Ask reveals a short voice-or-type question panel. Pause keeps focus; Escape and Exit stop the presentation and restore the regular screen. Native fullscreen rejection falls back to the same full-viewport composition.
Script preparation displays saved progress before Start. A separate retry state resumes missing pages; preparation never masquerades as the intentional audience-question countdown.

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
