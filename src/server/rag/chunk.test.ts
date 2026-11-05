import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChunks, chunkText, decodeEntities, splitIntoSections } from "./chunk.ts";

test("decodes common html entities", () => {
  assert.equal(decodeEntities("Bait &amp; Switch &lt;3"), "Bait & Switch <3");
});

test("splits into sections on headings", () => {
  const html =
    "<h2>Sandbox</h2><p>Grenade launchers changed.</p><h2>Armor</h2><p>Resilience tuned.</p>";
  assert.deepEqual(splitIntoSections(html), [
    { heading: "Sandbox", text: "Grenade launchers changed." },
    { heading: "Armor", text: "Resilience tuned." },
  ]);
});

test("keeps text before the first heading", () => {
  const sections = splitIntoSections("<p>Intro line.</p><h2>Body</h2><p>Detail.</p>");
  assert.equal(sections[0]?.heading, "");
  assert.equal(sections[0]?.text, "Intro line.");
});

test("drops script and style content", () => {
  const sections = splitIntoSections("<style>.a{}</style><script>var x=1</script><p>Real text</p>");
  assert.equal(sections[0]?.text, "Real text");
});

test("turns list items into lines", () => {
  const sections = splitIntoSections("<ul><li>First</li><li>Second</li></ul>");
  assert.match(sections[0]?.text ?? "", /- First/);
  assert.match(sections[0]?.text ?? "", /- Second/);
});

test("does not chunk short text", () => {
  assert.deepEqual(chunkText("one two three", { maxWords: 10, overlapWords: 2 }), [
    "one two three",
  ]);
});

test("chunks long text with overlap", () => {
  const text = Array.from({ length: 25 }, (_, index) => `w${index}`).join(" ");
  const chunks = chunkText(text, { maxWords: 10, overlapWords: 3 });

  assert.equal(chunks.length, 4);
  assert.equal(chunks[0]?.split(" ").length, 10);
  assert.equal(chunks[0]?.split(" ").at(-1), chunks[1]?.split(" ")[2]);
  assert.equal(chunks.at(-1)?.split(" ").at(-1), "w24");
});

test("rejects impossible chunk settings", () => {
  assert.throws(() => chunkText("a b c", { maxWords: 5, overlapWords: 5 }), /overlapWords/);
});

test("builds chunks carrying title and section", () => {
  const html =
    "<h2>Sandbox</h2><p>" + Array.from({ length: 12 }, (_, i) => `word${i}`).join(" ") + "</p>";
  const chunks = buildChunks("Update 9.7.0.6", html, { maxWords: 5, overlapWords: 1 });

  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0]?.title, "Update 9.7.0.6");
  assert.equal(chunks[0]?.section, "Sandbox");
});
