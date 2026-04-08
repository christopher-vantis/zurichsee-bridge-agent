import { useState, useRef, useEffect, useCallback } from "react";

const API_BASE = "/api";

async function fetchPersonas() {
  const res = await fetch(`${API_BASE}/personas`);
  return res.json();
}
async function fetchStats() {
  const res = await fetch(`${API_BASE}/stats`);
  return res.json();
}
async function sendChat(query, personaId, history) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, personaId, history }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

async function callModerator(transcript, participants, isOpening) {
  const res = await fetch(`${API_BASE}/moderate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, participants, isOpening }),
  });
  if (!res.ok) throw new Error("Moderation failed");
  return res.json();
}

function buildTranscript(messages, userPersona) {
  return messages
    .filter((m) => m.role !== "system")
    .slice(-6)
    .map((m) => {
      if (m.role === "moderator") return `Chair: ${m.content}`;
      if (m.role === "user")
        return `${userPersona ? userPersona.name : "Facilitator"}: ${m.content}`;
      return `${m.persona?.name || "Stakeholder"}: ${m.content}`;
    })
    .join("\n\n");
}

const CONSULT_PRESETS = [
  { label: "Position on bridge", text: "What is your position on the proposed bridge over Lake Zürich?" },
  { label: "Budget cuts", text: "The mayor proposes cutting the environmental mitigation budget by 40%. How do you respond?" },
  { label: "Economic benefits", text: "The bridge would reduce commute times by 35 minutes and create 2,000 jobs. Doesn't that outweigh environmental concerns?" },
  { label: "Compromise offer", text: "We are willing to plant 500 trees and create a small nature reserve as compensation. Would that address your concerns?" },
  { label: "Legal challenge", text: "If the project proceeds without addressing your demands, what will you do?" },
  { label: "Alternatives", text: "What alternatives to the bridge would you propose to improve cross-lake connectivity?" },
];

const DEBATE_PRESETS = [
  { label: "Opening statement", text: "I'd like to present my position on this project." },
  { label: "Push back", text: "I strongly disagree with what was just said, and here's why." },
  { label: "Propose a deal", text: "Let me suggest a compromise that could address multiple concerns here." },
  { label: "Legal point", text: "I need to raise a legal consideration that hasn't been adequately addressed." },
  { label: "Question costs", text: "Let's talk honestly about the financial reality of this project." },
  { label: "Closing argument", text: "To summarize my position on this matter:" },
];

function RagStepIndicator({ step, label, sublabel, active, color, delay = 0 }) {
  const [visible, setVisible] = useState(delay === 0);
  useEffect(() => {
    if (delay > 0 && active) {
      const t = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(t);
    }
  }, [active, delay]);
  if (!visible) return <div style={{ height: 44 }} />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: color + "08", border: `1px solid ${color}20`, borderRadius: 8, animation: "ragStepIn 0.3s ease-out" }}>
      <div style={{ width: 24, height: 24, borderRadius: "50%", background: color + "18", color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
        {step}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1c1917" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#78716c" }}>{sublabel}</div>
      </div>
      <div style={{ marginLeft: "auto", width: 14, height: 14, border: `2px solid ${color}40`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState("intro");
  const [mode, setMode] = useState(null); // null | "consult" | "debate"
  const [personas, setPersonas] = useState([]);
  const [stats, setStats] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastSources, setLastSources] = useState(null);
  const [showSources, setShowSources] = useState(false);
  const [error, setError] = useState(null);

  // Consult mode
  const [activePersona, setActivePersona] = useState(null);

  // Debate mode
  const [userPersona, setUserPersona] = useState(null);
  const [debatePersonas, setDebatePersonas] = useState([]);
  const [debateIndex, setDebateIndex] = useState(0);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchPersonas().then(setPersonas).catch(() => setError("Could not connect to backend. Is it running on port 3001?"));
    fetchStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [messages, isLoading]);

  useEffect(() => {
    if (phase === "meeting") setTimeout(() => inputRef.current?.focus(), 300);
  }, [phase]);

  const reset = () => {
    setPhase("intro");
    setMode(null);
    setActivePersona(null);
    setUserPersona(null);
    setDebatePersonas([]);
    setDebateIndex(0);
    setMessages([]);
    setInput("");
    setError(null);
    setLastSources(null);
    setShowSources(false);
  };

  const startConsult = async (persona) => {
    setActivePersona(persona);
    setPhase("meeting");
    const allNames = personas.map((p) => p.name);
    setMessages([{ role: "system", content: `Consulting ${persona.name} · ${persona.organization}` }]);
    setIsLoading(true);
    try {
      const mod = await callModerator("", allNames, true);
      setMessages((prev) => [...prev, { role: "moderator", content: mod.message }]);
    } catch (_) {}
    setIsLoading(false);
  };

  const startDebate = async (myPersona) => {
    setUserPersona(myPersona);
    const others = personas.filter((p) => p.id !== myPersona.id);
    setDebatePersonas(others);
    setDebateIndex(0);
    setPhase("meeting");
    const allNames = personas.map((p) => p.name);
    setMessages([{ role: "system", content: `Debate started — you are speaking as ${myPersona.name}` }]);
    setIsLoading(true);
    try {
      const mod = await callModerator("", allNames, true);
      setMessages((prev) => [...prev, { role: "moderator", content: mod.message }]);
    } catch (_) {}
    setIsLoading(false);
  };

  const switchPersona = (persona) => {
    setActivePersona(persona);
    setMessages((prev) => [...prev, { role: "system", content: `Switched to ${persona.name} · ${persona.organization}` }]);
    setLastSources(null);
  };

  const handleSend = useCallback(
    async (text) => {
      if (!text.trim() || isLoading) return;
      const trimmed = text.trim();
      setInput("");
      setError(null);
      setLastSources(null);
      setIsLoading(true);

      if (mode === "consult") {
        const userMsg = { role: "user", content: trimmed };
        setMessages((prev) => [...prev, userMsg]);
        const history = messages.filter((m) => m.role !== "system").concat(userMsg);
        const allNames = personas.map((p) => p.name);

      try {
          const result = await sendChat(trimmed, activePersona.id, history);
          const agentMsg = { role: "assistant", content: result.response, sources: result.sources, meta: result.meta, persona: activePersona };
          setMessages((prev) => [...prev, agentMsg]);
          setLastSources(result.sources);
          setIsLoading(false);
          // Moderator follow-up after stakeholder responds
          try {
            const transcript = buildTranscript([...messages, { role: "user", content: trimmed }, agentMsg], null);
            const mod = await callModerator(transcript, allNames, false);
            setMessages((prev) => [...prev, { role: "moderator", content: mod.message }]);
          } catch (_) {}
        } catch (err) {
          setError(err.message);
          setMessages((prev) => [...prev, { role: "assistant", content: "A technical issue prevented my response. Please try again.", persona: activePersona }]);
          setIsLoading(false);
        }
      } else {
        // Debate mode
        const respondingPersona = debatePersonas[debateIndex % debatePersonas.length];
        const contextualQuery = `[${userPersona.name}, ${userPersona.role} at ${userPersona.organization}:]\n\n${trimmed}`;
        const userMsg = { role: "user", content: trimmed, isDebateUser: true };
        setMessages((prev) => [...prev, userMsg]);

        const history = messages
          .filter((m) => m.role !== "system")
          .map((m) =>
            m.isDebateUser
              ? { role: "user", content: `[${userPersona.name}:]\n${m.content}` }
              : { role: "assistant", content: m.content }
          );

        try {
          const result = await sendChat(contextualQuery, respondingPersona.id, history);
          const agentMsg = { role: "assistant", content: result.response, sources: result.sources, meta: result.meta, persona: respondingPersona };
          setMessages((prev) => [...prev, agentMsg]);
          setLastSources(result.sources);
          setDebateIndex((prev) => (prev + 1) % debatePersonas.length);
          setIsLoading(false);
          // Moderator follow-up after stakeholder responds
          try {
            const transcript = buildTranscript([...messages, userMsg, agentMsg], userPersona);
            const mod = await callModerator(transcript, allNames, false);
            setMessages((prev) => [...prev, { role: "moderator", content: mod.message }]);
          } catch (_) {}
        } catch (err) {
          setError(err.message);
          setMessages((prev) => [...prev, { role: "assistant", content: "A technical issue prevented my response. Please try again.", persona: respondingPersona }]);
          setIsLoading(false);
        }
      }
    },
    [messages, isLoading, mode, activePersona, userPersona, debatePersonas, debateIndex, personas]
  );

  const accentColor = mode === "consult" ? activePersona?.color : userPersona?.color;
  const respondingNow = mode === "debate" ? debatePersonas[debateIndex % debatePersonas.length] : null;

  // ── INTRO ──────────────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div style={s.introContainer}>
        <div style={s.introBg} />
        <div style={s.introContent}>
          <div style={s.introBadge}>CSCW 2026 — Interactive Prototype</div>
          <h1 style={s.introTitle}>Zürichsee Bridge</h1>
          <h2 style={s.introSubtitle}>Stakeholder Consultation Meeting</h2>
          <p style={s.introDesc}>
            Key stakeholders couldn't attend today's planning session. Their AI agents represent
            their positions — drawing on real Swiss policy documents, laws, and position papers.
          </p>

          {error && <div style={s.errorBox}>{error}</div>}

          {stats && (
            <div style={s.statsBox}>
              <span style={s.statsLabel}>Knowledge Base</span>
              <span style={s.statsValue}>
                {stats.totalDocuments} documents · {stats.totalChunks} indexed passages
              </span>
            </div>
          )}

          {/* Mode selection */}
          <div style={s.modeGrid}>
            <button
              onClick={() => setMode(mode === "consult" ? null : "consult")}
              style={{ ...s.modeCard, ...(mode === "consult" ? s.modeCardActive : {}) }}
            >
              <div style={s.modeEmoji}>🎙</div>
              <div style={s.modeTitle}>Consult a Stakeholder</div>
              <div style={s.modeDesc}>
                Ask questions to any stakeholder. You are the meeting facilitator and can
                switch between them freely.
              </div>
            </button>
            <button
              onClick={() => setMode(mode === "debate" ? null : "debate")}
              style={{ ...s.modeCard, ...(mode === "debate" ? s.modeCardActive : {}) }}
            >
              <div style={s.modeEmoji}>⚔️</div>
              <div style={s.modeTitle}>Join the Debate</div>
              <div style={s.modeDesc}>
                Choose your role and speak as that stakeholder. The others will respond to
                your statements in turn.
              </div>
            </button>
          </div>

          {/* Persona selection — appears after mode is chosen */}
          {mode && (
            <div style={{ animation: "fadeIn 0.2s ease-out" }}>
              <p style={s.personaSelectLabel}>
                {mode === "consult"
                  ? "Select a stakeholder to begin:"
                  : "Choose your role in the meeting:"}
              </p>
              <div style={s.personaGrid}>
                {personas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => (mode === "consult" ? startConsult(p) : startDebate(p))}
                    style={{ ...s.personaCard, borderColor: p.color + "40" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = p.color;
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = p.color + "40";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <div style={s.personaIcon}>{p.icon}</div>
                    <div style={{ ...s.personaName, color: p.color }}>{p.name}</div>
                    <div style={s.personaOrg}>{p.organization}</div>
                    <div style={s.personaRole}>{p.role}</div>
                    <div style={s.personaDesc}>{p.shortDescription}</div>
                    <div style={{ ...s.personaBtn, background: p.color }}>
                      {mode === "consult"
                        ? `Consult ${p.name.split(" ")[0]} →`
                        : `Play as ${p.name.split(" ")[0]} →`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── MEETING ────────────────────────────────────────────────────────────
  return (
    <div style={s.meetingContainer}>
      {/* Header */}
      <div
        style={{
          ...s.header,
          borderBottomColor: (accentColor || "#e7e5e4") + "40",
          background: (accentColor || "#065f46") + "0a",
        }}
      >
        <div style={s.headerLeft}>
          {mode === "consult" ? (
            <>
              <div style={{ ...s.headerIcon, background: activePersona.color + "22" }}>
                {activePersona.icon}
              </div>
              <div>
                <div style={s.headerName}>
                  {activePersona.name} — {activePersona.organization}
                </div>
                <div style={s.headerRole}>{activePersona.role}</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ ...s.headerIcon, background: userPersona.color + "22" }}>
                {userPersona.icon}
              </div>
              <div>
                <div style={s.headerName}>You: {userPersona.name}</div>
                <div style={s.headerRole}>
                  Next response: {respondingNow?.icon} {respondingNow?.name}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={s.headerRight}>
          {mode === "consult" && (
            <div style={s.switcherRow}>
              {personas
                .filter((p) => p.id !== activePersona.id)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => switchPersona(p)}
                    title={`Switch to ${p.name}`}
                    style={{ ...s.switchBtn, borderColor: p.color + "40", color: p.color }}
                  >
                    {p.icon} {p.name.split(" ")[0]}
                  </button>
                ))}
            </div>
          )}
          {mode === "debate" && (
            <div style={s.switcherRow}>
              {debatePersonas.map((p, i) => {
                const isNext = i === debateIndex % debatePersonas.length;
                return (
                  <span
                    key={p.id}
                    title={`${p.name} — ${isNext ? "responds next" : "waiting"}`}
                    style={{
                      ...s.debateChip,
                      color: p.color,
                      border: `1px solid ${p.color}${isNext ? "90" : "30"}`,
                      opacity: isNext ? 1 : 0.45,
                      fontWeight: isNext ? 700 : 400,
                    }}
                  >
                    {p.icon} {p.name.split(" ")[0]}
                  </span>
                );
              })}
            </div>
          )}
          <button onClick={reset} style={s.resetBtn}>
            ↩ Start over
          </button>
        </div>
      </div>

      {/* Chat area */}
      <div style={s.chatArea}>
        {messages.map((msg, i) => {
          if (msg.role === "system") {
            return (
              <div key={i} style={s.divider}>
                <div style={s.dividerLine} />
                <span style={s.dividerText}>{msg.content}</span>
                <div style={s.dividerLine} />
              </div>
            );
          }

          if (msg.role === "moderator") {
            return (
              <div key={i} style={s.moderatorMsg}>
                <div style={s.moderatorLabel}>⚖️ Kantonsrätin Weber · Chair</div>
                <div style={s.moderatorText}>{msg.content}</div>
              </div>
            );
          }

          const isUser = msg.role === "user";
          const bubblePersona =
            msg.persona || (isUser && mode === "debate" ? userPersona : activePersona);

          return (
            <div
              key={i}
              style={{ ...s.msgRow, justifyContent: isUser ? "flex-end" : "flex-start" }}
            >
              <div style={s.msgBubbleWrap}>
                {/* Label: always on agent messages; on user messages only in debate mode */}
                {(!isUser || (mode === "debate" && msg.isDebateUser)) && (
                  <div style={s.msgSender}>
                    <span style={{ ...s.msgSenderDot, background: bubblePersona?.color }} />
                    {isUser ? `You (${userPersona.name})` : bubblePersona?.name}
                  </div>
                )}
                <div
                  style={{
                    ...s.msgBubble,
                    ...(isUser
                      ? mode === "debate"
                        ? {
                            background: userPersona.color + "12",
                            border: `1px solid ${userPersona.color}28`,
                            color: "#1c1917",
                            borderRadius: "12px 12px 4px 12px",
                          }
                        : s.userBubble
                      : { ...s.agentBubble, borderColor: bubblePersona?.color + "25" }),
                  }}
                >
                  {msg.content}
                </div>
                {msg.sources?.documentsUsed?.length > 0 && (
                  <button
                    onClick={() => {
                      setLastSources(msg.sources);
                      setShowSources(true);
                    }}
                    style={{ ...s.sourceIndicator, color: bubblePersona?.color }}
                  >
                    📄 Based on {msg.sources.documentsUsed.length} document
                    {msg.sources.documentsUsed.length !== 1 ? "s" : ""} · View sources
                  </button>
                )}
                {msg.meta && (
                  <div style={s.metaLine}>
                    Retrieved in {msg.meta.retrievalTimeMs}ms · Generated in{" "}
                    {msg.meta.generationTimeMs}ms · {msg.meta.tokensUsed.output} tokens
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* RAG pipeline visualization while loading */}
        {isLoading && (
          <div style={{ ...s.msgRow, justifyContent: "flex-start" }}>
            <div style={{ maxWidth: "80%", minWidth: 240 }}>
              <div style={s.msgSender}>
                <span
                  style={{
                    ...s.msgSenderDot,
                    background:
                      mode === "debate" ? respondingNow?.color : activePersona?.color,
                  }}
                />
                {mode === "debate" ? respondingNow?.name : activePersona?.name}
              </div>
              <div style={s.ragPipeline}>
                <RagStepIndicator
                  step={1}
                  label="Searching knowledge base"
                  sublabel={`Scanning ${stats?.totalChunks || "..."} passages`}
                  active
                  color={mode === "debate" ? respondingNow?.color : activePersona?.color}
                />
                <div style={s.ragPipelineArrow}>↓</div>
                <RagStepIndicator
                  step={2}
                  label="Retrieving relevant passages"
                  sublabel="Ranking by TF-IDF relevance"
                  active
                  color={mode === "debate" ? respondingNow?.color : activePersona?.color}
                  delay={800}
                />
                <div style={s.ragPipelineArrow}>↓</div>
                <RagStepIndicator
                  step={3}
                  label="Generating response"
                  sublabel="Grounding answer in retrieved documents"
                  active
                  color={mode === "debate" ? respondingNow?.color : activePersona?.color}
                  delay={1600}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Sources panel */}
      {showSources && lastSources && (
        <div style={s.sourcesOverlay} onClick={() => setShowSources(false)}>
          <div style={s.sourcesPanel} onClick={(e) => e.stopPropagation()}>
            <div style={s.sourcesPanelHeader}>
              <h3 style={s.sourcesPanelTitle}>Retrieved Sources</h3>
              <button onClick={() => setShowSources(false)} style={s.sourcesClose}>
                ✕
              </button>
            </div>
            <p style={s.sourcesExplainer}>
              These passages were retrieved from the knowledge base and used to ground the
              response:
            </p>
            {lastSources.chunksUsed.map((chunk, i) => (
              <div key={i} style={s.sourceChunk}>
                <div style={s.sourceChunkHeader}>
                  <span style={s.sourceChunkFile}>{chunk.source}</span>
                  <span style={s.sourceChunkScore}>relevance: {chunk.score.toFixed(2)}</span>
                </div>
                <div style={s.sourceChunkText}>{chunk.preview}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preset questions */}
      <div style={s.presetsBar}>
        <div style={s.presetsScroll}>
          {(mode === "debate" ? DEBATE_PRESETS : CONSULT_PRESETS).map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q.text)}
              disabled={isLoading}
              style={{
                ...s.presetBtn,
                borderColor: (accentColor || "#e7e5e4") + "40",
                opacity: isLoading ? 0.4 : 1,
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={s.inputBar}>
        {error && <div style={s.errorInline}>{error}</div>}
        <div style={s.inputRow}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            placeholder={
              mode === "debate"
                ? `Speak as ${userPersona?.name}...`
                : `Ask ${activePersona?.name} about the bridge project...`
            }
            rows={1}
            style={s.textarea}
          />
          <button
            onClick={() => handleSend(input)}
            disabled={!input.trim() || isLoading}
            style={{
              ...s.sendBtn,
              background:
                input.trim() && !isLoading
                  ? accentColor
                  : (accentColor || "#1c1917") + "30",
              cursor: input.trim() && !isLoading ? "pointer" : "default",
            }}
          >
            ↑
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ragStepIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        textarea::placeholder { color: #a8a29e; }
      `}</style>
    </div>
  );
}

