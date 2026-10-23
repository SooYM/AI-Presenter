# AI Presenter verification

Verified locally on 23 October 2026, Asia/Kuala_Lumpur.

## Initial baseline (before presentation extension)

- React/TypeScript production build and PHP lint.
- Eleven grounding checks reject fabricated quotes, altered negations, invalid sources, oversized evidence, and removed documents.
- MySQL 8.4.11: four InnoDB tables, strict SQL mode, writable private storage, scoped CRUD application grants.
- Actual browser upload of a TXT document, OpenAI indexing, and selection of a ready document.
- Live `gpt-4o-mini` returned the document's 9:30 AM opening time with a verified source excerpt.
- An unrelated question received the document-only refusal.
- OpenAI MP3 speech returned HTTP 200; browser playback time advanced.
- OpenAI transcription returned HTTP 200 and the expected spoken sentence.
- Speak/Stop recording controls, MediaRecorder, transcript review, and explicit Send worked using controlled audio in the disposable test workflow. The physical microphone was not recorded.
- A separate visitor could not read the first visitor's messages or request its speech. Invalid CSRF and foreign-origin writes returned 403; a request for `.env` returned 404.
- New conversation cleared current history. Document deletion removed the test file from the local library and OpenAI index.
- Desktop and 390-pixel layouts were inspected.
- An empty real-workspace backup passed manifest hashes and restored into a disposable database with all four tables and the conversation column. Uploaded-document restore was not exercised.

## Test cleanup

Initial live tests used a separate disposable MySQL database, which was removed after cleanup. Later continuous-voice tests also used an isolated database. Two real user uploads and one conversation arrived there during testing. With explicit user approval, both documents and the conversation were copied into the main library with their original identifiers; the source database and a private SQL backup were retained. Synthetic test documents and conversations were removed. No user uploads were deleted.

## Continuous conversation update

- Two spoken questions completed through real OpenAI transcription, `gpt-4o-mini` retrieval answering, and AI speech with one Start click and no per-turn Send clicks.
- Listening resumed automatically after both spoken answers. Exactly two transcription, two chat, and two speech requests were observed.
- Silence after those turns created no extra transcription or chat requests.
- The microphone had no live tracks during AI speech. Pause stopped all tracks and returned the UI to paused.
- A focused cancellation test delayed microphone permission and transcription routing. Pause stopped a late permission stream and prevented any later chat or speech request. This timing test used controlled interception; the full functional pipeline above used real services.
- TypeScript and production build passed; source review covered cancellation, microphone cleanup, session heartbeat, and idle reset.
- Controlled audio fixtures avoided recording the physical microphone. Physical room acoustics and microphone sensitivity still need a target-kiosk check.

## Markdown answering and sci-fi conversation screen

- The uploaded Markdown was valid UTF-8 and already indexed. A date question retrieved the correct passage at high confidence, but one invalid extra quote caused the old validator to discard all valid evidence.
- The validator now retains independently verified quotes, discards invalid ones, and repairs a mistaken chunk reference only when the identical quote exists in another allowed retrieved source. Whitespace-only differences return the original source span. Changed words, punctuation, and negations are not accepted.
- Natural Unicode in the model input prevents escaped Chinese characters from distorting copied evidence.
- Nineteen grounding regressions and PHP lint pass. Live English and Chinese convention-date questions returned verified dates; the visible Chinese result was `日期：2027年8月15、16及17日` with a citation.
- The main screen now contains the user/AI conversation, input, Start/Pause, and compact controls. Document management and voice preferences are in a closed settings drawer.
- Desktop 1440×900 and mobile 390×844 checks showed no horizontal overflow. Native settings opens/closes correctly and opening it pauses voice with zero live microphone tracks.
- The cyan aura follows actual voice state. Reduced-motion mode disables its animation. Assistant bold syntax renders safely through React without raw HTML.
- Existing uploaded documents and user conversations were retained; this change did not reindex or alter document contents.

## Operational limits

