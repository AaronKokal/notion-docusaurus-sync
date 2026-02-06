/**
 * Unit tests for mdast-to-Notion rich_text converter.
 *
 * Tests the phrasesToRichText function per User Story 3 acceptance scenarios:
 * 1. Plain text → output is `[{ text: { content: "..." }, annotations: {} }]`
 * 2. Bold text (`**text**`) → annotations include `bold: true`
 * 3. Italic text (`*text*`) → annotations include `italic: true`
 * 4. Inline code (`` `text` ``) → annotations include `code: true`
 * 5. Strikethrough (`~~text~~`) → annotations include `strikethrough: true`
 * 6. Link (`[text](url)`) → output has `text.link.url` set
 * 7. Combined annotations (bold + italic + link) → all annotations applied correctly
 * 8. Multiple text segments with different formatting → array of rich_text objects
 */

import { describe, it, expect } from "vitest";
import { phrasesToRichText } from "../../src/converter/md-to-rich-text.js";
import type {
  PhrasingContent,
  Text,
  Strong,
  Emphasis,
  InlineCode,
  Delete,
  Link,
} from "mdast";

/**
 * Helper to create a Text node.
 */
function text(value: string): Text {
  return { type: "text", value };
}

/**
 * Helper to create a Strong (bold) node.
 */
function strong(...children: PhrasingContent[]): Strong {
  return { type: "strong", children };
}

/**
 * Helper to create an Emphasis (italic) node.
 */
function emphasis(...children: PhrasingContent[]): Emphasis {
  return { type: "emphasis", children };
}

/**
 * Helper to create an InlineCode node.
 */
function inlineCode(value: string): InlineCode {
  return { type: "inlineCode", value };
}

/**
 * Helper to create a Delete (strikethrough) node.
 */
function del(...children: PhrasingContent[]): Delete {
  return { type: "delete", children };
}

/**
 * Helper to create a Link node.
 */
function link(url: string, ...children: PhrasingContent[]): Link {
  return { type: "link", url, children };
}

