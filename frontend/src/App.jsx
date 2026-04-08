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

// participants = [{ id, name, isUser, turns? }]
async function callModerator(transcript, participants, isOpening, introQueue = []) {
  const res = await fetch(`${API_BASE}/moderate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, participants, isOpening, introQueue }),
  });
  if (!res.ok) throw new Error("Moderation failed");
  return res.json(); // { message, nextPersonaId }
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

// ── TRANSLATIONS ──────────────────────────────────────────────────────────
const T = {
  en: {
    // Story page
    storyBadge: "CSCW 2026 — Interactive Prototype",
    storyTitle: "Zürichsee Bridge",
    storySession: "Cantonal Planning Commission — Session 1",
    storyP1: "The Canton of Zürich is considering the construction of a new fixed crossing over Lake Zürich: a cable-stayed bridge connecting the eastern and western shores between Rapperswil and Freienbach.",
    storyP2: "This is the first official planning commission session. Key stakeholders — an environmental lawyer, a business representative, a mobility advocate, a federal parliamentarian, and a structural engineer — have been invited to present their positions before any decisions are made.",
    storyP3: "Several parties were unable to attend in person. Their AI agents represent them, drawing on real Swiss laws, environmental reports, and position papers.",
    storyCta: "Enter the session →",
    // Mode selection page
    modeHeading: "How would you like to participate?",
    modeBack: "← Back",
    modeConsultTitle: "Interview a Stakeholder",
    modeConsultDesc: "Step into the role of a journalist or facilitator. Select any party and ask them direct questions about the bridge project. Switch between stakeholders at any time to compare positions.",
    modeConsultDetail: "Direct Q&A · no moderation · switch freely",
    modeDebateTitle: "Take a Seat at the Table",
    modeDebateDesc: "Choose a stakeholder role and participate in the full session. Kantonsrätin Weber will moderate: after an introduction round, the discussion is opened and you'll speak when the chair invites you.",
    modeDebateDetail: "Intro round · moderated discussion · your turn to speak",
    selectConsult: "Which stakeholder would you like to interview?",
    selectDebate: "Which role will you play in the meeting?",
    btnConsult: (n) => `Interview ${n} →`,
    btnDebate: (n) => `Play as ${n} →`,
    kbLabel: "Knowledge base",
    kbValue: (d, c) => `${d} documents · ${c} indexed passages`,
    // Meeting
    reset: "← Back to modes",
    chairPrompt: "⚖️ The chair is asking for your response",
    consultHint: "You are the journalist / facilitator — select a preset question below or type your own.",
    onboardingTitleConsult: "How it works",
    onboardingTipsConsult: [
      "Pick a preset question from the bar below, or type your own in the input field",
      "Switch between stakeholders using the icons in the top bar",
      "Each agent draws on real Swiss laws, environmental reports, and position papers",
    ],
    onboardingTitleDebate: "You're in the session",
    onboardingTipsDebate: [
      "Click 'Continue' after each introduction to advance the round",
      "The chair will invite you to speak — watch for the gold prompt below",
      "Use the preset lines or write your own position",
    ],
    onboardingDismiss: "Got it →",
    continueIntro: (n) => `Continue → ${n} introduces themselves`,
    continueDiscussion: "Continue → advance discussion",
    placeholderDebate: (n) => `Speak as ${n}...`,
    placeholderConsult: (n) => `Ask ${n} a question...`,
    errorMsg: "Technical error — please try again.",
    systemConsult: (n, o) => `Interview — ${n} · ${o}`,
    systemDebate: (n) => `Planning session — you are speaking as ${n}`,
    openingMsg: (firstName) =>
      `Welcome to the cantonal planning commission session on the proposed Zürichsee bridge. I am Kantonsrätin Maya Weber, chairing today's meeting. We will begin with a brief introduction round — each party please introduce themselves and state their fundamental position on the project. ${firstName}, would you please start.`,
    introInvitation: (n) => `Thank you. ${n}, you're next.`,
    introTransition: (userName) =>
      `Thank you all for the introductions. Let us now move to the substantive discussion. ${userName}, we look forward to your perspective — please go ahead.`,
    introQuery:
      "Please introduce yourself in 2–3 sentences: who are you, which organisation do you represent, and what is your fundamental position on the proposed Zürichsee bridge?",
  },
  de: {
    // Story page
    storyBadge: "CSCW 2026 — Interaktiver Prototyp",
    storyTitle: "Zürichseebrücke",
    storySession: "Kantonale Planungskommission — Sitzung 1",
    storyP1: "Der Kanton Zürich prüft den Bau einer neuen festen Querung über den Zürichsee: eine Schrägseilbrücke, die die Ost- und Westseite des Sees zwischen Rapperswil und Freienbach verbinden soll.",
    storyP2: "Dies ist die erste offizielle Planungskommissionssitzung. Die wichtigsten Stakeholder — ein Umweltanwalt, ein Wirtschaftsvertreter, ein Mobilitätsexperte, ein Nationalrat und eine Bauingenieurin — wurden eingeladen, ihre Positionen darzulegen, bevor Entscheidungen gefällt werden.",
    storyP3: "Mehrere Parteien konnten nicht persönlich erscheinen. Ihre KI-Agenten vertreten sie auf Basis echter Schweizer Gesetze, Umweltberichte und Positionspapiere.",
    storyCta: "Sitzung betreten →",
    // Mode selection page
    modeHeading: "Wie möchten Sie teilnehmen?",
    modeBack: "← Zurück",
    modeConsultTitle: "Stakeholder befragen",
    modeConsultDesc: "Nehmen Sie die Rolle eines Journalisten oder Moderators ein. Wählen Sie eine Partei und stellen Sie ihr direkt Fragen zum Brückenprojekt. Wechseln Sie jederzeit zwischen den Stakeholdern.",
    modeConsultDetail: "Direktes Q&A · keine Moderation · frei wechselbar",
    modeDebateTitle: "An der Sitzung teilnehmen",
    modeDebateDesc: "Wählen Sie eine Stakeholder-Rolle und nehmen Sie aktiv an der Planungssitzung teil. Kantonsrätin Weber moderiert: nach einer Vorstellungsrunde wird die Diskussion eröffnet und Sie sprechen, wenn Sie an der Reihe sind.",
    modeDebateDetail: "Vorstellungsrunde · moderierte Diskussion · aktive Teilnahme",
    selectConsult: "Welche Partei möchten Sie befragen?",
    selectDebate: "Welche Rolle übernehmen Sie in der Sitzung?",
    btnConsult: (n) => `${n} befragen →`,
    btnDebate: (n) => `Als ${n} teilnehmen →`,
    kbLabel: "Wissensbasis",
    kbValue: (d, c) => `${d} Dokumente · ${c} indexierte Abschnitte`,
    // Meeting
    reset: "← Zurück zu den Modi",
    chairPrompt: "⚖️ Die Vorsitzende erwartet Ihre Antwort",
    consultHint: "Du bist die Moderator:in / Journalist:in — wähle eine Frage aus den Vorschlägen oder tippe deine eigene.",
    onboardingTitleConsult: "So funktioniert's",
    onboardingTipsConsult: [
      "Wähle eine Schnellfrage aus der Leiste unten oder tippe deine eigene ein",
      "Wechsle den Gesprächspartner über die Icons in der oberen Leiste",
      "Jeder Agent stützt sich auf echte Schweizer Gesetze, Umweltberichte und Positionspapiere",
    ],
    onboardingTitleDebate: "Du bist in der Sitzung",
    onboardingTipsDebate: [
      "Klicke 'Weiter' nach jeder Vorstellung um die Runde fortzuführen",
      "Die Vorsitzende gibt dir das Wort — achte auf die goldene Aufforderung unten",
      "Nutze die Vorschlagstexte oder tippe deine eigene Position",
    ],
    onboardingDismiss: "Verstanden →",
    continueIntro: (n) => `Weiter → ${n} stellt sich vor`,
    continueDiscussion: "Weiter → Diskussion fortführen",
    placeholderDebate: (n) => `Sprechen Sie als ${n}...`,
    placeholderConsult: (n) => `Frage an ${n}...`,
    errorMsg: "Technischer Fehler — bitte erneut versuchen.",
    systemConsult: (n, o) => `Direktbefragung — ${n} · ${o}`,
    systemDebate: (n) => `Planungssitzung — Sie sprechen als ${n}`,
    openingMsg: (firstName) =>
      `Guten Tag und herzlich willkommen zur Planungskommissionssitzung über die vorgeschlagene Zürichseebrücke. Ich bin Kantonsrätin Maya Weber und leite diese Sitzung. Wir beginnen mit einer Vorstellungsrunde — ich bitte jede Partei, sich kurz vorzustellen und die eigene Grundposition zum Projekt zu nennen. ${firstName}, bitte beginnen Sie.`,
    introInvitation: (n) => `Danke. ${n}, Sie sind dran.`,
    introTransition: (userName) =>
      `Vielen Dank für die Vorstellungen. Kommen wir nun zur inhaltlichen Diskussion. ${userName}, wir sind gespannt auf Ihre Perspektive — bitte nehmen Sie das Wort.`,
    introQuery:
      "Bitte stellen Sie sich in 2–3 Sätzen vor: Wer sind Sie, welche Organisation vertreten Sie, und was ist Ihre grundsätzliche Haltung zum Brückenprojekt über den Zürichsee?",
  },
};

