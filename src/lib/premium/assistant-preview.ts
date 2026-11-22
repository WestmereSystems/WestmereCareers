export type AssistantPreview = {
  summary?: string;
  reviewPending?: boolean;
  improvements?: string[];
  revisedCv?: string;
  coverLetter?: string;
};

// Read only top-level display fields from an incomplete structured response.
// Escapes and truncated Unicode sequences are held back until they are complete.
export function assistantPreview(source: string): AssistantPreview {
  function stringAt(start: number) {
    let raw = '"';
    for (let i = start + 1; i < source.length; i++) {
      const char = source[i];
      if (char === '"')
        return {
          text: JSON.parse(raw + '"') as string,
          end: i + 1,
          done: true,
        };
      if (char === "\\") {
        const length = source[i + 1] === "u" ? 6 : 2;
        if (i + length > source.length) break;
        raw += source.slice(i, i + length);
        i += length - 1;
      } else raw += char;
    }
    return {
      text: JSON.parse(raw + '"') as string,
      end: source.length,
      done: false,
    };
  }
  const result: AssistantPreview = {};
  let depth = 0;
  try {
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") depth--;
      else if (char === '"') {
        const key = stringAt(i);
        i = key.end - 1;
        if (depth !== 1 || !key.done) continue;
        let valueStart = key.end;
        while (/\s/.test(source[valueStart] || "x")) valueStart++;
        if (source[valueStart++] !== ":") continue;
        while (/\s/.test(source[valueStart] || "x")) valueStart++;
        if (key.text === "review" && source[valueStart] === "{")
          result.reviewPending = true;
        if (
          ["summary", "revisedCv", "coverLetter"].includes(key.text) &&
          source[valueStart] === '"'
        ) {
          const value = stringAt(valueStart);
          result[key.text as "summary" | "revisedCv" | "coverLetter"] =
            value.text;
          i = value.end - 1;
        } else if (key.text === "improvements" && source[valueStart] === "[") {
          const items: string[] = [];
          let cursor = valueStart + 1;
          while (cursor < source.length) {
            while (/[\s,]/.test(source[cursor] || "x")) cursor++;
            if (source[cursor] !== '"') break;
            const value = stringAt(cursor);
            items.push(value.text);
            cursor = value.end;
            if (!value.done) break;
          }
          result.improvements = items;
        }
      }
    }
  } catch {
    // The final response is validated separately; never display raw JSON.
  }
  return result;
}
