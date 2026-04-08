import { useState, useRef, useEffect, useCallback } from "react";

// ── API helper ──────────────────────────────────────────────────────────
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

// ── Preset questions for demo ───────────────────────────────────────────
const PRESETS = [
  {
    label: "Position on bridge",
    text: "What is your position on the proposed bridge over Lake Zürich?",
  },
  {
    label: "Budget cuts",
    text: "The mayor proposes cutting the environmental mitigation budget by 40%. How do you respond?",
  },
  {
    label: "Economic benefits",
    text: "The bridge would reduce commute times by 35 minutes and create 2,000 jobs. Doesn't that outweigh environmental concerns?",
  },
  {
    label: "Compromise offer",
    text: "We are willing to plant 500 trees and create a small nature reserve as compensation. Would that address your concerns?",
  },
  {
    label: "Legal challenge",
    text: "If the project proceeds without addressing your demands, what will you do?",
  },
  {
    label: "Alternatives",
    text: "What alternatives to the bridge would you propose to improve cross-lake connectivity?",
  },
];

// ── RAG Pipeline Step Indicator ─────────────────────────────────────────
function RagStepIndicator({ step, label, sublabel, active, color, delay = 0 }) {
  const [visible, setVisible] = useState(delay === 0);

  useEffect(() => {
    if (delay > 0 && active) {
      const timer = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timer);
    }
  }, [active, delay]);

  if (!visible) return <div style={{ height: 44 }} />;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: color + "08",
        border: `1px solid ${color}20`,
        borderRadius: 8,
        animation: "ragStepIn 0.3s ease-out",
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: color + "18",
          color: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {step}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1c1917" }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: "#78716c" }}>{sublabel}</div>
      </div>
      <div
        style={{
          marginLeft: "auto",
          width: 14,
          height: 14,
          border: `2px solid ${color}40`,
          borderTopColor: color,
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          flexShrink: 0,
        }}
      />
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────
export default function App() {
  const [phase, setPhase] = useState("intro"); // intro | meeting
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [stats, setStats] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastSources, setLastSources] = useState(null);
  const [showSources, setShowSources] = useState(false);
  const [error, setError] = useState(null);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load personas and stats on mount
  useEffect(() => {
    fetchPersonas()
      .then(setPersonas)
      .catch((e) => setError("Could not connect to backend. Is it running on port 3001?"));
    fetchStats().then(setStats).catch(() => {});
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    setTimeout(
      () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      100
    );
  }, [messages, isLoading]);

  // Focus input when entering meeting
  useEffect(() => {
    if (phase === "meeting") {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [phase]);

  const startMeeting = (persona) => {
    setSelectedPersona(persona);
    setMessages([
      {
        role: "system",
        content: `Kantonsrätin Meier opens the session: "Welcome to today's consultation on the proposed Zürichsee bridge. We have ${persona.name} from ${persona.organization} joining us as stakeholder representative. Please proceed with your questions."`,
      },
    ]);
    setPhase("meeting");
  };

  const switchPersona = (persona) => {
    setSelectedPersona(persona);
    setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `Kantonsrätin Meier: "Thank you. We now hear from ${persona.name}, ${persona.organization}."`,
      },
    ]);
    setLastSources(null);
  };

  const handleSend = useCallback(
    async (text) => {
      if (!text.trim() || isLoading || !selectedPersona) return;

      const userMsg = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);
      setError(null);
      setLastSources(null);

      // Build history for the API (only user/assistant messages, not system)
      const history = messages
        .filter((m) => m.role !== "system")
        .concat(userMsg);

      try {
        const result = await sendChat(
          text.trim(),
          selectedPersona.id,
          history
        );

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.response,
            sources: result.sources,
            meta: result.meta,
          },
        ]);
        setLastSources(result.sources);
      } catch (err) {
        setError(err.message);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "I apologize — a technical issue prevented my response. Please try again.",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, selectedPersona]
  );

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    handleSend(input);
  };

  // ── INTRO SCREEN ──────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div style={styles.introContainer}>
        <div style={styles.introBg} />
        <div style={styles.introContent}>
          {/* Header */}
          <div style={styles.introBadge}>CSCW 2026 — Interactive Prototype</div>
          <h1 style={styles.introTitle}>Zürichsee Bridge</h1>
          <h2 style={styles.introSubtitle}>Stakeholder Consultation Meeting</h2>
          <p style={styles.introDesc}>
            Key stakeholders couldn't attend today's planning session. Their AI
            agents will represent their positions — drawing on real documents,
            laws, and policy positions.
          </p>

          {/* Error */}
          {error && <div style={styles.errorBox}>{error}</div>}

          {/* Knowledge base stats */}
          {stats && (
            <div style={styles.statsBox}>
              <span style={styles.statsLabel}>Knowledge Base</span>
              <span style={styles.statsValue}>
                {stats.totalDocuments} documents · {stats.totalChunks} indexed
                passages
              </span>
            </div>
          )}

          {/* Persona cards */}
          <div style={styles.personaGrid}>
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => startMeeting(p)}
                style={{
                  ...styles.personaCard,
                  borderColor: p.color + "40",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = p.color;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = p.color + "40";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div style={styles.personaIcon}>{p.icon}</div>
                <div style={{ ...styles.personaName, color: p.color }}>
                  {p.name}
                </div>
                <div style={styles.personaOrg}>{p.organization}</div>
                <div style={styles.personaRole}>{p.role}</div>
                <div style={styles.personaDesc}>{p.shortDescription}</div>
                <div style={{ ...styles.personaBtn, background: p.color }}>
                  Enter as {p.name.split(" ")[0]} →
                </div>
              </button>
            ))}
          </div>

        </div>
      </div>
    );
  }

  // ── MEETING SCREEN ────────────────────────────────────────────────────
  return (
    <div style={styles.meetingContainer}>
      {/* Header */}
      <div
        style={{
          ...styles.header,
          background: `linear-gradient(135deg, ${selectedPersona.color}22, ${selectedPersona.color}11)`,
          borderBottomColor: selectedPersona.color + "30",
        }}
      >
        <div style={styles.headerLeft}>
          <div
            style={{
              ...styles.headerIcon,
              background: selectedPersona.color + "25",
            }}
          >
            {selectedPersona.icon}
          </div>
          <div>
            <div style={styles.headerName}>
              {selectedPersona.name} — {selectedPersona.organization}
            </div>
            <div style={styles.headerRole}>{selectedPersona.role}</div>
          </div>
        </div>

        {/* Persona switcher */}
        <div style={styles.switcherRow}>
          {personas
            .filter((p) => p.id !== selectedPersona.id)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => switchPersona(p)}
                style={{
                  ...styles.switchBtn,
                  borderColor: p.color + "40",
                  color: p.color,
                }}
                title={`Switch to ${p.name}`}
              >
                {p.icon} {p.name.split(" ")[0]}
              </button>
            ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={styles.chatArea}>
        {messages.map((msg, i) => {
          if (msg.role === "system") {
            return (
              <div key={i} style={styles.systemMsg}>
                <div style={styles.systemLabel}>Meeting Chair</div>
                <div style={styles.systemText}>{msg.content}</div>
              </div>
            );
          }

          const isUser = msg.role === "user";

          return (
            <div
              key={i}
              style={{
                ...styles.msgRow,
                justifyContent: isUser ? "flex-end" : "flex-start",
              }}
            >
              <div style={styles.msgBubbleWrap}>
                {!isUser && (
                  <div style={styles.msgSender}>
                    <span
                      style={{
                        ...styles.msgSenderDot,
                        background: selectedPersona.color,
                      }}
                    />
                    {selectedPersona.name}
                  </div>
                )}
                <div
                  style={{
                    ...styles.msgBubble,
                    ...(isUser ? styles.userBubble : styles.agentBubble),
                    borderColor: isUser
                      ? "transparent"
                      : selectedPersona.color + "20",
                  }}
                >
                  {msg.content}
                </div>
                {/* Source citation indicator */}
                {msg.sources && msg.sources.documentsUsed.length > 0 && (
                  <button
                    onClick={() => {
                      setLastSources(msg.sources);
                      setShowSources(true);
                    }}
                    style={{
                      ...styles.sourceIndicator,
                      color: selectedPersona.color,
                    }}
                  >
                    📄 Based on {msg.sources.documentsUsed.length} document
                    {msg.sources.documentsUsed.length !== 1 ? "s" : ""} · View
                    sources
                  </button>
                )}
                {msg.meta && (
                  <div style={styles.metaLine}>
                    Retrieved in {msg.meta.retrievalTimeMs}ms · Generated in{" "}
                    {msg.meta.generationTimeMs}ms · {msg.meta.tokensUsed.output}{" "}
                    tokens
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* RAG pipeline visualization during loading */}
        {isLoading && (
          <div style={{ ...styles.msgRow, justifyContent: "flex-start" }}>
            <div style={{ maxWidth: "80%", minWidth: 240 }}>
              <div style={styles.msgSender}>
                <span
                  style={{
                    ...styles.msgSenderDot,
                    background: selectedPersona.color,
                  }}
                />
                {selectedPersona.name}
              </div>
              <div style={styles.ragPipeline}>
                <RagStepIndicator
                  step={1}
                  label="Searching knowledge base"
                  sublabel={`Scanning ${stats?.totalChunks || "..."} document passages`}
                  active={true}
                  color={selectedPersona.color}
                />
                <div style={styles.ragPipelineArrow}>↓</div>
                <RagStepIndicator
                  step={2}
                  label="Retrieving relevant passages"
                  sublabel="Ranking by TF-IDF relevance score"
                  active={true}
                  color={selectedPersona.color}
                  delay={800}
                />
                <div style={styles.ragPipelineArrow}>↓</div>
                <RagStepIndicator
                  step={3}
                  label={`Generating response as ${selectedPersona.name}`}
                  sublabel="Grounding answer in retrieved documents"
                  active={true}
                  color={selectedPersona.color}
                  delay={1600}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Sources panel (slide-up) */}
      {showSources && lastSources && (
        <div style={styles.sourcesOverlay} onClick={() => setShowSources(false)}>
          <div style={styles.sourcesPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sourcesPanelHeader}>
              <h3 style={styles.sourcesPanelTitle}>Retrieved Sources</h3>
              <button
                onClick={() => setShowSources(false)}
                style={styles.sourcesClose}
              >
                ✕
              </button>
            </div>
            <p style={styles.sourcesExplainer}>
              These document passages were retrieved from the knowledge base and
              used to ground the agent's response:
            </p>
            {lastSources.chunksUsed.map((chunk, i) => (
              <div key={i} style={styles.sourceChunk}>
                <div style={styles.sourceChunkHeader}>
                  <span style={styles.sourceChunkFile}>{chunk.source}</span>
                  <span style={styles.sourceChunkScore}>
                    relevance: {chunk.score.toFixed(2)}
                  </span>
                </div>
                <div style={styles.sourceChunkText}>{chunk.preview}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preset questions */}
      <div style={styles.presetsBar}>
        <div style={styles.presetsScroll}>
          {PRESETS.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q.text)}
              disabled={isLoading}
              style={{
                ...styles.presetBtn,
                borderColor: selectedPersona.color + "30",
                opacity: isLoading ? 0.4 : 1,
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={styles.inputBar}>
        {error && <div style={styles.errorInline}>{error}</div>}
        <div style={styles.inputRow}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={`Ask ${selectedPersona.name} about the bridge project...`}
            rows={1}
            style={styles.textarea}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            style={{
              ...styles.sendBtn,
              background:
                input.trim() && !isLoading
                  ? selectedPersona.color
                  : selectedPersona.color + "30",
              cursor: input.trim() && !isLoading ? "pointer" : "default",
            }}
          >
            ↑
          </button>
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes ragStepIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        textarea::placeholder {
          color: #a8a29e;
        }
      `}</style>
    </div>
  );
}

// ── STYLES ──────────────────────────────────────────────────────────────
// Using object styles for a single-file component.
const styles = {
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
    background:
      "radial-gradient(ellipse at 50% 0%, rgba(6,95,70,0.06) 0%, transparent 60%)",
    pointerEvents: "none",
  },
  introContent: {
    maxWidth: 880,
    width: "100%",
    position: "relative",
    zIndex: 1,
  },
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
  introSubtitle: {
    fontSize: 20,
    fontWeight: 400,
    color: "#78716c",
    margin: "0 0 20px",
  },
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
  statsLabel: {
    fontWeight: 600,
    color: "#44403c",
  },
  statsValue: {
    color: "#78716c",
  },
  personaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 32,
  },
  personaCard: {
    background: "#fff",
    border: "1.5px solid",
    borderRadius: 12,
    padding: "20px 16px",
    textAlign: "left",
    cursor: "pointer",
    transition: "all 0.2s",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontFamily: "'DM Sans', sans-serif",
  },
  personaIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  personaName: {
    fontSize: 16,
    fontWeight: 700,
  },
  personaOrg: {
    fontSize: 13,
    fontWeight: 600,
    color: "#57534e",
  },
  personaRole: {
    fontSize: 12,
    color: "#a8a29e",
  },
  personaDesc: {
    fontSize: 12,
    color: "#78716c",
    lineHeight: 1.5,
    flex: 1,
  },
  personaBtn: {
    marginTop: 8,
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 12px",
    borderRadius: 6,
    textAlign: "center",
  },
  ragExplainer: {
    fontSize: 13,
    color: "#78716c",
    lineHeight: 1.7,
    padding: "16px 20px",
    background: "#f5f5f4",
    borderRadius: 8,
    borderLeft: "3px solid #065f46",
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
    padding: "12px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: 8,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
  },
  headerName: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1c1917",
  },
  headerRole: {
    fontSize: 12,
    color: "#78716c",
  },
  switcherRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  switchBtn: {
    background: "transparent",
    border: "1px solid",
    borderRadius: 20,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },

  // Chat
  chatArea: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px",
  },
  systemMsg: {
    background: "#f5f5f4",
    border: "1px solid #e7e5e4",
    borderRadius: 10,
    padding: "12px 16px",
    marginBottom: 16,
    maxWidth: 540,
    marginLeft: "auto",
    marginRight: "auto",
  },
  systemLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#78716c",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  systemText: {
    fontSize: 13,
    color: "#57534e",
    lineHeight: 1.6,
    fontStyle: "italic",
  },
  msgRow: {
    display: "flex",
    marginBottom: 16,
  },
  msgBubbleWrap: {
    maxWidth: "75%",
    minWidth: 80,
  },
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
  metaLine: {
    fontSize: 10,
    color: "#a8a29e",
    marginTop: 2,
  },

  // Loading
  loadingDots: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 0",
  },
  loadingLabel: {
    fontSize: 12,
    color: "#a8a29e",
    fontStyle: "italic",
  },

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
  sourcesPanelTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#1c1917",
    margin: 0,
  },
  sourcesClose: {
    background: "none",
    border: "none",
    fontSize: 18,
    color: "#78716c",
    cursor: "pointer",
  },
  sourcesExplainer: {
    fontSize: 13,
    color: "#78716c",
    marginBottom: 16,
    lineHeight: 1.5,
  },
  sourceChunk: {
    background: "#f5f5f4",
    border: "1px solid #e7e5e4",
    borderRadius: 8,
    padding: "12px 14px",
    marginBottom: 10,
  },
  sourceChunkHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sourceChunkFile: {
    fontSize: 12,
    fontWeight: 600,
    color: "#44403c",
  },
  sourceChunkScore: {
    fontSize: 11,
    color: "#a8a29e",
  },
  sourceChunkText: {
    fontSize: 12,
    color: "#57534e",
    lineHeight: 1.5,
    fontStyle: "italic",
  },

  // Presets
  presetsBar: {
    padding: "8px 20px 4px",
    borderTop: "1px solid #e7e5e4",
    flexShrink: 0,
    overflowX: "auto",
  },
  presetsScroll: {
    display: "flex",
    gap: 6,
    paddingBottom: 6,
  },
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
  inputBar: {
    padding: "10px 20px 16px",
    flexShrink: 0,
  },
  errorInline: {
    fontSize: 12,
    color: "#dc2626",
    marginBottom: 6,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
  },
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
  ragPipelineArrow: {
    textAlign: "center",
    color: "#d6d3d1",
    fontSize: 12,
    lineHeight: 1,
  },
};
