"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sanitizeAnswer } from "../../src/lib/answer-text.ts";
import type { ChatMessage } from "../chat-store";
import { copyText } from "../transcript";

function Sources({ message, id }: { message: ChatMessage; id: string }) {
  if (!message.sources || message.sources.length === 0) return null;

  return (
    <ul className="sources" id={id}>
      {message.sources.map((source) => (
        <li key={`${message.id}-${source.index}-${source.url}`}>
          <a href={source.url} target="_blank" rel="noreferrer">
            <span className="source-index">[{source.index}]</span> {source.title}
            {source.section ? ` — ${source.section}` : ""}
          </a>
          <span className="source-origin">{source.sourceName}</span>
        </li>
      ))}
    </ul>
  );
}

export function Message({ message }: { message: ChatMessage }) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const sourcesId = `sources-${message.id}`;
  const sourceCount = message.sources?.length ?? 0;

  if (message.role === "assistant" && message.text.trim() === "" && !message.error) {
    return (
      <div className="message message-assistant">
        <div className="bubble bubble-assistant skeleton" aria-label="Thinking">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="message message-user">
        <div className="bubble bubble-user">
          <span className="bubble-user-text">{message.text}</span>
          <button
            type="button"
            className={`copy-answer copy-prompt${copied ? " copy-answer-done" : ""}`}
            aria-label={copied ? "Prompt copied" : "Copy prompt"}
            title={copied ? "Prompt copied" : "Copy prompt"}
            onClick={async () => {
              const ok = await copyText(message.text.trim());
              if (!ok) return;
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M5 12.5l4.5 4.5L19 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect
                  x="9"
                  y="9"
                  width="10"
                  height="11"
                  rx="1.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M15 9V6.6A1.6 1.6 0 0013.4 5H6.6A1.6 1.6 0 005 6.6v7.8A1.6 1.6 0 006.6 16H9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="message message-assistant">
      <div className={`bubble bubble-assistant${message.error ? " bubble-error" : ""}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {sanitizeAnswer(message.text)}
        </ReactMarkdown>

        <div className="bubble-actions">
          {sourceCount > 0 && (
            <button
              type="button"
              className="refs-toggle"
              aria-expanded={sourcesOpen}
              aria-controls={sourcesId}
              onClick={() => setSourcesOpen((open) => !open)}
            >
              <span
                className={`refs-chevron${sourcesOpen ? " refs-chevron-open" : ""}`}
                aria-hidden="true"
              />
              References
              <span className="refs-count">{sourceCount}</span>
            </button>
          )}

          <button
            type="button"
            className={`copy-answer${copied ? " copy-answer-done" : ""}`}
            aria-label={copied ? "Answer copied" : "Copy answer"}
            title={copied ? "Answer copied" : "Copy answer"}
            onClick={async () => {
              const ok = await copyText(message.text.trim());
              if (!ok) return;
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M5 12.5l4.5 4.5L19 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect
                  x="9"
                  y="9"
                  width="10"
                  height="11"
                  rx="1.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M15 9V6.6A1.6 1.6 0 0013.4 5H6.6A1.6 1.6 0 005 6.6v7.8A1.6 1.6 0 006.6 16H9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>

        {sourcesOpen && <Sources message={message} id={sourcesId} />}

        {message.dataVersion && <div className="bubble-foot">manifest {message.dataVersion}</div>}
      </div>
    </div>
  );
}
