"use client";

import { useEffect, useRef, useState } from "react";
import { Message } from "./components/Message";
import { Sidebar } from "./components/Sidebar";
import {
  getInviteCode,
  messageId,
  saveInviteCode,
  useChatStore,
  type ChatMessage,
} from "./chat-store";

type AskResponse = {
  answer: string;
  sources: ChatMessage["sources"];
  dataVersion: string;
  error?: string;
};

const SAMPLE_QUESTIONS = [
  "what is the best rocket launcher right now",
  "how do champions work",
  "what does bait and switch do",
  "which exotic armor helps a hunter survive",
];

export default function Home() {
  const {
    sessions,
    active,
    activeId,
    setActiveId,
    createSession,
    deleteSession,
    appendMessage,
    replaceMessage,
    ready,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [gateOpen, setGateOpen] = useState(false);
  const [gateInput, setGateInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [gateChecking, setGateChecking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Nothing on the page is usable until the invitation is accepted.
  useEffect(() => {
    const stored = getInviteCode();
    setInviteCode(stored);
    if (!stored) {
      setGateOpen(true);
      return;
    }
    void verifyCode(stored, true);
  }, []);

  async function verifyCode(code: string, silent = false) {
    setGateChecking(true);
    if (!silent) setGateError("");
    try {
      const response = await fetch("/api/access", { headers: { "x-access-code": code } });
      const body = (await response.json()) as { ok: boolean; gate: boolean };
      if (body.ok) {
        saveInviteCode(code);
        setInviteCode(code);
        setGateOpen(false);
        setGateError("");
        return;
      }
      if (!silent) setGateError("That code does not match.");
      // A stale stored code must still show the gate, otherwise the page stays locked
      // with no way in.
      setGateOpen(true);
    } catch {
      if (!silent) setGateError("Could not reach the server.");
    } finally {
      setGateChecking(false);
    }
  }
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, pending]);

  function startNewChat() {
    createSession();
    setInput("");
    textareaRef.current?.focus();
  }

  async function send(question: string) {
    const text = question.trim();
    if (!text || pending) return;

    setPending(true);
    setInput("");

    const session = active ?? createSession(text.slice(0, 60));
    appendMessage(session.id, { id: messageId(), role: "user", text });

    const assistantId = messageId();
    appendMessage(session.id, { id: assistantId, role: "assistant", text: "" });

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json", "x-access-code": inviteCode },
        body: JSON.stringify({ question: text }),
      });
      const body = (await response.json()) as AskResponse;

      if (response.status === 401) {
        setGateOpen(true);
        replaceMessage(session.id, assistantId, {
          text: "Access expired. Enter the invite code to continue.",
          error: true,
        });
        return;
      }

      if (!response.ok) {
        replaceMessage(session.id, assistantId, {
          text: body.error ?? "Something went wrong.",
          error: true,
        });
        return;
      }

      saveInviteCode(inviteCode);
      replaceMessage(session.id, assistantId, {
        text: body.answer,
        sources: body.sources,
        dataVersion: body.dataVersion,
      });
    } catch {
      replaceMessage(session.id, assistantId, {
        text: "Could not reach the companion.",
        error: true,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {gateOpen && (
        <div className="gate" role="dialog" aria-modal="true" aria-label="Invitation required">
          <div className="gate-panel">
            <div className="gate-mark">CODEX</div>
            <h2>Private preview</h2>
            <p>
              This companion is invite-only while it is being tested. Enter the code you were given
              to continue.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void verifyCode(gateInput || inviteCode);
              }}
            >
              <input
                autoFocus
                className="gate-input"
                placeholder="Invite code"
                value={gateInput}
                onChange={(event) => setGateInput(event.target.value)}
                spellCheck={false}
              />
              <button className="gate-button" type="submit" disabled={gateChecking || !gateInput}>
                {gateChecking ? "Checking…" : "Enter"}
              </button>
            </form>
            {gateError && <p className="gate-error">{gateError}</p>}
            <p className="gate-foot">
              Grounded in Bungie data, AegisRelic and Destiny Data Compendium.
            </p>
          </div>
        </div>
      )}

      <div className={`shell${sidebarOpen ? " shell-with-sidebar" : ""}`}>
        <Sidebar
          sessions={sessions}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={startNewChat}
          onDelete={deleteSession}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((open) => !open)}
        />

        <main className="chat">
          <header className="chat-head">
            {!sidebarOpen && (
              <button
                className="icon-button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Show chats"
              >
                ☰
              </button>
            )}
            <div>
              <h1>Codex Companion</h1>
              <p>Destiny 2 answers, grounded in Bungie data and community spreadsheets.</p>
            </div>
          </header>

          <div className="messages">
            {(!ready || !active || active.messages.length === 0) && (
              <div className="welcome">
                <div className="eyebrow">Destiny 2 knowledge</div>
                <h2>Ask about anything in Destiny 2</h2>
                <p>
                  Weapons, damage numbers, perks, exotics, aspects, raids and dungeons. Every answer
                  shows where it came from.
                </p>
                <div className="samples">
                  {SAMPLE_QUESTIONS.map((sample) => (
                    <button key={sample} className="sample" onClick={() => send(sample)}>
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {active?.messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}

            {pending && (
              <div className="message message-assistant">
                <div className="bubble bubble-assistant typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <div className="composer-row">
              <textarea
                ref={textareaRef}
                rows={2}
                maxLength={500}
                placeholder="Ask a Destiny 2 question…"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
              />
              <button className="send" type="submit" disabled={pending || !input.trim()}>
                {pending ? "…" : "Send"}
              </button>
            </div>
            <div className="composer-foot">
              <span>
                Data: Bungie manifest, AegisRelic, Destiny Data Compendium, Destinypedia (CC BY-SA
                4.0)
              </span>
              <span>
                {active?.messages.at(-1)?.dataVersion
                  ? `manifest ${active.messages.at(-1)?.dataVersion}`
                  : ""}
              </span>
            </div>
          </form>
        </main>
      </div>
    </>
  );
}
