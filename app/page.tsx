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
  const [needsCode, setNeedsCode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setInviteCode(getInviteCode()), []);
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
        setNeedsCode(true);
        replaceMessage(session.id, assistantId, {
          text: "This demo is invite-only. Add the invite code below and ask again.",
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

      setNeedsCode(false);
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
          {needsCode && (
            <input
              className="invite"
              placeholder="Invite code"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
            />
          )}
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
  );
}
