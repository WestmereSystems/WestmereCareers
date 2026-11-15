import { Fragment } from "react";
// A deliberately small format: React escapes every text node; HTML, URLs and images are never interpreted.
function inline(text: string) {
  return text
    .split(/(\*\*[^*\n]{1,500}\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}
export function RichText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/),
    blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  function flush() {
    if (bullets.length) {
      blocks.push(
        <ul key={`list-${blocks.length}`}>
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  }
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.+)/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,3}\s+(.+)/);
    blocks.push(
      heading ? (
        <h3 key={blocks.length}>{inline(heading[1])}</h3>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return <div className="rich-text">{blocks}</div>;
}
