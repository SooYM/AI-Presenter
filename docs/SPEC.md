# AI Presenter — System Specification

## 1. Overview & Scope

**AI Presenter** is a web-based, touchscreen-optimized kiosk application designed for public kiosks, conference podiums, and exhibition halls. It pairs presentation slides and reference documents with autonomous AI narration, real-time voice question-and-answer interactions, and verifiable citation checking.

---

## 2. Technical Stack & Runtime Dependencies

| Layer | Component | Version / Specification | Purpose |
|:---|:---|:---|:---|
| **Frontend Framework** | React | `^19.2.0` | Declarative UI and stage orchestration |
| **Language (Client)** | TypeScript | `^5.9.3` | Type safety and contract enforcement |
| **Build Tooling** | Vite | `^7.1.12` | Static bundling and asset compilation |
| **UI Primitives** | Radix UI | Alert Dialog, Icons | Accessible dialogs and unified icons |
| **Typography** | DM Sans (`@fontsource/dm-sans`) | `^5.2.6` | Self-hosted legible typography |
| **Backend Runtime** | PHP | `8.2+` (with curl, pdo_mysql, mbstring, fileinfo, zip) | Lightweight API gateway and controller layer |
| **Database** | MySQL | `8.0+` (Optimized for `8.4 LTS`) | Structured storage and relationship persistence |
| **Document Vectorization** | OpenAI Vector Stores & Files API | v2 Assistants API | Document passage chunking and indexing |
| **Speech-to-Text (STT)** | OpenAI Whisper / `gpt-transcribe` | Current API endpoint | Voice question audio transcription |
| **Text-to-Speech (TTS)** | OpenAI Audio API (`gpt-4o-mini-tts`) | Voices: Coral, Alloy, Sage | High-fidelity narration and answer audio |
| **PDF Processing** | Poppler Utilities | `pdfinfo`, `pdftoppm`, `pdftotext` | Slide rasterization and text extraction |
| **PowerPoint Processing** | Microsoft PowerPoint COM Automation | Microsoft 365 / Office 2016+ | Native PPTX animation and video export |
| **Test & Automation** | Playwright | `^1.50+` | Headless screenshot capture & visual regression |

---

## 3. Functional Specifications

### 3.1 Kiosk Chat & Continuous Voice Loop
- **Zero-Login Operation**: Visitors interact immediately without sign-up or credentials.
- **Audio Capture & Local Gating**:
  * Captures browser audio using `MediaRecorder` (WebM/MP4/WAV).
  * Evaluates speech audio energy levels in real-time.
  * Sends recorded speech automatically after **1.2 seconds** of detected silence.
  * Limits individual recordings to a maximum of **60 seconds**.
  * Drops buffers exceeding **30 seconds** of silence without issuing transcription API calls.
- **Microphone Protection**: The microphone is automatically released during transcription, LLM generation, and speech playback to prevent acoustic feedback loops.
- **Session Auto-Reset**: 15 minutes of inactivity automatically clears the current visitor's conversation history while preserving shared documents.

### 3.2 Document Library & Ingestion
- **Supported Formats**: PDF, DOCX, TXT, MD.
- **Size Bounds**: Maximum **30 MB** (31,457,280 bytes) per file.
- **Integrity Validation**: DOCX files undergo ZIP structure and XML verification via `php_zip`.
- **Indexing Status**: Real-time status polling (`processing` -> `ready` / `failed`).
- **Vector Scoping**: Queries can be scoped to individual documents, all ready documents, or exclusively to the active presentation deck.

### 3.3 Slide Deck Engine & Media Synchronization
- **Supported Formats**: PPTX and PDF.
- **Limits**: Maximum **30 MB**, up to **40 slides** per deck, maximum **10 decks** stored concurrently.
- **Rendering Resolution**: High-definition rasterization (1920x1080) rendered without distortion or cropping.
- **PowerPoint Animation Clips**: Authored animations render into muted MP4 clips played concurrently with slide narration.
- **Embedded Slide Videos**: Authed embedded videos in PPTX slides are extracted, narrated first via slide text, and then played with full sound.
- **Fallback Handling**: If animation conversion fails, an honest static slide fallback is rendered with an unobtrusive notice.

### 3.4 Upfront Narration Scripts & Manual Script Editor
- **Upfront Script Preparation**: The full script is generated and cached for the active deck before presenting begins.
- **Multilingual Support**: Independent scripts and narration caches for **English (`en`)** and **Chinese (`zh`)**.
- **Manual Script Editor**:
  * Accessible via the `View / edit script` icon button.
  * Allows operators to edit slide narration text up to **12,000 characters**.
  * Edits are stored verbatim and bypass LLM regeneration.
  * Optimistic concurrency control via revision hashes (`409 script_conflict`) prevents lost edits.

### 3.5 Audience Question Breaks & Floor Q&A
- **Question Break Configuration**:
  * Deck-specific policy defining which slides pause for audience questions.
  * Quick presets: `None`, `Last slide`, or `All slides`.
