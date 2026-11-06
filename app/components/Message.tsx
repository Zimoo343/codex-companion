"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../chat-store";

function Sources({ message }: { message: ChatMessage }) {
  if (!message.sources || message.sources.length === 0) return null;

  return (
    <ul className="sources">
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
        <div className="bubble bubble-user">{message.text}</div>
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
          {message.text}
        </ReactMarkdown>
        <Sources message={message} />
        {message.dataVersion && <div className="bubble-foot">manifest {message.dataVersion}</div>}
      </div>
    </div>
  );
}
