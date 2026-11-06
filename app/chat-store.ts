"use client";

import { useCallback, useEffect, useState } from "react";

export type Source = {
  index: number;
  title: string;
  section: string;
  url: string;
  sourceName: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  dataVersion?: string;
  error?: boolean;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
};

const TITLE_STOP_WORDS = new Set([
  "what",
  "whats",
  "which",
  "who",
  "how",
  "does",
  "do",
  "did",
  "is",
  "are",
  "was",
  "the",
  "a",
  "an",
  "for",
  "on",
  "in",
  "to",
  "of",
  "with",
  "my",
  "me",
  "i",
  "you",
  "best",
  "good",
  "should",
  "use",
  "using",
  "can",
  "get",
  "there",
  "this",
  "that",
  "it",
  "its",
  "about",
  "tell",
  "any",
  "some",
  "currently",
  "right",
  "now",
  "some",
  "want",
  "need",
  "like",
  "works",
  "work",
  "mean",
  "means",
]);

// "which exotic class item combos are good for hunter survivability"
//   -> "Exotic Class Item Combos Hunter"
export function titleFromQuestion(question: string): string {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !TITLE_STOP_WORDS.has(word));

  const picked = words.slice(0, 4);
  if (picked.length === 0) return question.slice(0, 40);

  const ACRONYMS: Record<string, string> = {
    dlc: "DLC",
    pvp: "PvP",
    pve: "PvE",
    dps: "DPS",
    lfg: "LFG",
    lmg: "LMG",
    smg: "SMG",
    lfr: "LFR",
    hgl: "HGL",
    d2: "D2",
  };

  return picked
    .map((word) => ACRONYMS[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const STORAGE_KEY = "codex-companion.chats.v1";
const INVITE_KEY = "codex-companion.invite";

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useChatStore() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = loadSessions();
    setSessions(stored);
    setActiveId(stored[0]?.id ?? null);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions, ready]);

  const active = sessions.find((session) => session.id === activeId) ?? null;

  const createSession = useCallback((title = "New chat") => {
    const session: ChatSession = { id: newId(), title, createdAt: Date.now(), messages: [] };
    setSessions((current) => [session, ...current]);
    setActiveId(session.id);
    return session;
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((current) => {
        const next = current.filter((session) => session.id !== id);
        if (id === activeId) setActiveId(next[0]?.id ?? null);
        return next;
      });
    },
    [activeId],
  );

  const appendMessage = useCallback((sessionId: string, message: ChatMessage) => {
    setSessions((current) =>
      current.map((session) => {
        if (session.id !== sessionId) return session;
        const title =
          session.messages.length === 0 && message.role === "user"
            ? titleFromQuestion(message.text)
            : session.title;
        return { ...session, title, messages: [...session.messages, message] };
      }),
    );
  }, []);

  const renameSession = useCallback((id: string, title: string) => {
    const clean = title.trim().slice(0, 60);
    if (!clean) return;
    setSessions((current) =>
      current.map((session) => (session.id === id ? { ...session, title: clean } : session)),
    );
  }, []);

  const replaceMessage = useCallback(
    (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => {
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                messages: session.messages.map((message) =>
                  message.id === messageId ? { ...message, ...patch } : message,
                ),
              }
            : session,
        ),
      );
    },
    [],
  );

  return {
    sessions,
    active,
    activeId,
    setActiveId,
    createSession,
    deleteSession,
    renameSession,
    appendMessage,
    replaceMessage,
    ready,
  };
}

export function getInviteCode(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(INVITE_KEY) ?? "";
}

export function saveInviteCode(code: string) {
  localStorage.setItem(INVITE_KEY, code);
}

export const messageId = newId;