- **Floor Question Countdown**: Configurable countdown (5s, 8s, 15s, 30s; default 8s) during which the microphone listens.
- **Grounding Scope for Q&A**: Answers are grounded in the active slide, full deck content, and any selected supporting documents.
- **Language Matching**: Floor replies automatically match the spoken/written language of the audience member.

---

## 4. API Specification & HTTP Contracts

All API requests are routed to `/api/index.php?action=<action>`.

### Common Headers
- `Content-Type: application/json` (or `multipart/form-data` for uploads)
- `X-CSRF-Token`: Required on all mutating requests (`POST`).
- `Range: bytes=start-end`: Supported on binary media routes (`slide-animation`, `slide-video`).

### Route Catalog

| Action | Method | Description | Request Parameters / Payload | Response Schema |
|:---|:---|:---|:---|:---|
| `health` | `GET` | Health check and API key readiness | None | `{"ok": true, "aiConfigured": boolean}` |
| `session` | `GET` | Retrieve session token and flags | None | `{"authenticated": true, "csrfToken": string, "configured": boolean, "aiConfigured": boolean}` |
| `new-session` | `POST` | Clear conversation and rotate CSRF token | None | `Session` object |
| `documents` | `GET` | List all shared library documents | None | `{"documents": Document[]}` |
| `upload` | `POST` | Upload document to library | `multipart/form-data` with `file` | `{"document": Document}` (Status: 201) |
| `delete-document` | `POST` | Remove document from library and vector store | `{"id": number}` | `{"ok": true}` |
| `messages` | `GET` | Fetch current conversation history | None | `{"messages": Message[]}` |
| `chat` | `POST` | Submit question for grounded answer | `{"message": string, "documentIds": number[], "presentationId"?: number, "page"?: number}` | `{"message": Message}` |
| `clear-chat` | `POST` | Reset current visitor's chat messages | None | `{"ok": true}` |
| `transcribe` | `POST` | Transcribe voice recording via Whisper | `multipart/form-data` with `audio` | `{"text": string}` |
| `speech` | `POST` | Generate/stream TTS MP3 audio | `{"messageId": number, "voice": string, "segmentIndex"?: number}` | `audio/mpeg` binary |
| `presentations` | `GET` | List all slide decks | None | `{"presentations": Presentation[]}` |
| `upload-presentation` | `POST` | Upload new PPTX or PDF deck | `multipart/form-data` with `file` | `{"presentation": Presentation}` (Status: 201) |
| `prepare-presentation` | `POST` | Progressively render deck pages | `{"id": number}` | `{"presentation": Presentation, "done": boolean}` |
| `presentation` | `GET` | Get deck details, slides, and question policy | `id=<number>` (Query param) | `{"presentation": Presentation, "slides": Slide[], "questionPolicy": Policy}` |
| `slide-image` | `GET` | Serve rendered slide PNG | `id=<number>&page=<number>` | `image/png` binary |
| `slide-narration` | `POST` | Retrieve cached slide narration message | `{"id": number, "page": number, "language": "en"\|"zh"}` | `{"cached": true, "message": Message}` |
| `script` | `GET` | Retrieve saved script for editing | `id=<number>&language="en"\|"zh"` | `{"pages": ScriptPage[], "script": ScriptStatus}` |
| `save-script` | `POST` | Save operator script verbatim | `{"id": number, "page": number, "language": string, "content": string, "revision": string}` | `{"page": ScriptPage, "script": ScriptStatus}` |
| `question-policy` | `GET` | Get question break configuration | `id=<number>` (Query param) | `{"policy": QuestionPolicy}` |
| `save-question-policy`| `POST` | Update question break slide numbers | `{"id": number, "pages": number[], "revision": string}` | `{"policy": QuestionPolicy}` |
| `prepare-animation` | `POST` | Progressively export slide MP4 media | `{"id": number, "page": number}` | `{"animation": AnimationMeta, "cached": boolean}` |
| `slide-animation` | `GET` | Stream slide animation MP4 | `id=<number>&page=<number>` (supports HTTP Range) | `video/mp4` binary |
| `slide-video` | `GET` | Stream slide embedded video MP4 | `id=<number>&page=<number>` (supports HTTP Range) | `video/mp4` binary |

---

## 5. Non-Functional Specifications & Bounds

### Performance & Latency
- **Initial App Load**: Under **1.5 seconds** over local Gigabit/LAN.
- **Audio Streaming Latency**: First chunk of TTS audio stream initiates in under **800ms**.
- **Slide Advancement**: Instantaneous cached page transition (< **100ms**).
- **Speech Segment Prefetching**: At most **2 upcoming audio segments** prefetched to conserve provider bandwidth.

### Storage & Bounds Enforcement
- Document file upload: Max **30 MB** (31,457,280 bytes).
- Slide presentation upload: Max **30 MB** (31,457,280 bytes), Max **40 slides**.
- Maximum total presentations: **10 decks** (enforces FIFO deletion of oldest unpinned decks).
- Audio recording upload: Max **10 MB** (10,485,760 bytes).
- Spoken script length: Max **12,000 characters** per slide.
- Chat question length: Max **4,000 characters**.
- Citation length: Max **900 characters** per verified quote.
- Rate limiting: Max **60 chat requests/minute** per IP; max **120 static reads/minute**.