const CONSULT_PRESETS = {
  en: [
    { label: "Core position", text: "What is your position on the proposed bridge over Lake Zürich?" },
    { label: "Budget cuts", text: "The mayor proposes cutting the environmental mitigation budget by 40%. How do you respond?" },
    { label: "Economic case", text: "The bridge would reduce commute times by 35 minutes and create 2,000 jobs. Doesn't that outweigh environmental concerns?" },
    { label: "Compromise offer", text: "We are willing to plant 500 trees and create a small nature reserve as compensation. Would that address your concerns?" },
    { label: "Legal challenge", text: "If the project proceeds without addressing your demands, what will you do?" },
    { label: "Alternatives", text: "What alternatives to the bridge would you propose to improve cross-lake connectivity?" },
  ],
  de: [
    { label: "Grundposition", text: "Was ist Ihre grundsätzliche Haltung zum geplanten Brückenprojekt über den Zürichsee?" },
    { label: "Budgetkürzung", text: "Der Stadtrat schlägt vor, das Budget für Umweltmassnahmen um 40% zu kürzen. Wie reagieren Sie darauf?" },
    { label: "Wirtschaftliche Vorteile", text: "Die Brücke würde Pendelzeiten um 35 Minuten verkürzen und 2'000 Arbeitsplätze schaffen. Überwiegen diese Vorteile die ökologischen Bedenken?" },
    { label: "Kompromissangebot", text: "Wir sind bereit, 500 Bäume zu pflanzen und ein Naturschutzgebiet einzurichten. Würde das Ihre Forderungen erfüllen?" },
    { label: "Rechtliche Schritte", text: "Was werden Sie unternehmen, falls das Projekt ohne Berücksichtigung Ihrer Forderungen vorangetrieben wird?" },
    { label: "Alternativen", text: "Welche Alternativen zur Brücke schlagen Sie vor, um die Verbindung zwischen den Seeufern zu verbessern?" },
  ],
};

