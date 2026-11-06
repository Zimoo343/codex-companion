"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatSession } from "../chat-store";

type SidebarProps = {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  open: boolean;
  onToggle: () => void;
};

const HOLD_MS = 800;

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  open,
  onToggle,
}: SidebarProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [hold, setHold] = useState<{ id: string; progress: number } | null>(null);

  const frame = useRef<number | null>(null);
  const lastTick = useRef<number>(0);

  // Holding the trash icon fills a bar, like dismantling gear. Letting go drains it.
  useEffect(() => {
    if (!hold) return;

    function tick(now: number) {
      const delta = now - (lastTick.current || now);
      lastTick.current = now;

      setHold((current) => {
        if (!current) return current;
        const next = Math.min(1, current.progress + delta / HOLD_MS);
        if (next >= 1) {
          setConfirming(current.id);
          return null;
        }
        return { ...current, progress: next };
      });

      frame.current = requestAnimationFrame(tick);
    }

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = null;
      lastTick.current = 0;
    };
  }, [hold?.id]);

  function startHold(id: string) {
    if (confirming === id) return;
    lastTick.current = 0;
    setHold({ id, progress: 0 });
  }

  function stopHold() {
    setHold(null);
  }

  // The hold is the ritual; once confirmed, the chat just goes.
  function dismantle(id: string) {
    setConfirming(null);
    onDelete(id);
  }

  return (
    <aside className={`sidebar${open ? " sidebar-open" : ""}`}>
      <div className="sidebar-head">
        <span className="brand">CODEX</span>
        <button className="icon-button" onClick={onToggle} aria-label="Toggle chat list">
          ☰
        </button>
      </div>

      <button className="new-chat" onClick={onNew}>
        + New chat
      </button>

      <div className="chat-list-label">Chats</div>

      <nav className="chat-list">
        {sessions.length === 0 && <p className="empty">No chats yet.</p>}
        {sessions.map((session) => {
          const progress = hold?.id === session.id ? hold.progress : 0;

          return (
            <div
              key={session.id}
              className={[
                "chat-item",
                session.id === activeId ? "chat-item-active" : "",
                confirming === session.id ? "chat-item-confirming" : "",
                progress > 0 ? "chat-item-holding" : "",
              ].join(" ")}
            >
              {confirming === session.id ? (
                <div className="chat-confirm">
                  <span>Dismantle this chat?</span>
                  <div className="chat-confirm-actions">
                    <button className="confirm-cancel" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                    <button className="confirm-danger" onClick={() => dismantle(session.id)}>
                      Dismantle
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button className="chat-select" onClick={() => onSelect(session.id)}>
                    {session.title || "New chat"}
                  </button>
                  <button
                    className="chat-delete"
                    title="Hold to dismantle"
                    aria-label="Hold to dismantle chat"
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      startHold(session.id);
                    }}
                    onPointerUp={stopHold}
                    onPointerLeave={stopHold}
                    onPointerCancel={stopHold}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        startHold(session.id);
                      }
                    }}
                    onKeyUp={stopHold}
                  >
                    🗑
                  </button>
                </>
              )}

              <span
                className="dismantle-bar"
                style={progress > 0 ? { width: `${progress * 100}%` } : undefined}
              />
            </div>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <a href="https://github.com/Zimoo343/codex-companion" target="_blank" rel="noreferrer">
          source
        </a>
        <span>·</span>
        <a href="https://www.destinypedia.com" target="_blank" rel="noreferrer">
          credits
        </a>
      </div>
    </aside>
  );
}
