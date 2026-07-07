# 🎙️ PronounceAI — Advanced English Pronunciation Assessment App

A state-of-the-art, premium full-stack web application designed to analyze English pronunciation and fluency in real-time. The application accepts recorded or uploaded audio clips (30–45 seconds) and provides diagnostic feedback, visual accent comparisons, dynamic coaching tips, and interactive metrics.

This project is built for high performance, utilizing in-memory processing to guarantee compliance with modern data privacy frameworks (including **DPDP Act 2023**).

---

## 🌟 Key Features

*   **Overall Pronunciation Score (0-100)**: Evaluated dynamically using a weighted composite formula: **70% Clarity** (based on acoustic transcription confidence) and **30% Fluency** (based on inter-word pause distribution).
*   **Concentric Accent Diagnostics Bento Console**: An interactive, SVG-powered diagnostic dashboard categorizing pronunciation issues into **6 core error types**:
    *   `Vowel Distortion` (Violet)
    *   `Consonant Mismatch` (Indigo)
    *   `Syllable Emphasis` (Sky Blue)
    *   `Sound Omission` (Teal)
    *   `Extra Insertion` (Fuchsia)
    *   `Muffled Articulation` (Slate)
*   **Coach Spotlight Card**: Provides real-time interactive mouth mechanics coordinates, target practice word clouds, and actionable coaching tips for the active error category.
*   **Dynamic Interactive Transcript**: Highlights flagged mispronounced words (Mild, Moderate, Severe) with interactive popover tooltips displaying phonetics, specific errors, and suggested corrections.
*   **AI Speech Enhancer**: A dual-waveform comparison utility:
    *   **User Track**: Interactive playback visualizer that maps your recorded voice to an animated timeline.
    *   **AI Optimized Track**: Synthesizes the target corrected text using SpeechSynthesis with custom time-estimation progress highlights.
*   **Privacy-First Architecture**: Audio processing is executed entirely in-memory. Audio buffers are discarded immediately after transcription; no user voice files are saved to disk or external databases.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js 14 (App Router) | React server-side rendering & API routes |
| **Speech-to-Text** | Deepgram Nova-2 | High-precision word-level transcription and confidence metrics |
| **Coaching AI** | Nvidia LLaMA-3.1 (Instruct) | Generates plain-English coaching tips, mouth guides, and error classifications |
| **Feedback AI** | Anthropic Claude 3.5 Sonnet | Dual-classifier pass for detailed phonetic corrections |
| **Phoneme Lookup** | CMU Pronouncing Dictionary | Offline phonetic mapping via `pronouncing` database |
| **Styling** | Tailwind CSS & Vanilla CSS | Glassmorphic visual theme with fluid transitions & gradients |
| **Deployment** | Vercel | Production cloud deployment |

---

## 📦 Project Structure

```text
pronunciation-app/
├── app/
│   ├── api/analyze/route.ts    # Secure audio analysis pipeline (POST API)
│   ├── globals.css             # Global Tailwind rules + custom glassmorphic properties
│   ├── layout.tsx              # Root HTML wrapper with Outfit/Inter fonts & SEO metadata
│   └── page.tsx                # Main application interface and landing layout
├── components/
│   ├── AudioRecorder.tsx       # MediaRecorder browser audio capture with live visualizer
│   ├── AudioUploader.tsx       # Drag-and-drop file uploader (WAV, MP3, M4A)
│   ├── ProgressIndicator.tsx   # Fluid multistep analysis progress stepper
│   ├── ResultsView.tsx         # Semicircular score gauge & Concentric Diagnostics Console
│   ├── SpeechWaveCompare.tsx   # AI Speech Enhancer dual-waveform comparison
│   └── WordTooltip.tsx         # Interactive phonetic helper tooltip
├── lib/
│   ├── phonemes.ts             # Offline CMU Pronouncing Dictionary adapter
│   ├── scoring.ts              # Mathematical Clarity and Fluency scoring engines
│   └── types.ts                # Unified TypeScript type interfaces
├── .env.example                # Shared API configuration template
├── ARCHITECTURE.md             # In-depth architectural and DPDP compliance guide
├── README.md                   # Project overview and installation guide
├── package.json                # Project dependencies and script commands
├── tailwind.config.ts          # Tailwind theme configuration
└── tsconfig.json               # TypeScript configuration properties
```

---

## 🚀 Getting Started

### Prerequisites

*   Node.js 18.x or higher installed.
*   A Deepgram API key (sign up for free trial credits at [deepgram.com](https://deepgram.com)).
*   An Nvidia Build API key (sign up at [build.nvidia.com](https://build.nvidia.com)).
*   *(Optional)* An Anthropic API key (sign up at [console.anthropic.com](https://console.anthropic.com)).

### 1. Installation

Clone the repository and install the project dependencies:

```bash
git clone https://github.com/vishnuHas/AI-pronunciation.git
cd pronunciation-app
npm install
```

### 2. Environment Setup

Create your local environment file by copying the template:

```bash
cp .env.example .env.local
```

Open `.env.local` and enter your API keys:

```env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
NVIDIA_API_KEY=your_nvidia_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

> [!IMPORTANT]
> To prevent accidental credential leaks, `.env.local` and `.env` files are automatically ignored by git inside `.gitignore`. **Never commit your API keys to the repository.**

### 3. Run the Development Server

Start the local server:

```bash
npm run dev
```

The application will be accessible at [http://localhost:3000](http://localhost:3000) (or port `3001` if running on custom port configurations).

### 4. Build for Production

Compile and run the production build locally:

```bash
npm run build
npm run start
```

---

## 🔒 Privacy & Compliance (DPDP Act 2023)

The application implements a strict **no-retention** pipeline:
1.  **In-Memory Processing**: Uploaded or recorded audio is held only within volatile memory (RAM) as a buffer.
2.  **API Requests**: The buffer is piped directly to the Speech-to-Text API and is never saved to the local server disk.
3.  **Immediate Purge**: The memory buffer is forcefully garbage-collected the moment the transcription response is received.
4.  **No Databases**: There is no database or persistent storage connected to the app, making it fully compliant with strict data erasure principles.

---

## 🛠️ Calibration & Customization

You can adjust the scoring sensitivity and thresholds in the source code:

| Parameter | File Location | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `CONFIDENCE_THRESHOLD` | [app/api/analyze/route.ts](file:///app/api/analyze/route.ts) | `0.75` | Words with confidence below this are flagged for analysis. |
| `MIN_DURATION_SECONDS` | [app/api/analyze/route.ts](file:///app/api/analyze/route.ts) | `30` | Server-enforced minimum audio duration. |
| `MAX_DURATION_SECONDS` | [app/api/analyze/route.ts](file:///app/api/analyze/route.ts) | `45` | Server-enforced maximum audio duration. |
| `LONG_PAUSE_THRESHOLD_SECONDS` | [lib/scoring.ts](file:///lib/scoring.ts) | `0.5` | Silent intervals longer than this reduce the Fluency score. |

---

## 📄 License

This project is licensed under the MIT License.