describe("md-to-rich-text", () => {
  describe("phrasesToRichText", () => {
    describe("Acceptance Scenario 1: Plain text", () => {
      it("converts plain text to rich_text with empty annotations", () => {
        const nodes: PhrasingContent[] = [text("Hello, world!")];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: "text",
          text: { content: "Hello, world!" },
          annotations: {},
        });
      });

      it("preserves whitespace in plain text", () => {
        const nodes: PhrasingContent[] = [text("Hello   world")];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].text.content).toBe("Hello   world");
      });

      it("handles special characters in plain text", () => {
        const nodes: PhrasingContent[] = [text('Hello <world> & "friends"')];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe('Hello <world> & "friends"');
      });

      it("handles unicode and emoji", () => {
        const nodes: PhrasingContent[] = [text("Hello world!")];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe("Hello world!");
      });
    });

    describe("Acceptance Scenario 2: Bold text", () => {
      it("converts bold text with bold: true annotation", () => {
        const nodes: PhrasingContent[] = [strong(text("bold text"))];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: "text",
          text: { content: "bold text" },
          annotations: { bold: true },
        });
      });

      it("handles multiple words in bold", () => {
        const nodes: PhrasingContent[] = [strong(text("multiple bold words"))];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe("multiple bold words");
        expect(result[0].annotations.bold).toBe(true);
      });
    });

    describe("Acceptance Scenario 3: Italic text", () => {
      it("converts italic text with italic: true annotation", () => {
        const nodes: PhrasingContent[] = [emphasis(text("italic text"))];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: "text",
          text: { content: "italic text" },
          annotations: { italic: true },
        });
      });

      it("handles multiple words in italic", () => {
        const nodes: PhrasingContent[] = [
          emphasis(text("multiple italic words")),
        ];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe("multiple italic words");
        expect(result[0].annotations.italic).toBe(true);
      });
    });

    describe("Acceptance Scenario 4: Inline code", () => {
      it("converts inline code with code: true annotation", () => {
        const nodes: PhrasingContent[] = [inlineCode("console.log()")];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: "text",
          text: { content: "console.log()" },
          annotations: { code: true },
        });
      });

      it("handles code with special characters", () => {
        const nodes: PhrasingContent[] = [inlineCode("<div>")];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe("<div>");
        expect(result[0].annotations.code).toBe(true);
      });

      it("handles code with backticks in content", () => {
        const nodes: PhrasingContent[] = [inlineCode("use `code` here")];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe("use `code` here");
        expect(result[0].annotations.code).toBe(true);
      });
    });

    describe("Acceptance Scenario 5: Strikethrough text", () => {
      it("converts strikethrough text with strikethrough: true annotation", () => {
        const nodes: PhrasingContent[] = [del(text("deleted text"))];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: "text",
          text: { content: "deleted text" },
          annotations: { strikethrough: true },
        });
      });

      it("handles multiple words in strikethrough", () => {
        const nodes: PhrasingContent[] = [del(text("multiple deleted words"))];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe("multiple deleted words");
        expect(result[0].annotations.strikethrough).toBe(true);
      });
    });

    describe("Acceptance Scenario 6: Links", () => {
      it("converts link with text.link.url set", () => {
        const nodes: PhrasingContent[] = [
          link("https://example.com", text("click here")),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          type: "text",
          text: {
            content: "click here",
            link: { url: "https://example.com" },
          },
          annotations: {},
        });
      });

      it("handles links with special characters in URL", () => {
        const nodes: PhrasingContent[] = [
          link("https://example.com/search?q=test&page=1", text("search")),
        ];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.link?.url).toBe(
          "https://example.com/search?q=test&page=1"
        );
      });

      it("handles links with special characters in text", () => {
        const nodes: PhrasingContent[] = [
          link("https://example.com", text("Click & learn more")),
        ];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe("Click & learn more");
        expect(result[0].text.link?.url).toBe("https://example.com");
      });

      it("handles relative URLs", () => {
        const nodes: PhrasingContent[] = [
          link("/docs/getting-started", text("docs")),
        ];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.link?.url).toBe("/docs/getting-started");
      });
    });

    describe("Acceptance Scenario 7: Combined annotations", () => {
      it("combines bold and italic", () => {
        // ***text*** parses as Strong containing Emphasis (or vice versa)
        const nodes: PhrasingContent[] = [
          strong(emphasis(text("bold and italic"))),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].annotations).toEqual({
          bold: true,
          italic: true,
        });
        expect(result[0].text.content).toBe("bold and italic");
      });

      it("combines italic and bold (nested in opposite order)", () => {
        const nodes: PhrasingContent[] = [
          emphasis(strong(text("italic and bold"))),
        ];
        const result = phrasesToRichText(nodes);

        expect(result[0].annotations).toEqual({
          bold: true,
          italic: true,
        });
      });

      it("combines bold and link", () => {
        const nodes: PhrasingContent[] = [
          link("https://example.com", strong(text("important link"))),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].annotations).toEqual({ bold: true });
        expect(result[0].text.link?.url).toBe("https://example.com");
        expect(result[0].text.content).toBe("important link");
      });

      it("combines italic and link", () => {
        const nodes: PhrasingContent[] = [
          link("https://example.com", emphasis(text("emphasized link"))),
        ];
        const result = phrasesToRichText(nodes);

        expect(result[0].annotations).toEqual({ italic: true });
        expect(result[0].text.link?.url).toBe("https://example.com");
      });

      it("combines bold, italic, and link", () => {
        const nodes: PhrasingContent[] = [
          link("https://example.com", strong(emphasis(text("very important")))),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].annotations).toEqual({ bold: true, italic: true });
        expect(result[0].text.link?.url).toBe("https://example.com");
        expect(result[0].text.content).toBe("very important");
      });

      it("combines bold and strikethrough", () => {
        const nodes: PhrasingContent[] = [strong(del(text("deleted bold")))];
        const result = phrasesToRichText(nodes);

        expect(result[0].annotations).toEqual({
          bold: true,
          strikethrough: true,
        });
      });

      it("combines italic and strikethrough", () => {
        const nodes: PhrasingContent[] = [emphasis(del(text("deleted italic")))];
        const result = phrasesToRichText(nodes);

        expect(result[0].annotations).toEqual({
          italic: true,
          strikethrough: true,
        });
      });

      it("combines bold, italic, and strikethrough", () => {
        const nodes: PhrasingContent[] = [
          strong(emphasis(del(text("all three")))),
        ];
        const result = phrasesToRichText(nodes);

        expect(result[0].annotations).toEqual({
          bold: true,
          italic: true,
          strikethrough: true,
        });
      });

      it("combines strikethrough and link", () => {
        const nodes: PhrasingContent[] = [
          link("https://example.com", del(text("deleted link"))),
        ];
        const result = phrasesToRichText(nodes);

        expect(result[0].annotations).toEqual({ strikethrough: true });
        expect(result[0].text.link?.url).toBe("https://example.com");
      });
    });

    describe("Acceptance Scenario 8: Multiple segments", () => {
      it("handles multiple plain text segments", () => {
        const nodes: PhrasingContent[] = [
          text("Hello "),
          text("world"),
          text("!"),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(3);
        expect(result[0].text.content).toBe("Hello ");
        expect(result[1].text.content).toBe("world");
        expect(result[2].text.content).toBe("!");
      });

      it("handles segments with different annotations", () => {
        const nodes: PhrasingContent[] = [
          text("Normal "),
          strong(text("bold")),
          text(" and "),
          emphasis(text("italic")),
          text(" text"),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(5);
        expect(result[0].text.content).toBe("Normal ");
        expect(result[0].annotations).toEqual({});

        expect(result[1].text.content).toBe("bold");
        expect(result[1].annotations).toEqual({ bold: true });

        expect(result[2].text.content).toBe(" and ");
        expect(result[2].annotations).toEqual({});

        expect(result[3].text.content).toBe("italic");
        expect(result[3].annotations).toEqual({ italic: true });

        expect(result[4].text.content).toBe(" text");
        expect(result[4].annotations).toEqual({});
      });

      it("handles code and text mixed", () => {
        const nodes: PhrasingContent[] = [
          text("Use "),
          inlineCode("npm install"),
          text(" to install"),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(3);
        expect(result[0].text.content).toBe("Use ");
        expect(result[1].text.content).toBe("npm install");
        expect(result[1].annotations).toEqual({ code: true });
        expect(result[2].text.content).toBe(" to install");
      });

      it("handles multiple links in sequence", () => {
        const nodes: PhrasingContent[] = [
          text("Visit "),
          link("https://google.com", text("Google")),
          text(" or "),
          link("https://github.com", text("GitHub")),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(4);
        expect(result[1].text.link?.url).toBe("https://google.com");
        expect(result[3].text.link?.url).toBe("https://github.com");
      });

      it("handles mixed formatting in a sentence", () => {
        const nodes: PhrasingContent[] = [
          text("This is "),
          strong(emphasis(text("very"))),
          text(" "),
          text("important"),
          text(": "),
          link("https://docs.example.com", text("read the docs")),
          text("!"),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(7);
        expect(result[0].text.content).toBe("This is ");
        expect(result[1].text.content).toBe("very");
        expect(result[1].annotations).toEqual({ bold: true, italic: true });
        expect(result[5].text.link?.url).toBe("https://docs.example.com");
      });

      it("handles strong node with multiple text children", () => {
        // Strong node containing multiple text nodes (rare but possible)
        const strongNode: Strong = {
          type: "strong",
          children: [text("first "), text("second")],
        };
        const nodes: PhrasingContent[] = [strongNode];
        const result = phrasesToRichText(nodes);

        // Should produce two rich_text items, both with bold
        expect(result).toHaveLength(2);
        expect(result[0].text.content).toBe("first ");
        expect(result[0].annotations).toEqual({ bold: true });
        expect(result[1].text.content).toBe("second");
        expect(result[1].annotations).toEqual({ bold: true });
      });
    });

    describe("Edge cases", () => {
      it("returns empty array for empty input", () => {
        const result = phrasesToRichText([]);
        expect(result).toEqual([]);
      });

      it("returns empty array for null input", () => {
        // @ts-expect-error Testing null input
        const result = phrasesToRichText(null);
        expect(result).toEqual([]);
      });

      it("returns empty array for undefined input", () => {
        // @ts-expect-error Testing undefined input
        const result = phrasesToRichText(undefined);
        expect(result).toEqual([]);
      });

      it("handles empty text node", () => {
        const nodes: PhrasingContent[] = [text("")];
        const result = phrasesToRichText(nodes);

        // Empty text should still produce a rich_text item
        expect(result).toHaveLength(1);
        expect(result[0].text.content).toBe("");
      });

      it("handles whitespace-only text", () => {
        const nodes: PhrasingContent[] = [text("   ")];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe("   ");
      });

      it("handles newlines in text", () => {
        const nodes: PhrasingContent[] = [text("Line 1\nLine 2")];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe("Line 1\nLine 2");
      });

      it("handles empty strong node", () => {
        const nodes: PhrasingContent[] = [strong()];
        const result = phrasesToRichText(nodes);

        // Empty strong should produce no output
        expect(result).toEqual([]);
      });

      it("handles deeply nested formatting", () => {
        // strong > emphasis > delete > text
        const nodes: PhrasingContent[] = [
          strong(emphasis(del(text("deeply nested")))),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].annotations).toEqual({
          bold: true,
          italic: true,
          strikethrough: true,
        });
      });

      it("handles link containing formatted text", () => {
        // Link with bold and italic text inside
        const nodes: PhrasingContent[] = [
          link(
            "https://example.com",
            text("normal "),
            strong(text("bold")),
            text(" text")
          ),
        ];
        const result = phrasesToRichText(nodes);

        expect(result).toHaveLength(3);
        expect(result[0].text.link?.url).toBe("https://example.com");
        expect(result[0].annotations).toEqual({});

        expect(result[1].text.link?.url).toBe("https://example.com");
        expect(result[1].annotations).toEqual({ bold: true });

        expect(result[2].text.link?.url).toBe("https://example.com");
        expect(result[2].annotations).toEqual({});
      });

      it("handles long text content", () => {
        const longText = "Lorem ipsum ".repeat(100);
        const nodes: PhrasingContent[] = [text(longText)];
        const result = phrasesToRichText(nodes);

        expect(result[0].text.content).toBe(longText);
      });
    });
  });
});
