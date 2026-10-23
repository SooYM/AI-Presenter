import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function generateSlideSvg(pageNumber, title, subtitle) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#04090e" />
        <stop offset="50%" stop-color="#0a1824" />
        <stop offset="100%" stop-color="#050e17" />
      </linearGradient>
      <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0e2233" stop-opacity="0.8" />
        <stop offset="100%" stop-color="#091722" stop-opacity="0.8" />
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#79e4f3" />
        <stop offset="100%" stop-color="#38bdf8" />
      </linearGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)" />
    
    <!-- Tech grid lines -->
    <line x1="80" y1="120" x2="1840" y2="120" stroke="#1d3547" stroke-width="1.5" stroke-dasharray="8 6" />
    <line x1="80" y1="980" x2="1840" y2="980" stroke="#1d3547" stroke-width="1.5" stroke-dasharray="8 6" />
    <circle cx="960" cy="540" r="420" stroke="#142b3b" stroke-width="1" fill="none" />
    <circle cx="960" cy="540" r="560" stroke="#0e202c" stroke-width="1" stroke-dasharray="12 12" fill="none" />

    <!-- Top Badge & Header -->
    <rect x="80" y="55" width="220" height="38" rx="6" fill="#122a3b" stroke="#224c68" stroke-width="1" />
    <text x="190" y="80" font-family="'DM Sans', system-ui, sans-serif" font-size="16" font-weight="600" fill="#79e4f3" text-anchor="middle" letter-spacing="2">SHOWCASE DECK</text>
    <text x="1840" y="80" font-family="'DM Sans', system-ui, sans-serif" font-size="16" font-weight="500" fill="#628296" text-anchor="end">Slide ${pageNumber} / 5</text>

    <!-- Slide Title -->
    <text x="80" y="210" font-family="'DM Sans', system-ui, sans-serif" font-size="52" font-weight="700" fill="#ffffff" letter-spacing="-0.5">${title}</text>
    <text x="80" y="270" font-family="'DM Sans', system-ui, sans-serif" font-size="24" font-weight="400" fill="#9bb2c0">${subtitle}</text>

    <!-- 3 Cards -->
    <!-- Card 1 -->
    <g transform="translate(80, 340)">
      <rect width="550" height="540" rx="16" fill="url(#cardGrad)" stroke="#1e3e54" stroke-width="1.5" />
      <rect x="36" y="40" width="48" height="48" rx="10" fill="#13354b" />
      <text x="60" y="72" font-family="'DM Sans', system-ui, sans-serif" font-size="22" font-weight="700" fill="#79e4f3" text-anchor="middle">01</text>
      <text x="36" y="140" font-family="'DM Sans', system-ui, sans-serif" font-size="28" font-weight="700" fill="#ffffff">Document Grounding</text>
      <text x="36" y="190" font-family="'DM Sans', system-ui, sans-serif" font-size="19" font-weight="400" fill="#9bb2c0">
        <tspan x="36" dy="0">Embeddings indexed directly into</tspan>
        <tspan x="36" dy="32">OpenAI vector store. Verified quotes</tspan>
        <tspan x="36" dy="32">are cross-checked against source text</tspan>
        <tspan x="36" dy="32">to eliminate hallucinated claims.</tspan>
      </text>
      <rect x="36" y="450" width="180" height="36" rx="6" fill="#133044" />
      <text x="126" y="474" font-family="'DM Sans', system-ui, sans-serif" font-size="14" font-weight="600" fill="#79e4f3" text-anchor="middle">STRICT CITATIONS</text>
    </g>

    <!-- Card 2 -->
    <g transform="translate(685, 340)">
      <rect width="550" height="540" rx="16" fill="url(#cardGrad)" stroke="#1e3e54" stroke-width="1.5" />
      <rect x="36" y="40" width="48" height="48" rx="10" fill="#13354b" />
      <text x="60" y="72" font-family="'DM Sans', system-ui, sans-serif" font-size="22" font-weight="700" fill="#79e4f3" text-anchor="middle">02</text>
      <text x="36" y="140" font-family="'DM Sans', system-ui, sans-serif" font-size="28" font-weight="700" fill="#ffffff">Autonomous Narration</text>
      <text x="36" y="190" font-family="'DM Sans', system-ui, sans-serif" font-size="19" font-weight="400" fill="#9bb2c0">
        <tspan x="36" dy="0">Upfront script generation with</tspan>
        <tspan x="36" dy="32">verbatim manual editing overrides.</tspan>
        <tspan x="36" dy="32">High-fidelity speech streaming with</tspan>
        <tspan x="36" dy="32">real-time subtitle highlighting.</tspan>
      </text>
      <rect x="36" y="450" width="180" height="36" rx="6" fill="#133044" />
      <text x="126" y="474" font-family="'DM Sans', system-ui, sans-serif" font-size="14" font-weight="600" fill="#79e4f3" text-anchor="middle">VERBATIM TTS</text>
    </g>

    <!-- Card 3 -->
    <g transform="translate(1290, 340)">
      <rect width="550" height="540" rx="16" fill="url(#cardGrad)" stroke="#1e3e54" stroke-width="1.5" />
      <rect x="36" y="40" width="48" height="48" rx="10" fill="#13354b" />
      <text x="60" y="72" font-family="'DM Sans', system-ui, sans-serif" font-size="22" font-weight="700" fill="#79e4f3" text-anchor="middle">03</text>
      <text x="36" y="140" font-family="'DM Sans', system-ui, sans-serif" font-size="28" font-weight="700" fill="#ffffff">Floor Q&amp;A Loop</text>
      <text x="36" y="190" font-family="'DM Sans', system-ui, sans-serif" font-size="19" font-weight="400" fill="#9bb2c0">
        <tspan x="36" dy="0">Hands-free voice activity gate</tspan>
        <tspan x="36" dy="32">pauses progression on speech.</tspan>
        <tspan x="36" dy="32">Answers grounded across slides</tspan>
        <tspan x="36" dy="32">and supporting reference files.</tspan>
      </text>
      <rect x="36" y="450" width="180" height="36" rx="6" fill="#133044" />
      <text x="126" y="474" font-family="'DM Sans', system-ui, sans-serif" font-size="14" font-weight="600" fill="#79e4f3" text-anchor="middle">INTERACTIVE AUDIO</text>
    </g>

    <!-- Footer -->
    <text x="80" y="1025" font-family="'DM Sans', system-ui, sans-serif" font-size="16" font-weight="500" fill="#4d697d">AI Presenter Platform • Zero-Login Interactive Touchscreen Kiosk</text>
    <text x="1840" y="1025" font-family="'DM Sans', system-ui, sans-serif" font-size="16" font-weight="500" fill="#4d697d" text-anchor="end">Confidential &amp; Proprietary</text>
  </svg>`;
}

async function setupGenericRoutes(page) {
  await page.route('**/api/index.php?action=*', async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');

    if (action === 'session') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          csrfToken: 'showcase-token-generic-789xyz',
          configured: true,
          aiConfigured: true
        })
      });
    }

    if (action === 'health') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, aiConfigured: true })
      });
    }

    if (action === 'presentation-progress') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ progress: null })
      });
    }

    if (action === 'documents') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: [
            {
              id: 1,
              name: 'Enterprise-Architecture-Spec.pdf',
              size: 2450120,
              status: 'ready',
              error: '',
              createdAt: '2026-10-22T08:00:00Z'
            },
            {
              id: 2,
              name: 'Security-and-Compliance-Policy.docx',
              size: 1120400,
              status: 'ready',
              error: '',
              createdAt: '2026-10-22T09:30:00Z'
            },
            {
              id: 3,
              name: 'Touchscreen-Kiosk-User-Guide.md',
              size: 185600,
              status: 'ready',
              error: '',
              createdAt: '2026-10-23T04:15:00Z'
            }
          ]
        })
      });
    }

    if (action === 'presentations') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          presentations: [
            {
              id: 10,
              name: 'AI-Presenter-Overview.pptx',
              size: 16840000,
              status: 'ready',
              pageCount: 5,
              preparedPages: 5,
              error: '',
              createdAt: '2026-10-23T06:00:00Z'
            }
          ]
        })
      });
    }

    if (action === 'presentation') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          presentation: {
            id: 10,
            name: 'AI-Presenter-Overview.pptx',
            size: 16840000,
            status: 'ready',
            pageCount: 5,
            preparedPages: 5,
            error: '',
            createdAt: '2026-10-23T06:00:00Z'
          },
          slides: [
            {
              page: 1,
              title: 'AI Presenter: Autonomous Kiosk & Presentation Platform',
              imageUrl: '/api/index.php?action=slide-image&id=10&page=1',
              animationStatus: 'ready',
              animationUrl: null,
              videoStatus: 'none',
              videoUrl: null,
              containsVideo: false,
              videoOnly: false
            },
            {
              page: 2,
              title: 'Architecture: Grounded RAG & Strict Citation Proof',
              imageUrl: '/api/index.php?action=slide-image&id=10&page=2',
              animationStatus: 'ready',
              animationUrl: null,
              videoStatus: 'none',
              videoUrl: null,
              containsVideo: false,
              videoOnly: false
            },
            {
              page: 3,
              title: 'Continuous Hands-Free Voice Interaction Loop',
              imageUrl: '/api/index.php?action=slide-image&id=10&page=3',
              animationStatus: 'ready',
              animationUrl: null,
              videoStatus: 'none',
              videoUrl: null,
              containsVideo: false,
              videoOnly: false
            },
            {
              page: 4,
              title: 'Interactive Audience Floor Questions',
              imageUrl: '/api/index.php?action=slide-image&id=10&page=4',
              animationStatus: 'ready',
              animationUrl: null,
              videoStatus: 'none',
              videoUrl: null,
              containsVideo: false,
              videoOnly: false
            },
            {
              page: 5,
              title: 'Deployment Topology & Hardware Specifications',
              imageUrl: '/api/index.php?action=slide-image&id=10&page=5',
              animationStatus: 'ready',
              animationUrl: null,
              videoStatus: 'none',
              videoUrl: null,
              containsVideo: false,
              videoOnly: false
            }
          ],
          questionPolicy: {
            deckId: 10,
            pages: [3, 5],
            revision: 'rev-generic-policy-789'
          }
        })
      });
    }

    if (action === 'slide-image') {
      const pageNum = url.searchParams.get('page') || '1';
      const svg = generateSlideSvg(
        pageNum,
        pageNum === '1' ? 'AI Presenter: Autonomous Platform Overview' :
        pageNum === '2' ? 'Grounded Ingestion & Citation Checking' :
        pageNum === '3' ? 'Continuous Voice & Speech Synthesis' :
        pageNum === '4' ? 'Audience Floor Questions & Presets' : 'Enterprise Hardware & Security Topology',
        'Next-generation interactive kiosk technology with verifiable evidence grounding'
      );
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: svg
      });
    }

    if (action === 'messages') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messages: [
            {
              id: 1,
              role: 'user',
              kind: 'chat',
              content: 'How does AI Presenter handle slide presentations and audience floor questions?',
              citations: [],
              createdAt: '2026-10-23T06:05:00Z'
            },
            {
              id: 2,
              role: 'assistant',
              kind: 'chat',
              content: 'AI Presenter pre-renders every slide into high-definition graphics and pre-generates verified narration scripts upfront. When delivering a presentation, it reads each slide\'s script verbatim with synchronized subtitle captions. On designated question-break slides, it opens the microphone for a configurable audience Q&A window, pauses progression while answering from slide evidence and supporting documents, and resumes once the question concludes.',
              citations: [
                {
                  documentId: 1,
                  name: 'Enterprise-Architecture-Spec.pdf',
                  quote: 'On designated question-break slides, the presenter opens the microphone for a configurable countdown, answering audience questions grounded strictly in slide evidence.'
                }
              ],
              speechSegments: [
                'AI Presenter pre-renders every slide into high-definition graphics and pre-generates verified narration scripts upfront.',
                'When delivering a presentation, it reads each slide\'s script verbatim with synchronized subtitle captions.',
                'On designated question-break slides, it opens the microphone for a configurable audience Q&A window, pauses progression while answering from slide evidence and supporting documents, and resumes once the question concludes.'
              ],
              createdAt: '2026-10-23T06:05:05Z'
            }
          ]
        })
      });
    }

    if (action === 'slide-narration') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cached: true,
          message: {
            id: 201,
            role: 'assistant',
            kind: 'slide-narration',
            content: 'Welcome to the AI Presenter showcase. Today we are demonstrating our autonomous presentation platform designed for touch kiosks and audience engagements. The system pre-renders slide artwork, generates verified scripts, and pauses for interactive audience questions.',
            citations: [
              {
                documentId: 0,
                presentationId: 10,
                page: 1,
                name: 'AI-Presenter-Overview.pptx',
                quote: 'Autonomous presentation platform for public touchscreen kiosks with verifiable grounded citations.'
              }
            ],
            speechSegments: [
              'Welcome to the AI Presenter showcase.',
              'Today we are demonstrating our autonomous presentation platform designed for touch kiosks and audience engagements.',
              'The system pre-renders slide artwork, generates verified scripts, and pauses for interactive audience questions.'
            ],
            createdAt: '2026-10-23T06:01:00Z'
          }
        })
      });
    }

    if (action === 'script') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          script: {
            deckId: 10,
            language: 'en',
            status: 'ready',
            preparedPages: 5,
            pageCount: 5
          },
          pages: [
            {
              page: 1,
              content: 'Welcome to the AI Presenter showcase. Today we are demonstrating our autonomous presentation platform designed for touch kiosks and audience engagements. The system pre-renders slide artwork, generates verified scripts, and pauses for interactive audience questions.',
              revision: 'rev-1',
              source: 'generated',
              updatedAt: '2026-10-23T06:01:00Z'
            },
            {
              page: 2,
              content: 'Our architecture pairs an upfront vector ingestion engine with strict citation verification. Every factual statement is cross-checked against source documents before synthesis.',
              revision: 'rev-2',
              source: 'generated',
              updatedAt: '2026-10-23T06:01:00Z'
            },
            {
              page: 3,
              content: 'The hands-free continuous voice loop detects when speech finishes, pauses microphone capture during playback to eliminate feedback, and highlights spoken sentences in real time.',
              revision: 'rev-3',
              source: 'manual',
              updatedAt: '2026-10-23T06:10:00Z'
            },
            {
              page: 4,
              content: 'During audience breaks, the kiosk listens for floor inquiries. Supporting reference documents enrich answers without altering the core slide script.',
              revision: 'rev-4',
              source: 'generated',
              updatedAt: '2026-10-23T06:01:00Z'
            },
            {
              page: 5,
              content: 'In summary, AI Presenter delivers enterprise reliability, strict grounding guarantees, and an immersive user experience suitable for modern exhibition kiosks.',
              revision: 'rev-5',
              source: 'generated',
              updatedAt: '2026-10-23T06:01:00Z'
            }
          ]
        })
      });
    }

    if (action === 'question-policy') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          policy: {
            deckId: 10,
            pages: [3, 5],
            revision: 'rev-generic-policy-789'
          }
        })
      });
    }

    if (action === 'script-status') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          script: {
            deckId: 10,
            language: 'en',
            status: 'ready',
            preparedPages: 5,
            pageCount: 5
          }
        })
      });
    }

    // Default passthrough for other routes
    return route.continue();
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  await setupGenericRoutes(page);

  console.log('Navigating to http://127.0.0.1:3250 with generic showcase routes ...');
  await page.goto('http://127.0.0.1:3250', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Main Kiosk View
  console.log('Capturing 01-main-kiosk.png ...');
  await page.screenshot({ path: path.join(outDir, '01-main-kiosk.png') });

  // 2. Open Settings Drawer
  console.log('Opening settings ...');
  const gearBtn = page.locator('.settings-toggle').first();
  await gearBtn.click();
  await page.waitForTimeout(700);

  console.log('Capturing 02-settings-drawer-top.png ...');
  await page.screenshot({ path: path.join(outDir, '02-settings-drawer-top.png') });

  // Scroll settings drawer to bottom
  await page.evaluate(() => {
    const el = document.querySelector('#library-content');
    if (el) el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(600);
  console.log('Capturing 03-settings-drawer-bottom.png ...');
  await page.screenshot({ path: path.join(outDir, '03-settings-drawer-bottom.png') });

  // 3. Open Presentation Mode by selecting the presentation
  console.log('Selecting deck via "Open presentation" ...');
  await page.evaluate(() => {
    const el = document.querySelector('#library-content');
    if (el) el.scrollTop = 200;
  });
  await page.waitForTimeout(400);

  const openPresentationBtn = page.locator('button:has-text("Open presentation")').first();
  if (await openPresentationBtn.isVisible()) {
    await openPresentationBtn.click();
    await page.waitForTimeout(1000);
  }

  // Ensure settings dialog is closed
  const closeSettingsBtn = page.locator('button[aria-label="Close settings"]').first();
  if (await closeSettingsBtn.isVisible()) {
    await closeSettingsBtn.click();
    await page.waitForTimeout(500);
  }

  // Check if Slides switch is visible
  const slidesSwitch = page.locator('button:has-text("Slides")').first();
  if (await slidesSwitch.isVisible()) {
    await slidesSwitch.click();
    await page.waitForTimeout(1000);
  }

  // 4. Capture Presentation Mode
  console.log('Capturing 04-presentation-mode.png ...');
  await page.screenshot({ path: path.join(outDir, '04-presentation-mode.png') });

  // 5. Open Script Editor
  console.log('Opening Script Editor ...');
  const viewScriptBtn = page.locator('[data-testid="view-script"]').first();
  if (await viewScriptBtn.isVisible()) {
    await viewScriptBtn.click();
    await page.waitForTimeout(1000);
    console.log('Capturing 05-script-editor.png ...');
    await page.screenshot({ path: path.join(outDir, '05-script-editor.png') });

    const closeScriptBtn = page.locator('button[aria-label="Close script editor"]').first();
    if (await closeScriptBtn.isVisible()) {
      await closeScriptBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
  }

  // 6. Presentation Ask a Question Overlay
  console.log('Opening Ask a question overlay ...');
  const askBtn = page.locator('[data-testid="presentation-question"]').first();
  if (await askBtn.isVisible()) {
    await askBtn.click();
    await page.waitForTimeout(800);
    console.log('Capturing 06-presentation-ask-overlay.png ...');
    await page.screenshot({ path: path.join(outDir, '06-presentation-ask-overlay.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 7. Mobile View
  console.log('Capturing mobile view ...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true
  });
  const mobilePage = await mobileContext.newPage();
  await setupGenericRoutes(mobilePage);
  await mobilePage.goto('http://127.0.0.1:3250', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(1000);
  console.log('Capturing 07-mobile-kiosk.png ...');
  await mobilePage.screenshot({ path: path.join(outDir, '07-mobile-kiosk.png') });

  await browser.close();
  console.log('All generic showcase screenshots captured successfully.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