- Physical microphone quality, speaker volume, touchscreen hardware, and browser permission behavior still require a check on the target kiosk.
- Local startup uses this Windows machine's trusted public CA roots with TLS verification enabled. Production hosting needs its own maintained trust configuration.
- Apache hosting rules and remote hosting capacity have not been verified on a deployed virtual host.
- Quotes prove source provenance; the model's choice of relevant passages can still be imperfect.
- OpenAI documents speech-model retirement on 6 January 2027 and GPT-4o mini retirement on 14 January 2027. Plan and test replacements before those dates: https://developers.openai.com/api/docs/deprecations.

## Start

Run `webapp docchat`, then open http://127.0.0.1:3250. The API key is already configured privately on this workstation. For another machine, follow README.md.

## Natural narration, slide presentation and spoken highlighting

- Nineteen quote grounding checks and nineteen natural presenter checks pass. Nine slide ZIP validation and speech segmentation checks pass. All backend PHP files and backup helper pass lint.
- English and Chinese natural responses, unknown-topic refusal and six live semantic evidence checks passed against real OpenAI services. The semantic check remains model-dependent; exact source quote verification is deterministic.
- Separate disposable MySQL database and reserved HTTP port 3252 isolate slide fixtures from live documents and histories on port 3250. Main database received additive presentation tables and message-kind migration; existing rows remain preserved.
- Actual PDF and PPTX conversion produced three rendered pages each, including extracted Chinese text. PowerPoint conversion ran through installed Office, with existing-process guards and no broad process termination.
- The shared speech queue uses server-derived segments. Each highlight starts on its actual audio play event and clears on ended, error or cancellation. It prefetches at most two segments ahead. Pause and navigation abort outstanding speech work.
- Backups now include presentation sources, rendered pages and all eight tables in database inventory. Speech caches are rebuildable and excluded from backup.
- Native conversion tools, PowerPoint licensing and process support require separate verification on target hosting. Physical room acoustics and microphone/speaker hardware remain target-kiosk checks.

- Real isolated API checks passed: PNG serving, English/Chinese narration, narration cache reuse with a fresh visitor message, MP3 segments, deck questions, unknown-topic refusal, session isolation and deletion.
- Selecting a supporting Markdown document answered the wheelchair-access question with an east-entrance citation. Deck-only scope refused it; unselected documents did not enter the answer.
- Blank/decorative PDF pages now retain their rendered image and use a localized operational notice without factual citations. They no longer fail the whole deck.
- Backup file-copy check used one document and two decks: ten source/derived files matched original SHA-256 hashes. Eight-table inventory and CRUD-only runtime grants passed.

- A relevance regression exposed a borrowing-policy answer to an undocumented book-location question. The independent review now requires question relevance as well as factual support. Real rechecks refused the missing location, answered the borrowing limit, and retained Chinese slide narration. Thirty-eight grounding/presenter regressions pass.

- Real browser checks passed English/Chinese audio-linked highlighting, automatic page advancement after audio ended and question interval, typed floor-question interruption/playback, Pause clearing all highlights and saved-page reload paused. A controlled silent WebAudio microphone fixture avoided physical recording; API, database, rendering and speech audio were real.
- Desktop 1440×1000 and mobile 390×844 show slide controls above the composer without horizontal overflow. Active caption spans scroll into view with no whole-page scroll. Screenshots: `../ai-presenter-slides-desktop.png` and `../ai-presenter-slides-mobile.png`.

- Specific-subject checks reject inferring an undocumented subtype from generic source facts. Five fresh missing-location draws refused, and the known borrowing limit still passed. This improves model grounding but is not a guarantee of perfect semantic decisions.

- Final browser question recheck refused the unsupported location with zero citations. QA document/deck fixtures were deleted through real API endpoints, test history cleared, and test browser closed. Live kiosk health remained successful.

## Fullscreen and upfront script preparation