// ── STYLES ──────────────────────────────────────────────────────────────
const s = {
  // Intro
  introContainer: {
    minHeight: "100vh",
    background: "#fafaf9",
    display: "flex",
    justifyContent: "center",
    padding: "48px 24px",
    fontFamily: "'DM Sans', sans-serif",
    position: "relative",
  },
  introBg: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse at 50% 0%, rgba(6,95,70,0.06) 0%, transparent 60%)",
    pointerEvents: "none",
  },
  introContent: { maxWidth: 900, width: "100%", position: "relative", zIndex: 1 },
  introBadge: {
    display: "inline-block",
    background: "#065f4610",
    color: "#065f46",
    padding: "6px 16px",
    borderRadius: 100,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 24,
  },
  introTitle: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 48,
    fontWeight: 400,
    color: "#1c1917",
    margin: "0 0 8px",
    lineHeight: 1.1,
  },
  introSubtitle: { fontSize: 20, fontWeight: 400, color: "#78716c", margin: "0 0 20px" },
  introDesc: {
    fontSize: 15,
    color: "#57534e",
    lineHeight: 1.7,
    maxWidth: 640,
    margin: "0 0 32px",
  },
  statsBox: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    background: "#f5f5f4",
    borderRadius: 8,
    marginBottom: 32,
    fontSize: 13,
    maxWidth: 480,
  },
  statsLabel: { fontWeight: 600, color: "#44403c" },
  statsValue: { color: "#78716c" },

  // Mode selection
  modeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 32,
    maxWidth: 640,
  },
  modeCard: {
    background: "#fff",
    border: "2px solid #e7e5e4",
    borderRadius: 12,
    padding: "20px 20px",
    textAlign: "left",
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: "'DM Sans', sans-serif",
  },
  modeCardActive: {
    borderColor: "#065f46",
    background: "#065f4606",
    boxShadow: "0 0 0 3px #065f4615",
  },
  modeEmoji: { fontSize: 28, marginBottom: 10 },
  modeTitle: { fontSize: 16, fontWeight: 700, color: "#1c1917", marginBottom: 6 },
  modeDesc: { fontSize: 13, color: "#78716c", lineHeight: 1.6 },

  // Persona grid
  personaSelectLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#44403c",
    marginBottom: 12,
    marginTop: 0,
  },
  personaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginBottom: 32,
  },
  personaCard: {
    background: "#fff",
    border: "1.5px solid",
    borderRadius: 12,
    padding: "18px 16px",
    textAlign: "left",
    cursor: "pointer",
    transition: "all 0.2s",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    fontFamily: "'DM Sans', sans-serif",
  },
  personaIcon: { fontSize: 26, marginBottom: 4 },
  personaName: { fontSize: 15, fontWeight: 700 },
  personaOrg: { fontSize: 12, fontWeight: 600, color: "#57534e" },
  personaRole: { fontSize: 11, color: "#a8a29e" },
  personaDesc: { fontSize: 12, color: "#78716c", lineHeight: 1.5, flex: 1 },
  personaBtn: {
    marginTop: 8,
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    padding: "7px 12px",
    borderRadius: 6,
    textAlign: "center",
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    padding: "12px 16px",
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 20,
  },

  // Meeting
  meetingContainer: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#fafaf9",
    fontFamily: "'DM Sans', sans-serif",
  },
  header: {
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: 8,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerRight: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 17,
    flexShrink: 0,
  },
  headerName: { fontSize: 14, fontWeight: 700, color: "#1c1917" },
  headerRole: { fontSize: 11, color: "#78716c" },

  switcherRow: { display: "flex", gap: 5, flexWrap: "wrap" },
  switchBtn: {
    background: "transparent",
    border: "1px solid",
    borderRadius: 20,
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },
  debateChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 500,
    transition: "all 0.2s",
  },
  resetBtn: {
    background: "transparent",
    border: "1px solid #d6d3d1",
    borderRadius: 20,
    padding: "4px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: "#78716c",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: "nowrap",
  },

  // Chat
  chatArea: { flex: 1, overflowY: "auto", padding: "20px 24px" },

  // Moderator message
  moderatorMsg: {
    background: "#fefce8",
    border: "1px solid #fef08a",
    borderLeft: "3px solid #ca8a04",
    borderRadius: 8,
    padding: "10px 14px",
    margin: "8px 0",
    maxWidth: 560,
    marginLeft: "auto",
    marginRight: "auto",
  },
  moderatorLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#92400e",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  moderatorText: {
    fontSize: 13,
    color: "#78350f",
    lineHeight: 1.6,
    fontStyle: "italic",
  },

  // Divider (replaces system message box)
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "12px 0",
  },
  dividerLine: { flex: 1, height: 1, background: "#e7e5e4" },
  dividerText: {
    fontSize: 11,
    color: "#a8a29e",
    whiteSpace: "nowrap",
    fontWeight: 500,
    letterSpacing: 0.3,
  },

  msgRow: { display: "flex", marginBottom: 16 },
  msgBubbleWrap: { maxWidth: "75%", minWidth: 80 },
  msgSender: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: 600,
    color: "#57534e",
  },
  msgSenderDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  msgBubble: {
    padding: "10px 16px",
    fontSize: 14,
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
    borderRadius: 12,
  },
  userBubble: {
    background: "#1c1917",
    color: "#fafaf9",
    borderRadius: "12px 12px 4px 12px",
  },
  agentBubble: {
    background: "#fff",
    border: "1px solid #e7e5e4",
    color: "#1c1917",
    borderRadius: "12px 12px 12px 4px",
  },
  sourceIndicator: {
    background: "none",
    border: "none",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    padding: "4px 0",
    fontFamily: "'DM Sans', sans-serif",
    textDecoration: "underline",
    textDecorationStyle: "dotted",
    textUnderlineOffset: 2,
  },
  metaLine: { fontSize: 10, color: "#a8a29e", marginTop: 2 },

  // Sources panel
  sourcesOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.3)",
    zIndex: 100,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  sourcesPanel: {
    background: "#fff",
    borderRadius: "16px 16px 0 0",
    padding: "24px",
    maxHeight: "60vh",
    overflowY: "auto",
    width: "100%",
    maxWidth: 640,
  },
  sourcesPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sourcesPanelTitle: { fontSize: 16, fontWeight: 700, color: "#1c1917", margin: 0 },
  sourcesClose: {
    background: "none",
    border: "none",
    fontSize: 18,
    color: "#78716c",
    cursor: "pointer",
  },
  sourcesExplainer: { fontSize: 13, color: "#78716c", marginBottom: 16, lineHeight: 1.5 },
  sourceChunk: {
    background: "#f5f5f4",
    border: "1px solid #e7e5e4",
    borderRadius: 8,
    padding: "12px 14px",
    marginBottom: 10,
  },
  sourceChunkHeader: { display: "flex", justifyContent: "space-between", marginBottom: 6 },
  sourceChunkFile: { fontSize: 12, fontWeight: 600, color: "#44403c" },
  sourceChunkScore: { fontSize: 11, color: "#a8a29e" },
  sourceChunkText: { fontSize: 12, color: "#57534e", lineHeight: 1.5, fontStyle: "italic" },

  // Presets
  presetsBar: {
    padding: "8px 16px 4px",
    borderTop: "1px solid #e7e5e4",
    flexShrink: 0,
    overflowX: "auto",
  },
  presetsScroll: { display: "flex", gap: 6, paddingBottom: 6 },
  presetBtn: {
    background: "#fff",
    border: "1px solid",
    borderRadius: 20,
    padding: "5px 12px",
    fontSize: 12,
    color: "#57534e",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },

  // Input
  inputBar: { padding: "10px 16px 16px", flexShrink: 0 },
  errorInline: { fontSize: 12, color: "#dc2626", marginBottom: 6 },
  inputRow: { display: "flex", gap: 8, alignItems: "flex-end" },
  textarea: {
    flex: 1,
    padding: "10px 14px",
    background: "#fff",
    border: "1px solid #d6d3d1",
    borderRadius: 10,
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    resize: "none",
    outline: "none",
    lineHeight: 1.5,
    color: "#1c1917",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 18,
    fontWeight: 700,
    flexShrink: 0,
    transition: "all 0.15s",
  },

  // RAG pipeline visualization
  ragPipeline: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "12px 14px",
    background: "#fff",
    border: "1px solid #e7e5e4",
    borderRadius: 12,
  },
  ragPipelineArrow: { textAlign: "center", color: "#d6d3d1", fontSize: 12, lineHeight: 1 },
};