const DEBATE_PRESETS = {
  en: [
    { label: "Opening statement", text: "I'd like to present my position on this project." },
    { label: "Push back", text: "I strongly disagree with what was just said, and here's why." },
    { label: "Propose a deal", text: "Let me suggest a compromise that could address multiple concerns here." },
    { label: "Legal point", text: "I need to raise a legal consideration that hasn't been adequately addressed." },
    { label: "Question costs", text: "Let's talk honestly about the financial reality of this project." },
    { label: "Closing argument", text: "To summarize my position on this matter:" },
  ],
  de: [
    { label: "Eröffnungsstatement", text: "Ich möchte meinen Standpunkt zu diesem Projekt darlegen." },
    { label: "Widerspruch", text: "Ich widerspreche dem Gesagten entschieden, und zwar aus folgenden Gründen." },
    { label: "Kompromissvorschlag", text: "Ich möchte einen Kompromiss vorschlagen, der mehrere Interessen berücksichtigt." },
    { label: "Rechtlicher Einwand", text: "Ich muss auf einen rechtlichen Aspekt hinweisen, der bisher nicht ausreichend behandelt wurde." },
    { label: "Kosten hinterfragen", text: "Sprechen wir offen über die finanziellen Realitäten dieses Projekts." },
    { label: "Schlussplädoyer", text: "Zusammenfassend möchte ich meinen Standpunkt nochmals klar festhalten:" },
  ],
};

/**
 * Hardcoded intro step: moderator invites one AI persona to introduce themselves,
 * AI responds with a short self-introduction (2-3 sentences).
 * Returns updated messages array.
 */
