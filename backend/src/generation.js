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
/**
 * Generate a moderator facilitation message.
 * No RAG — the moderator works purely from conversation context.
 */
/**
 * Generate a moderator facilitation message.
 * Returns { message, nextPersonaId } — the message and who should respond next.
 *
 * @param {object} params
 * @param {string} params.transcript - Recent conversation as formatted text
 * @param {Array<{id, name, isUser}>} params.participants - All participants
 * @param {boolean} params.isOpening - Whether this is the opening of the session
 */
export async function moderate({ transcript, participants, isOpening, introQueue = [] }) {
  const userParticipant = participants.find((p) => p.isUser);
  const aiParticipants = participants.filter((p) => !p.isUser);

  const participantDesc = participants
    .map((p) => {
      let line = `${p.name} (id: "${p.id}"${p.isUser ? " — human participant" : ""})`;
      if (typeof p.turns === "number") line += ` [${p.turns} turns spoken]`;
      return line;
    })
    .join(", ");

  const systemPrompt = `You are Kantonsrätin Maya Weber, neutral chair of this cantonal planning commission meeting about the proposed Zürichsee bridge.

Rules:
- Exactly 1-2 sentences — no more
- Direct your question or prompt to exactly ONE specific participant by name
- Be pointed and specific — challenge positions, expose tensions, ask for concrete numbers or legal grounds
- Distribute speaking turns fairly — look at the [turns spoken] counts and prefer those who have spoken less
- Never take a side yourself
- Respond in the same language as the transcript (German or English)

Participants: ${participantDesc}

IMPORTANT: Return ONLY valid JSON — no other text, no markdown:
{"message": "your facilitation text here", "nextPersonaId": "the_id_of_person_you_addressed"}

Valid persona IDs: ${participants.map((p) => `"${p.id}"`).join(", ")}
${userParticipant ? `\nAddress ${userParticipant.name} (id: "${userParticipant.id}") occasionally — roughly once for every 3-4 AI turns.` : ""}`;

  let userContent;
  if (isOpening) {
    userContent = `Open the meeting with one welcome sentence. Then ask the first AI participant (id: "${aiParticipants[0]?.id}", NOT the human) to briefly introduce themselves and their position on the bridge in 2-3 sentences.`;
  } else if (introQueue.length > 0) {
    const nextId = introQueue[0];
    const nextPerson = participants.find((p) => p.id === nextId);
    userContent = `Introduction round is still ongoing. Please ask ${nextPerson?.name || nextId} (id: "${nextId}") to briefly introduce themselves and their position on the bridge project in 2-3 sentences.`;
  } else {
    userContent = `Recent exchange:\n\n${transcript}\n\nContinue facilitating the discussion. Ask a pointed, specific question to one participant. Check the [turns spoken] counts — prefer someone who has had fewer turns.`;
  }

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    temperature: 0.7,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const text = response.content[0].text.trim();

  try {
    const cleaned = text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback if model doesn't return valid JSON
    return {
      message: text,
      nextPersonaId: aiParticipants[0]?.id || participants[0].id,
    };
  }
}

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
  const augmentedQuery = `<context>
${contextBlock}
</context>

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
