"use client";

import { useEffect, useState } from "react";

type Source = {
  index: number;
  title: string;
  section: string;
  url: string;
  sourceName: string;
};

type AskResponse = {
  answer: string;
  sources: Source[];
  dataVersion: string;
  error?: string;
};

const SAMPLE_QUESTIONS = [
  "how do champions work and which mods stun them",
  "what is the duality dungeon",
  "how does weapon crafting work",
];

export default function Home() {
  const [question, setQuestion] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);

  useEffect(() => {
    setInviteCode(localStorage.getItem("inviteCode") ?? "");
  }, []);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim() || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json", "x-access-code": inviteCode },
        body: JSON.stringify({ question }),
      });
      const body = (await response.json()) as AskResponse;

      if (response.status === 401) {
        setNeedsCode(true);
        setError("Invite code required.");
        return;
      }
      if (!response.ok) {
        setError(body.error ?? "Something went wrong.");
        return;
      }

      setNeedsCode(false);
      localStorage.setItem("inviteCode", inviteCode);
      setResult(body);
    } catch {
      setError("Could not reach the companion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <h1 className="title">Codex Companion</h1>
      <p className="subtitle">
        Ask a Destiny 2 question. Answers come from Bungie's data, community spreadsheets and the
        wiki, and every one of them shows its sources.
      </p>

      <form className="form" onSubmit={ask}>
        <textarea
          className="input"
          rows={3}
          placeholder="what is the duality dungeon"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={500}
        />

        {needsCode && (
          <input
            className="code"
            placeholder="Invite code"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
          />
        )}

        <div className="row">
          <button className="button" type="submit" disabled={loading || !question.trim()}>
            {loading ? "Thinking..." : "Ask"}
          </button>
          <span className="hint">
            {SAMPLE_QUESTIONS.map((sample, index) => (
              <span key={sample}>
                {index > 0 && " · "}
                <a
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setQuestion(sample);
                  }}
                >
                  {sample}
                </a>
              </span>
            ))}
          </span>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <section className="answer">
          <p>{result.answer}</p>
          {result.sources.length > 0 && (
            <ul className="sources">
              {result.sources.map((source) => (
                <li key={`${source.index}-${source.url}`}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    [{source.index}] {source.title}
                    {source.section ? ` — ${source.section}` : ""}
                  </a>{" "}
                  <span>{source.sourceName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <footer className="footer">
        Data: game manifest {result?.dataVersion ?? "…"} ·{" "}
        <a href="https://www.bungie.net" target="_blank" rel="noreferrer">
          Bungie
        </a>{" "}
        ·{" "}
        <a
          href="https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY"
          target="_blank"
          rel="noreferrer"
        >
          AegisRelic
        </a>{" "}
        · Destiny Data Compendium ·{" "}
        <a href="https://www.destinypedia.com" target="_blank" rel="noreferrer">
          Destinypedia
        </a>{" "}
        (CC BY-SA 4.0)
      </footer>
    </main>
  );
}
