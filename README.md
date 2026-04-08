# Zürichsee Bridge Agent

A RAG-based AI stakeholder agent for the Zürichsee bridge planning meeting.  
Built for CSCW 2026 (University of Zurich) — Homework 3.

## What This Is

An AI agent that represents absent stakeholders in a political planning meeting about a proposed bridge over Lake Zürich. Unlike a standard chatbot, this agent:

1. **Retrieves** relevant passages from a document corpus (Swiss laws, position papers, meeting minutes) using TF-IDF
2. **Generates** responses grounded in those documents, not from general training data
3. **Maintains persona** — the same documents are interpreted differently by each stakeholder (environmental lawyer vs. business representative vs. mobility advocate)

This is a **Retrieval-Augmented Generation (RAG)** architecture.

## Architecture

```
User query → Express API → TF-IDF Retrieval → Top-k chunks → Anthropic API → Response
                                ↑                                    ↑
                          chunks.json                         Persona system prompt
                       (preprocessed PDFs)
```

## Setup

### Prerequisites
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Add your API key

```bash
cd backend
cp .env.example .env
# Edit .env and add your Anthropic API key
```

### 3. Add your PDFs

Place your document corpus (laws, position papers, reports) into:
```
backend/data/pdfs/
```

### 4. Preprocess the documents

```bash
cd backend
npm run preprocess
```

This extracts text from all PDFs, chunks it, and saves `data/chunks.json`.

### 5. Start the backend

```bash
npm start
```

### 6. Start the frontend

```bash
cd frontend
npm run dev
```

## Available Stakeholders

| Agent | Organization | Perspective |
|-------|-------------|-------------|
| Alex | Pro Natura | Environmental law, biodiversity protection |
| Dr. Markus Berger | Zürcher Handelskammer | Economic connectivity, business competitiveness |
| Laura Steiner | VCS | Sustainable mobility, public transport, cycling |
| Prof. Elisabeth Brunner | Schweizer Heimatschutz | Cultural landscape, heritage protection |

## Tech Stack

- **Backend**: Node.js, Express, `natural` (TF-IDF), `pdf-parse`
- **Frontend**: React (Vite)
- **LLM**: Claude Sonnet via Anthropic API
- **Retrieval**: TF-IDF (term frequency–inverse document frequency)
