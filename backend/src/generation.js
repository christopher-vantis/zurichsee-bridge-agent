/**
 * GENERATION MODULE
 * =================
 * This is the "AG" in RAG — Augmented Generation.
 *
 * The flow:
 *   1. Receive: user query + retrieved document chunks + persona ID
 *   2. Build: a prompt that includes the persona's system prompt,
 *             the retrieved chunks as "context documents", and the query
 *   3. Call: the Anthropic API
 *   4. Return: the response + metadata (which chunks were used)
 *
 * KEY DESIGN DECISION: Context injection format
 * We inject retrieved chunks inside <context> tags in the user message.
 * This makes the boundary between "documents the agent has access to"
 * and "the user's question" explicit to the model.
 *
 * The model is instructed (in the persona's system prompt) to ONLY use
 * information from these context documents. This is what makes it RAG
 * rather than just a prompted chatbot — the answers are grounded in
 * specific, traceable sources.
 */

import Anthropic from "@anthropic-ai/sdk";

// Lazily initialized — must be created after dotenv.config() runs in server.js
let anthropic = null;
function getClient() {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

/**
 * Generate a response from the AI stakeholder agent.
 *
 * @param {object} params
 * @param {string} params.query - The user's question
 * @param {Array} params.retrievedChunks - Chunks from the retrieval step
 * @param {object} params.persona - The stakeholder persona object
 * @param {Array} params.conversationHistory - Previous messages in this session
 * @returns {object} { response: string, sourcesUsed: string[], model: string }
 */
export async function generate({
  query,
  retrievedChunks,
  persona,
  conversationHistory = [],
}) {
  // ── Step 1: Format the retrieved chunks as context ──────────────────
  // We present each chunk with its source document and a chunk ID
  // so the model can reference where information comes from.
  const contextBlock = retrievedChunks
    .map(
      (chunk, i) =>
        `<document source="${chunk.source}" chunk_id="${chunk.id}" relevance_score="${chunk.score.toFixed(2)}">
${chunk.text}
</document>`
    )
    .join("\n\n");

  // ── Step 2: Build the user message with injected context ────────────
  // The context comes BEFORE the query so the model reads the documents
  // before seeing the question. This is a standard RAG pattern.
  const augmentedQuery = `Here are the relevant documents from the knowledge base for this query:

<context>
${contextBlock}
</context>

Based ONLY on the above documents and your stakeholder perspective, respond to the following:

${query}`;

  // ── Step 3: Build the full message array ────────────────────────────
  // Include conversation history so the agent can maintain continuity
  // across multiple turns in the same meeting session.
  const messages = [
    ...conversationHistory.map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    })),
    {
      role: "user",
      content: augmentedQuery,
    },
  ];

  // ── Step 4: Call the Anthropic API ──────────────────────────────────
  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      temperature: persona.temperature,
      system: persona.systemPrompt,
      messages: messages,
    });

    // Extract the text response
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Track which source documents were referenced
    const sourcesUsed = [
      ...new Set(retrievedChunks.map((chunk) => chunk.source)),
    ];

    return {
      response: text,
      sourcesUsed: sourcesUsed,
      chunksUsed: retrievedChunks.map((c) => ({
        id: c.id,
        source: c.source,
        score: c.score,
        preview: c.text.slice(0, 120) + "...",
      })),
      model: response.model,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  } catch (error) {
    console.error("Anthropic API error:", error.message);
    throw error;
  }
}