// messages should already include the moderator invitation — this just fetches the AI response.
async function doIntroStep({ messages, persona, userPersonaName, introQuery, setMessages, setSpeakerCounts }) {
  const apiHistory = messages
    .filter((m) => m.role !== "system" && m.role !== "moderator")
    .map((m) =>
      m.isDebateUser
        ? { role: "user", content: `[${userPersonaName}:]\n${m.content}` }
        : { role: "assistant", content: m.content }
    );

  const result = await sendChat(introQuery, persona.id, apiHistory);

  const final = [...messages, { role: "assistant", content: result.response, persona }];
  setMessages([...final]);
  setSpeakerCounts((prev) => ({ ...prev, [persona.id]: (prev[persona.id] || 0) + 1 }));
  return final;
}

/**
 * ONE step in the moderated discussion phase:
 * LLM moderator speaks → AI responds → pause (awaitingContinue = true)
 * If moderator addresses user → chairAddressingUser = true
 */
async function stepDebate({
  messages,
  debateParticipants,
  userPersonaId,
  userPersonaName,
  allPersonas,
  setMessages,
  setChairAddressingUser,
  setAwaitingContinue,
  setSpeakerCounts,
}) {
  const transcript = buildTranscript(messages, { name: userPersonaName });
  let mod;
  try {
    mod = await callModerator(transcript, debateParticipants, false, []);
  } catch {
    setChairAddressingUser(true);
    setAwaitingContinue(false);
    return messages;
  }

  let msgs = [...messages, { role: "moderator", content: mod.message }];
  setMessages([...msgs]);

  if (!mod.nextPersonaId || mod.nextPersonaId === userPersonaId) {
    setChairAddressingUser(true);
    setAwaitingContinue(false);
    return msgs;
  }

  const aiPersona = allPersonas.find((p) => p.id === mod.nextPersonaId);
  if (!aiPersona) {
    setChairAddressingUser(true);
    setAwaitingContinue(false);
    return msgs;
  }

  const apiHistory = msgs
    .filter((m) => m.role !== "system" && m.role !== "moderator")
    .map((m) =>
      m.isDebateUser
        ? { role: "user", content: `[${userPersonaName}:]\n${m.content}` }
        : { role: "assistant", content: m.content }
    );

  let result;
  try {
    result = await sendChat(mod.message, aiPersona.id, apiHistory);
  } catch {
    setAwaitingContinue(false);
    setChairAddressingUser(true);
    return msgs;
  }

  msgs = [...msgs, { role: "assistant", content: result.response, persona: aiPersona }];
  setMessages([...msgs]);
  setSpeakerCounts((prev) => ({ ...prev, [aiPersona.id]: (prev[aiPersona.id] || 0) + 1 }));
  setAwaitingContinue(true);
  setChairAddressingUser(false);
  return msgs;
}