- Whole-deck scripts persist for the chosen language and selected support-document scope. A bounded preparation request saves one missing page; retries resume completed work. Script preparation does not create visitor chat messages.
- Playback now reads prepared scripts only. The server rejects incomplete script scope with HTTP 409 instead of starting LLM narration generation during the talk.
- Actual isolated API checks prepared a three-page script, resumed at one of three pages, observed zero history messages during preparation, and reused completed preparation without generation. Cached narration reads took 55, 57 and 35 milliseconds on this workstation; these are script-read timings, not total audio latency.
- Changing to an unprepared Chinese language scope correctly reported zero prepared pages. Safety/scope regression checks passed.
- Script grounding failures remain retryable and do not discard prepared pages. The adjustable 5–30-second audience-question interval remains intentional.

- Cache-only narration succeeded with the isolated test OpenAI API key disabled, proving playback did not invoke generation. Selecting a newly indexed support document changed script scope to zero prepared pages and rejected stale playback with HTTP 409. The temporary support document was deleted.

- A confirmed slide-mode false rejection came from applying an audience-question gate to narration. Slide mode now requires exact evidence and per-sentence factual/slide relevance approval; audience-question and specific-subject gates remain enforced for answers. Forty-one grounding/presenter regressions passed. Three fresh slide compositions succeeded; unsupported location questions still refused, and a wrong borrowing claim was rejected.

- Browser checks used controlled document/audio responses for native fullscreen, Pause retaining focus, Escape pausing/exiting, viewport fallback at 390×844, hidden normal chrome, preparation failure/retry, and next-slide first-segment prefetch. The slide image filled 1440×1000 using contain; mobile had no horizontal overflow. These UI checks and the real backend preparation/cache checks were separate; a combined new fullscreen/provider run was not repeated.
- Cache-miss script generation is bounded at 100 pages per ten minutes, covering a 40-page English script, a 40-page Chinese script and retry allowance. Cached preparation does not consume generation quota. No database migration was required.
- Main kiosk health remained successful after these changes. Physical touchscreen, microphone acoustics and speaker quality remain target-device checks.

- Final controlled timer check kept a typed question visible and unchanged after 6.1 seconds with a five-second floor interval. Closing the form restarted the question interval. TypeScript and production build passed with no unbuilt source.
- The released kiosk loaded against the live backend in a fresh browser session. Dedicated QA server, fixture decks, disposable database and copied QA environment were removed; live documents and history were preserved.

## Saved per-slide editing and compact captions

This change replaces the earlier document/model-scoped narration cache with saved per-deck, per-slide, per-language scripts. Supporting documents continue to scope audience questions. Existing cached scripts are adopted without regeneration; saved manual edits take precedence. No schema migration was required.

Actual isolated API checks passed viewing, editing, saving, reloading and cache-only playback of exact edited text. Saves clear obsolete generated citations and reject stale revisions with HTTP 409. Supporting-document changes reuse saved scripts, and prepare calls never overwrite edits. Separate provider-key-disabled checks verified view/save/reload/play after model and document changes, plus adoption of a prior cached script. Seventeen deterministic safety/storage checks passed.

Manual scripts are user-provided narration and are read verbatim; saving does not call an LLM. Generated narration retains its source verification. Existing backups include all saved script rows in the database dump.

Actual browser checks completed View/Edit/Save, reload/read-back, real MP3 playback of saved text, and Hide/Show without interrupting audio. Desktop and mobile screenshots show a single-line subtitle strip below artwork; long lines track actual audio progress and remain manually scrollable. An optional final hide-preference DOM reload hit a QA asset connection reset; the backend returned the asset correctly, and no further reload retries were made. Local storage retained the hidden preference. The released main kiosk loaded successfully in a fresh browser.

The test browser closed. Dedicated QA server, fixture deck/audio files, database and copied QA environment were removed. Main health stayed successful; live documents and history were preserved.

## Selected question breaks and PowerPoint animation playback

Question-break pages are stored per presentation, defaulting to the final slide only when unconfigured. None, All and custom selections are supported. Unselected pages skip microphone capture and the question countdown; the manual Ask a question control remains available. The policy uses the existing settings table and revision checks; no schema migration was required.

