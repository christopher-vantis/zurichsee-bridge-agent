/**
 * EXPRESS SERVER
 * ==============
 * This is the API that the React frontend calls.
 *
 * Endpoints:
 *   POST /api/chat     — Main endpoint: receive query + persona, retrieve, generate
 *   GET  /api/personas — List available stakeholder personas
 *   GET  /api/stats    — Knowledge base statistics
 *
 * THE RAG PIPELINE IN ACTION:
 * When a POST hits /api/chat, here's what happens:
 *
 *   1. Parse the request (query, personaId, conversation history)
 *   2. RETRIEVE: Call retriever.retrieve(query) to get relevant chunks
 *   3. GENERATE: Call generate() with chunks + persona + query
 *   4. Return: the response + metadata (sources, chunks, token usage)
 *
 * This two-step pipeline is the core architectural difference between
 * a RAG agent and a simple chatbot.
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import retriever from "./retrieval.js";
import { generate, moderate } from "./generation.js";
import personas from "./personas.js";

// Load environment variables from .env file
dotenv.config();

// Verify API key is present
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("\n✗ ANTHROPIC_API_KEY not found in environment.");
  console.error("  Create a .env file in the backend/ directory with:");
  console.error("  ANTHROPIC_API_KEY=sk-ant-...\n");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────────────────
app.use(cors()); // Allow frontend to call the API
app.use(express.json({ limit: "1mb" }));

// ── Initialize the retriever at startup ────────────────────────────────
console.log("\n=== Zürichsee Bridge Agent — Starting ===\n");
try {
  retriever.load();
} catch (error) {
  console.error("✗ Failed to load knowledge base:", error.message);
  console.error("  Make sure you've run: npm run preprocess\n");
  process.exit(1);
}

// ── ROUTES ─────────────────────────────────────────────────────────────

/**
 * GET /api/personas
 * Returns the list of available stakeholder agents.
 * The frontend uses this to render the persona selector.
 */
app.get("/api/personas", (req, res) => {
  const list = Object.values(personas).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    organization: p.organization,
    color: p.color,
    icon: p.icon,
    shortDescription: p.shortDescription,
  }));
  res.json(list);
});

/**
 * GET /api/stats
 * Returns knowledge base statistics.
 */
app.get("/api/stats", (req, res) => {
  const stats = retriever.getStats();
  if (!stats) {
    return res.status(503).json({ error: "Knowledge base not loaded" });
  }
  res.json(stats);
});

/**
 * POST /api/chat
 * The main RAG endpoint.
 *
 * Request body:
 *   {
 *     query: "What is your position on the bridge?",
 *     personaId: "alex",
 *     history: [
 *       { role: "user", content: "..." },
 *       { role: "assistant", content: "..." }
 *     ]
 *   }
 *
 * Response:
 *   {
 *     response: "As Pro Natura's representative...",
 *     sources: {
 *       documentsUsed: ["pronatura_mission.pdf", "nhg.pdf"],
 *       chunksUsed: [{ id, source, score, preview }]
 *     },
 *     meta: { model, tokensUsed, retrievalTimeMs, generationTimeMs }
 *   }
 */
app.post("/api/chat", async (req, res) => {
  const { query, personaId, history = [] } = req.body;

  // ── Validate input ─────────────────────────────────────────────────
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ error: "query is required" });
  }

  if (!personaId || !personas[personaId]) {
    return res.status(400).json({
      error: `Invalid personaId. Available: ${Object.keys(personas).join(", ")}`,
    });
  }

  const persona = personas[personaId];

  try {
    // ── Step 1: RETRIEVE ─────────────────────────────────────────────
    // Build an enriched retrieval query from the current message plus
    // keywords from recent conversation turns, so retrieval is aware
    // of what has already been discussed.
    const retrievalStart = Date.now();
    const recentContext = history
      .slice(-4)
      .map((m) => m.content)
      .join(" ")
      .replace(/<[^>]*>/g, " ") // strip XML tags injected in debate mode
      .slice(0, 400);
    const retrievalQuery = recentContext ? `${query} ${recentContext}` : query;
    const retrievedChunks = retriever.retrieve(retrievalQuery, 5);
    const retrievalTimeMs = Date.now() - retrievalStart;

    console.log(
      `[${persona.name}] Query: "${query.slice(0, 60)}..." → ${retrievedChunks.length} chunks retrieved (${retrievalTimeMs}ms)`
    );

    // Log which documents were hit (useful for debugging)
    for (const chunk of retrievedChunks) {
      console.log(
        `  → ${chunk.id} from ${chunk.source} (score: ${chunk.score.toFixed(2)})`
      );
    }

    // ── Step 2: GENERATE ─────────────────────────────────────────────
    // Pass the retrieved chunks to the LLM along with the persona
    // and conversation history.
    const generationStart = Date.now();
    const result = await generate({
      query,
      retrievedChunks,
      persona,
      conversationHistory: history,
    });
    const generationTimeMs = Date.now() - generationStart;

    console.log(
      `  → Generated ${result.tokensUsed.output} tokens (${generationTimeMs}ms)\n`
    );

    // ── Step 3: Return response with full metadata ───────────────────
    // We include retrieval metadata so the frontend can show
    // which documents grounded the response — this is key for
    // demonstrating the RAG principle to the audience.
    res.json({
      response: result.response,
      persona: {
        id: persona.id,
        name: persona.name,
        organization: persona.organization,
      },
      sources: {
        documentsUsed: result.sourcesUsed,
        chunksUsed: result.chunksUsed,
      },
      meta: {
        model: result.model,
        tokensUsed: result.tokensUsed,
        retrievalTimeMs,
        generationTimeMs,
        totalTimeMs: retrievalTimeMs + generationTimeMs,
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      error: "Failed to generate response",
      detail: error.message,
    });
  }
});

/**
 * POST /api/moderate
 * Generates a moderator facilitation message based on conversation context.
 * No RAG — the moderator works purely from the transcript.
 *
 * Body: { transcript: string, participants: string[], isOpening: boolean }
 */
app.post("/api/moderate", async (req, res) => {
  const { transcript = "", participants = [], isOpening = false } = req.body;
  try {
    const result = await moderate({ transcript, participants, isOpening });
    res.json(result); // { message, nextPersonaId }
  } catch (error) {
    console.error("Moderation error:", error.message);
    res.status(500).json({ error: "Moderation failed", detail: error.message });
  }
});

// ── Start server ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`=== Server running on http://localhost:${PORT} ===`);
  console.log(`  Personas: ${Object.keys(personas).join(", ")}`);
  console.log(`  Endpoints:`);
  console.log(`    POST /api/chat     — Main RAG endpoint`);
  console.log(`    GET  /api/personas — List stakeholders`);
  console.log(`    GET  /api/stats    — Knowledge base info\n`);
});