export default function App() {
  const [lang, setLang] = useState(null); // null = language picker, "en" | "de"
  const [phase, setPhase] = useState("story"); // "story" | "intro" | "meeting"
  const [mode, setMode] = useState(null); // null | "consult" | "debate"
  const [personas, setPersonas] = useState([]);
  const [stats, setStats] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastSources, setLastSources] = useState(null);
  const [error, setError] = useState(null);

  // Consult mode
  const [activePersona, setActivePersona] = useState(null);

  // Debate mode
  const [userPersona, setUserPersona] = useState(null);
  const [debatePersonas, setDebatePersonas] = useState([]);
  const [chairAddressingUser, setChairAddressingUser] = useState(false);
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const [introQueue, setIntroQueue] = useState([]); // AI IDs yet to introduce themselves
  const [speakerCounts, setSpeakerCounts] = useState({}); // personaId → turn count
  const [showOnboarding, setShowOnboarding] = useState(false);

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
    setMode(null);  // go back to mode selection, not story
    setActivePersona(null);
    setUserPersona(null);
    setDebatePersonas([]);
    setChairAddressingUser(false);
    setAwaitingContinue(false);
    setIntroQueue([]);
    setSpeakerCounts({});
    setMessages([]);
    setInput("");
    setError(null);
    setLastSources(null);
    setShowOnboarding(false);
  };

  const startConsult = (persona) => {
    setActivePersona(persona);
    setPhase("meeting");
    setMessages([{ role: "system", content: t.systemConsult(persona.name, persona.organization) }]);
    setShowOnboarding(true);
  };

  const startDebate = async (myPersona) => {
    const others = personas.filter((p) => p.id !== myPersona.id);
    setUserPersona(myPersona);
    setDebatePersonas(others);
    setChairAddressingUser(false);
    setAwaitingContinue(false);
    setSpeakerCounts({});
    setPhase("meeting");
    setShowOnboarding(true);

    // Intro queue: all AI personas in order (excluding user)
    const queue = others.map((p) => p.id);
    setIntroQueue(queue);

    const initMsgs = [{ role: "system", content: t.systemDebate(myPersona.name) }];
    const firstPersona = others[0];
    const openingMsgs = [
      ...initMsgs,
      { role: "moderator", content: t.openingMsg(firstPersona.name) },
    ];
    setMessages(openingMsgs);
    setIsLoading(true);

    try {
      const afterFirst = await doIntroStep({
        messages: openingMsgs, persona: firstPersona,
        userPersonaName: myPersona.name, introQuery: t.introQuery,
        setMessages, setSpeakerCounts,
      });
      setIntroQueue(queue.slice(1));
      setAwaitingContinue(true);
      void afterFirst;
    } catch (e) {
      console.error("Debate opening error:", e);
    }
    setIsLoading(false);
  };

  const switchPersona = (persona) => {
    setActivePersona(persona);
    setMessages((prev) => [...prev, { role: "system", content: t.systemConsult(persona.name, persona.organization) }]);
    setLastSources(null);
  };

  const handleContinue = useCallback(async () => {
    if (isLoading || !awaitingContinue) return;
    setIsLoading(true);
    setAwaitingContinue(false);
    setShowOnboarding(false);

    if (introQueue.length > 0) {
      // Still in intro round — add brief moderator invitation, then get AI intro
      const nextPersona = personas.find((p) => p.id === introQueue[0]);
      const tl = T[lang] || T.en;
      const withInvitation = [
        ...messages,
        { role: "moderator", content: tl.introInvitation(nextPersona.name) },
      ];
      setMessages(withInvitation);
      try {
        await doIntroStep({
          messages: withInvitation, persona: nextPersona,
          userPersonaName: userPersona.name, introQuery: tl.introQuery,
          setMessages, setSpeakerCounts,
        });
        const remaining = introQueue.slice(1);
        setIntroQueue(remaining);
        if (remaining.length === 0) {
          setMessages((prev) => [
            ...prev,
            { role: "moderator", content: tl.introTransition(userPersona.name) },
          ]);
          setChairAddressingUser(true);
          setAwaitingContinue(false);
        } else {
          setAwaitingContinue(true);
        }
      } catch (e) {
        console.error("Intro step error:", e);
        setAwaitingContinue(true);
      }
    } else {
      // Discussion phase — LLM moderator takes over
      const debateParticipants = personas.map((p) => ({
        id: p.id, name: p.name, isUser: p.id === userPersona.id,
        turns: speakerCounts[p.id] || 0,
      }));
      await stepDebate({
        messages, debateParticipants,
        userPersonaId: userPersona.id, userPersonaName: userPersona.name,
        allPersonas: personas,
        setMessages, setChairAddressingUser, setAwaitingContinue, setSpeakerCounts,
      });
    }
    setIsLoading(false);
  }, [messages, isLoading, awaitingContinue, userPersona, personas, introQueue, speakerCounts, lang]);

  const handleSend = useCallback(
    async (text) => {
      if (!text.trim() || isLoading) return;
      const trimmed = text.trim();
      setInput("");
      setError(null);
      setLastSources(null);
      setIsLoading(true);
      setShowOnboarding(false);

      if (mode === "consult") {
        const userMsg = { role: "user", content: trimmed };
        setMessages((prev) => [...prev, userMsg]);
        const history = messages.filter((m) => m.role !== "system").concat(userMsg);
        try {
          const result = await sendChat(trimmed, activePersona.id, history);
          setMessages((prev) => [...prev, { role: "assistant", content: result.response, persona: activePersona }]);
        } catch (err) {
          setError(err.message);
          setMessages((prev) => [...prev, { role: "assistant", content: t.errorMsg, persona: activePersona }]);
        }
        setIsLoading(false);
      } else {
        // Debate mode: add user message, then do one moderated step
        setChairAddressingUser(false);
        setAwaitingContinue(false);
        const debateParticipants = personas.map((p) => ({
          id: p.id, name: p.name, isUser: p.id === userPersona.id,
          turns: speakerCounts[p.id] || 0,
        }));
        const userMsg = { role: "user", content: trimmed, isDebateUser: true };
        setMessages((prev) => [...prev, userMsg]);
        const currentMsgs = [...messages, userMsg];
        try {
          await stepDebate({
            messages: currentMsgs, debateParticipants,
            userPersonaId: userPersona.id, userPersonaName: userPersona.name,
            allPersonas: personas,
            setMessages, setChairAddressingUser, setAwaitingContinue, setSpeakerCounts,
          });
        } catch (err) {
          setError(err.message);
          setMessages((prev) => [...prev, { role: "assistant", content: t.errorMsg }]);
        }
        setIsLoading(false);
      }
    },
    [messages, isLoading, mode, activePersona, userPersona, personas, introQueue, speakerCounts, lang]
  );

  const t = T[lang] || T.en;
  const accentColor = mode === "consult" ? activePersona?.color : userPersona?.color;

  // ── LANGUAGE PICKER ────────────────────────────────────────────────────
  if (!lang) {
    return (
      <div style={s.langScreen}>
        <div style={s.langCard}>
          <div style={s.langTitle}>Zürichsee Bridge</div>
          <div style={s.langSubtitle}>Stakeholder Consultation Meeting</div>
          <div style={s.langBtnRow}>
            <button style={s.langBtn} className="langBtn" onClick={() => setLang("en")}>English</button>
            <button style={s.langBtn} className="langBtn" onClick={() => setLang("de")}>Deutsch</button>
          </div>
        </div>
      </div>
    );
  }

  // ── STORY PAGE ─────────────────────────────────────────────────────────
  if (phase === "story") {
    return (
      <div style={s.introContainer}>
        <div style={s.introBg} />
        {/* Language toggle — top right */}
        <div style={s.langToggle}>
          <button style={{ ...s.langToggleBtn, fontWeight: lang === "en" ? 700 : 400 }} onClick={() => setLang("en")}>EN</button>
          <span style={s.langToggleSep}>|</span>
          <button style={{ ...s.langToggleBtn, fontWeight: lang === "de" ? 700 : 400 }} onClick={() => setLang("de")}>DE</button>
        </div>

        <div style={s.storyContent}>
          <div style={s.introBadge}>{t.storyBadge}</div>
          <h1 style={s.introTitle}>{t.storyTitle}</h1>
          <p style={s.storySession}>{t.storySession}</p>

          <div style={s.heroWrap}>
            <img src="/bridge.png" alt="Zürichsee bridge concept" style={s.heroImg} />
          </div>

          <div style={s.storyBody}>
            <p style={s.storyP}>{t.storyP1}</p>
            <p style={s.storyP}>{t.storyP2}</p>
            <p style={s.storyP}>{t.storyP3}</p>
          </div>

          <button style={s.storyCta} className="storyCta" onClick={() => setPhase("intro")}>
            {t.storyCta}
          </button>
        </div>
      </div>
    );
  }

  // ── MODE SELECTION ──────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div style={s.introContainer}>
        <div style={s.introBg} />
        {/* Language toggle — top right */}
        <div style={s.langToggle}>
          <button style={{ ...s.langToggleBtn, fontWeight: lang === "en" ? 700 : 400 }} onClick={() => setLang("en")}>EN</button>
          <span style={s.langToggleSep}>|</span>
          <button style={{ ...s.langToggleBtn, fontWeight: lang === "de" ? 700 : 400 }} onClick={() => setLang("de")}>DE</button>
        </div>

        <div style={s.introContent}>
          {/* Back to story */}
          <button style={s.backBtn} onClick={() => setPhase("story")}>{t.modeBack}</button>

          <h2 style={s.modeHeading}>{t.modeHeading}</h2>

          {error && <div style={s.errorBox}>{error}</div>}

          {/* Mode cards */}
          <div style={s.modeGrid}>
            <button
              onClick={() => setMode(mode === "consult" ? null : "consult")}
              style={{ ...s.modeCard, ...(mode === "consult" ? s.modeCardActive : {}) }}
            >
              <div style={s.modeTitle}>{t.modeConsultTitle}</div>
              <div style={s.modeDesc}>{t.modeConsultDesc}</div>
              <div style={s.modeDetail}>{t.modeConsultDetail}</div>
            </button>
            <button
              onClick={() => setMode(mode === "debate" ? null : "debate")}
              style={{ ...s.modeCard, ...(mode === "debate" ? s.modeCardActive : {}) }}
            >
              <div style={s.modeTitle}>{t.modeDebateTitle}</div>
              <div style={s.modeDesc}>{t.modeDebateDesc}</div>
              <div style={s.modeDetail}>{t.modeDebateDetail}</div>
            </button>
          </div>

          {/* Persona selection */}
          {mode && (
            <div style={{ animation: "fadeIn 0.2s ease-out" }}>
              <p style={s.personaSelectLabel}>
                {mode === "consult" ? t.selectConsult : t.selectDebate}
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
                        ? t.btnConsult(p.name.split(" ")[0])
                        : t.btnDebate(p.name.split(" ")[0])}
                    </div>
                  </button>
                ))}
              </div>

              {stats && (
                <div style={{ ...s.statsBox, marginTop: 8 }}>
                  <span style={s.statsLabel}>{t.kbLabel}</span>
                  <span style={s.statsValue}>{t.kbValue(stats.totalDocuments, stats.totalChunks)}</span>
                </div>
              )}
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
                <div style={s.headerRole}>{userPersona.role} · {userPersona.organization}</div>
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
              {debatePersonas.map((p) => (
                <span
                  key={p.id}
                  title={`${p.name} — ${speakerCounts[p.id] || 0} turns`}
                  style={{ ...s.debateChip, color: p.color, border: `1px solid ${p.color}30` }}
                >
                  {p.icon} {p.name.split(" ")[0]}
                </span>
              ))}
            </div>
          )}
          <div style={s.langToggleInline}>
            <button style={{ ...s.langToggleBtn, fontWeight: lang === "en" ? 700 : 400 }} onClick={() => setLang("en")}>EN</button>
            <span style={s.langToggleSep}>|</span>
            <button style={{ ...s.langToggleBtn, fontWeight: lang === "de" ? 700 : 400 }} onClick={() => setLang("de")}>DE</button>
          </div>
          <button onClick={reset} style={s.resetBtn}>
            {t.reset}
          </button>
        </div>
      </div>

      {/* Chat area */}
      <div style={s.chatArea}>
        {showOnboarding && (
          <div style={s.onboardingCard}>
            <div style={s.onboardingTitle}>
              {mode === "debate" ? t.onboardingTitleDebate : t.onboardingTitleConsult}
            </div>
            <ul style={s.onboardingList}>
              {(mode === "debate" ? t.onboardingTipsDebate : t.onboardingTipsConsult).map((tip, i) => (
                <li key={i} style={s.onboardingItem}>{tip}</li>
              ))}
            </ul>
            <button onClick={() => setShowOnboarding(false)} style={s.onboardingDismiss}>
              {t.onboardingDismiss}
            </button>
          </div>
        )}
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
              </div>
            </div>
          );
        })}

        {/* Loading indicator */}
        {isLoading && (
          <div style={{ ...s.msgRow, justifyContent: "flex-start" }}>
            <div style={s.loadingDots}>
              <span className="loadingDot" />
              <span className="loadingDot" />
              <span className="loadingDot" />
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Preset questions */}
      <div style={s.presetsBar}>
        <div style={s.presetsScroll}>
          {(mode === "debate" ? DEBATE_PRESETS[lang] : CONSULT_PRESETS[lang]).map((q, i) => (
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
        {mode === "debate" && awaitingContinue && !isLoading && (
          <button onClick={handleContinue} style={s.continueBtn} className="continueBtn">
            {introQueue.length > 0
              ? t.continueIntro(personas.find((p) => p.id === introQueue[0])?.name)
              : t.continueDiscussion}
          </button>
        )}
        {mode === "debate" && chairAddressingUser && !isLoading && (
          <div style={s.chairPrompt}>{t.chairPrompt}</div>
        )}
        {mode === "consult" && !messages.some((m) => m.role === "user") && !isLoading && (
          <div style={s.chairPrompt}>{t.consultHint}</div>
        )}
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
                ? t.placeholderDebate(userPersona?.name)
                : t.placeholderConsult(activePersona?.name)
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
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .langBtn:hover { background: #f5f5f4; border-color: #a8a29e; }
        .storyCta:hover { background: #292524; }
        @keyframes dotPulse { 0%,80%,100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
        .loadingDot { width: 7px; height: 7px; border-radius: 50%; background: #d6d3d1; display: inline-block; animation: dotPulse 1.2s infinite; }
        .loadingDot:nth-child(2) { animation-delay: 0.2s; }
        .loadingDot:nth-child(3) { animation-delay: 0.4s; }
        textarea::placeholder { color: #a8a29e; }
        .continueBtn:hover { background: #f5f5f4; border-color: #a8a29e; }
      `}</style>
    </div>
  );
}

// ── STYLES ──────────────────────────────────────────────────────────────
const s = {
  // Language toggle (persistent, top-right on pre-meeting pages)
  langToggle: {
    position: "absolute",
    top: 20,
    right: 24,
    display: "flex",
    alignItems: "center",
    gap: 4,
    zIndex: 10,
  },
  langToggleInline: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  langToggleBtn: {
    background: "none",
    border: "none",
    fontSize: 12,
    color: "#78716c",
    cursor: "pointer",
    padding: "2px 4px",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.5,
  },
  langToggleSep: { fontSize: 11, color: "#d6d3d1" },

  // Story page
  storyContent: {
    maxWidth: 720,
    width: "100%",
    position: "relative",
    zIndex: 1,
    paddingTop: 16,
  },
  storySession: {
    fontSize: 14,
    color: "#78716c",
    fontWeight: 500,
    margin: "0 0 28px",
    letterSpacing: 0.2,
  },
  storyBody: {
    maxWidth: 620,
    marginBottom: 36,
  },
  storyP: {
    fontSize: 15,
    color: "#57534e",
    lineHeight: 1.75,
    margin: "0 0 14px",
  },
  storyCta: {
    display: "inline-block",
    padding: "14px 32px",
    background: "#1c1917",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.2,
    transition: "all 0.15s",
  },

  // Mode selection page
  modeHeading: {
    fontSize: 22,
    fontWeight: 700,
    color: "#1c1917",
    margin: "0 0 24px",
  },
  backBtn: {
    background: "none",
    border: "none",
    fontSize: 13,
    fontWeight: 600,
    color: "#78716c",
    cursor: "pointer",
    padding: "0 0 20px",
    fontFamily: "'DM Sans', sans-serif",
    display: "block",
  },
  modeDetail: {
    marginTop: 8,
    fontSize: 11,
    color: "#a8a29e",
    fontWeight: 500,
    letterSpacing: 0.3,
  },

  // Language picker
  langScreen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#fafaf9",
    fontFamily: "'DM Sans', sans-serif",
  },
  langCard: {
    textAlign: "center",
  },
  langTitle: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 36,
    fontWeight: 400,
    color: "#1c1917",
    marginBottom: 6,
  },
  langSubtitle: {
    fontSize: 15,
    color: "#78716c",
    marginBottom: 40,
  },
  langBtnRow: {
    display: "flex",
    gap: 16,
    justifyContent: "center",
  },
  langBtn: {
    padding: "12px 36px",
    fontSize: 15,
    fontWeight: 600,
    color: "#1c1917",
    background: "#fff",
    border: "1.5px solid #d6d3d1",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
    letterSpacing: 0.3,
  },

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

  // Hero image
  heroWrap: {
    width: "100%",
    maxWidth: 900,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 32,
    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
  },
  heroImg: {
    width: "100%",
    height: 260,
    objectFit: "cover",
    objectPosition: "center 60%",
    display: "block",
  },

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

  // Loading dots
  loadingDots: {
    display: "flex",
    gap: 5,
    padding: "14px 16px",
    background: "#fff",
    border: "1px solid #e7e5e4",
    borderRadius: "12px 12px 12px 4px",
    alignItems: "center",
  },

  // Input
  inputBar: { padding: "10px 16px 16px", flexShrink: 0 },
  continueBtn: {
    display: "block",
    width: "100%",
    marginBottom: 8,
    padding: "9px 16px",
    background: "#fff",
    border: "1.5px solid #d6d3d1",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "#57534e",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    textAlign: "center",
    transition: "all 0.15s",
  },
  chairPrompt: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "#92400e",
    background: "#fef9c3",
    border: "1px solid #fde68a",
    borderRadius: 6,
    padding: "5px 10px",
    marginBottom: 6,
  },
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

  // Onboarding card
  onboardingCard: {
    background: "#fefce8",
    border: "1px solid #fef08a",
    borderLeft: "3px solid #ca8a04",
    borderRadius: 8,
    padding: "14px 16px",
    marginBottom: 20,
  },
  onboardingTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#92400e",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  onboardingList: {
    margin: "0 0 12px",
    paddingLeft: 18,
  },
  onboardingItem: {
    fontSize: 13,
    color: "#78350f",
    lineHeight: 1.6,
    marginBottom: 2,
  },
  onboardingDismiss: {
    background: "#ca8a04",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "background 0.15s",
  },

};