Actual isolated API checks passed default-last, None persistence across visitors, All/custom normalization, stale revision rejection, invalid-page rejection and policy metadata. Saved script revisions stayed unchanged. PDF animation metadata remained static/none. Twenty-four deterministic backend checks passed.

Actual browser question-policy checks saved only page 3 and observed narration advance through pages 1 and 2 without question phases. Microphone capture started on page 3 only. Manual Ask on page 1 remained available, and saved script pages stayed byte-identical. Desktop and mobile controls remained within the viewport with no horizontal overflow.

Native PowerPoint exported an actual 1920×1080 H.264 clip, about five seconds long. Browser frame samples at 0.1 and 3.4 seconds had mean RGB difference 28.9836, proving visible motion. A private-copy Save-before-CreateVideo fix was required; initial static test clips are not counted as motion evidence. The source PPTX remained unchanged.

Actual browser playback started native video three milliseconds after narration audio started. Pause held the video frame unchanged. Narration ended before the video; automatic advancement occurred two milliseconds after video completion. None policy opened no microphone. Saved scripts remained unchanged.

Private MP4 GET/HEAD byte ranges returned HTTP 206; invalid ranges returned 416. Supported ordinary click effects become sequential autoplay in an isolated private copy. Shape-triggered interaction is rejected with an explicit static fallback. Isolated clips cannot preserve all cross-slide Morph relationships or interactive controls; PDF pages remain static. Pending export blocks Start until preparation completes.

Dedicated QA decks, clips, settings, audio, copied environment and disposable database were removed. The owned QA server stopped and port lifecycle was recorded. Main kiosk health remained successful with AI configured; live documents and history were preserved. TypeScript, production build, PHP/PowerShell lint and six converter checks passed. Physical kiosk microphone acoustics and speaker quality remain target-device checks.


## Permanent-folder relocation and reply following

The app moved to `C:\Users\QIU\Desktop\Permanent\AI Presenter`. The old app directory is absent. All 1,765 moved files initially matched their SHA-256 manifest (294,492,894 bytes). MySQL shut down gracefully before the move. Port reservations retain the original history and now point to the permanent folder. Consistent logical backup and verified cold archive remain in `C:\Users\QIU\Documents\Codex\2026-10-23\bui\work\relocation-backup-20261023T062237Z`. The backup includes private configuration, uploaded files and database; protect its contents.

Startup initially returned successful health from the relocated PHP/MySQL instance, but did not remain running. Subsequently `start.ps1` and `backend/console.php` disappeared. Attempts to restore the exact backed-up startup file returned Access Denied despite the current user having full folder permissions. Windows protection is suspected, but no matching Defender/Avast log entry confirmed the cause. No protection setting was disabled. Runtime is currently stopped, and final browser availability and post-move database comparison remain blocked. Restore the two legitimate files through the applicable Windows protection workflow, then run `webapp docchat`, `webapp check docchat`, compare backup inventory, and verify the actual browser before claiming successful relocation readiness.

Reply following now uses the transcript container: new answers open at their beginning; spoken passages follow audio progress; manual scrolling pauses following; explicit Listen resumes it. Isolated browser checks exercised the actual React hook and SpokenText component without provider requests or user-history writes: reply offset 16.16px, active passage offset 16.09px, window scroll stayed zero and composer position stayed unchanged. Manual scroll position 100 remained unchanged through the next passage. Loading glow uses the real busy state with a 2.8-second breathing cycle, and computed animation becomes none under reduced motion. TypeScript/Vite production build passed; released assets are index-yM0ZomR-.js and index-B2UWB_aL.css. These DOM checks do not prove provider availability after relocation.


### Relocation blocker resolved after user restoration

