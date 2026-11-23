import type { ChatMessage, ChatSession } from "./chat-store";

// Testing aid: turn a conversation into Markdown that can be pasted into an issue or
// a chat with the maintainer. Deliberately plain, so it survives any editor.

function references(message: ChatMessage): string {
  if (!message.sources || message.sources.length === 0) return "";
  const lines = message.sources.map(
    (source) =>
      `- [${source.index}] ${source.title}${source.section ? ` — ${source.section}` : ""} (${source.sourceName}) ${source.url}`,
  );
  return `\n\n${lines.join("\n")}`;
}

function answerBlock(message: ChatMessage): string {
  const version = message.dataVersion ? `\n\n_manifest ${message.dataVersion}_` : "";
  return `**A:** ${message.text.trim()}${references(message)}${version}`;
}

export function sessionToMarkdown(session: ChatSession): string {
  const header = [`# ${session.title}`, "", `_copied ${new Date().toISOString()}_`, ""].join("\n");

  const blocks: string[] = [];
  let current = "";

  for (const message of session.messages) {
    if (message.role === "user") {
      if (current) blocks.push(current);
      current = `**P:** ${message.text.trim()}`;
      continue;
    }
    current += `\n\n${answerBlock(message)}`;
  }
  if (current) blocks.push(current);

  return `${header}\n${blocks.join("\n\n---\n\n")}\n`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; localhost is one, but be safe.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  }
}
