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
            ? message.text.slice(0, 60)
            : session.title;
        return { ...session, title, messages: [...session.messages, message] };
      }),
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
