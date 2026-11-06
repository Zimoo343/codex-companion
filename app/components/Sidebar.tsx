"use client";

import { useState } from "react";
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

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  open,
  onToggle,
}: SidebarProps) {
  const [dismantling, setDismantling] = useState<string | null>(null);

  // Deleting a chat borrows the game's dismantle language: red bar sweeps, then it goes.
  function dismantle(id: string) {
    if (dismantling) return;
    setDismantling(id);
    window.setTimeout(() => {
      onDelete(id);
      setDismantling(null);
    }, 850);
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
        {sessions.map((session) => (
          <div
            key={session.id}
            className={[
              "chat-item",
              session.id === activeId ? "chat-item-active" : "",
              dismantling === session.id ? "chat-item-dismantling" : "",
            ].join(" ")}
          >
            <button className="chat-select" onClick={() => onSelect(session.id)}>
              {session.title || "New chat"}
            </button>
            <button
              className="chat-delete"
              title="Dismantle chat"
              onClick={() => dismantle(session.id)}
              disabled={dismantling === session.id}
            >
              {dismantling === session.id ? "DISMANTLING" : "✕"}
            </button>
            <span className="dismantle-bar" />
          </div>
        ))}
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