The user confirmed restoring/allowing the launch files. Both `start.ps1` and `backend/console.php` now match the verified cold backup byte-for-byte and remain present. Standard `webapp docchat` startup succeeded from the permanent folder in a persistent foreground terminal session. Registered ports remain 3250 and 3251. Actual health returned `ok: true` and `aiConfigured: true`; startup preflight confirmed MySQL 8.4.11, InnoDB, utf8mb4, writable storage and the restricted runtime account.

Before browser access, read-only comparison confirmed identical ordered logical SHA-256 hashes and counts for all eight tables against the pre-move inventory: documents 5, messages 22, settings 1, rate_limits 6, presentations 1, presentation_slides 22, presentation_narrations 45, presentation_progress 0. No live records were altered for verification.

An isolated browser loaded the actual relocated release and healthy API. Desktop 1440x1000 and mobile 390x844 layout assertions passed without horizontal overflow. The actual screenshot is `outputs/ai-presenter-relocated.png` in the original task workspace. The page title and heading identify AI Presenter; current assets are index-yM0ZomR-.js and index-B2UWB_aL.css. Browser console reported zero errors and warnings. The verification browser closed; the foreground app launcher remains running. Provider answer generation, physical microphone and speaker output were not repeated during this read-only relocation check.


## 30 MB upload limit

Frontend, document and slide backend validation, PDF text extraction input guard, API contract and PHP startup configuration were updated. TypeScript/Vite build, PHP lint, Python syntax and contract JSON checks passed. A missing bootstrap.php blocked the first restart; after the user restored/allowed it, normal webapp docchat startup and healthy API passed. All original application code files remain present.

Actual HTTP checks used an isolated database/server and invalid-extension files, without provider calls or stored documents/decks. At exactly 31,457,280 bytes, document and presentation handlers reached file-type validation (HTTP 415). At 31,457,281 bytes, PHP upload limits rejected both (HTTP 400 with route-specific upload error). This proves the input boundary, not full indexing of a large valid document. The live browser displayed 30 MB for both upload types using index-GWgv0j7n.js, and live PHP command-line options confirmed 30M upload / 32M post limits. Audio and other safety bounds were unchanged.


## Static narration followed by embedded-video playback

PPTX media inspection follows presentation order and supplies only static textbox text for video scripts. Generated cache scopes differ only on video pages; old generated video scripts are ignored while manual edits and ordinary scripts retain precedence. Empty video-only scripts return message:null/noSpeech:true without inserting a narration message or invoking LLM/TTS. Private video streaming supports byte ranges. No schema migration was needed.

Twenty-eight focused backend regressions passed. Actual isolated API checks verified static-only generation, cache-only playback with disabled provider/model configuration, preserved manual revisions, document-scope independence, video-only empty generation, guarded empty edits and HTTP206 media delivery. Native export produced a moving 1920x1080 H.264 clip with original audio; source hash stayed unchanged. Multiple embedded videos on one slide now fail explicitly before export rather than overlapping or clipping audio; PHP/PowerShell syntax checks passed after that narrow guard.

Actual browser playback: narration ended at1792739756725; unmuted video started at1792739756729 (4ms later). Video ended at1792739763750; next slide preparation began2ms later. Video-only second slide used no speech and completed2ms after its video ended. Decoded audio RMS was0.11108; microphone calls stayed0 under None question policy. Pause held currentTime0.388934 unchanged. A controlled autoplay-denial test held the video phase, then the real Play button resumed the actual MP4. Saved scripts remained unchanged. Mobile390x844 had no horizontal overflow and controls remained inside viewport. One cancelled-media request produced ERR_CONNECTION_RESET during cancellation, while complete playback tests passed.

TypeScript/Vite production build passed (BCgG9puS/Cy8atkym), with no unbuilt frontend source. Ordinary muted animation behavior was preserved in code; it was not separately rerun in this bounded batch. Actual main release loaded with zero browser console errors/warnings. Dedicated QA deck, native clips, settings, TTS files, disposable database and owned server were removed; lifecycle was recorded. Main health remained successful with AI configured. Original user documents and conversations were not changed by these tests.
