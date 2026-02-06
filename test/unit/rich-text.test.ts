/**
 * Unit tests for rich-text to Markdown converter.
 *
 * Tests the richTextToMarkdown function with various annotation
 * combinations, links, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { richTextToMarkdown } from "../../src/converter/rich-text.js";
import { mockRichText, type MockRichTextItem } from "../helpers.js";

describe("richTextToMarkdown", () => {
  describe("plain text (no formatting)", () => {
    it("converts plain text without annotations", () => {
      const richText = [mockRichText("Hello, world!")];
      expect(richTextToMarkdown(richText)).toBe("Hello, world!");
    });

    it("preserves whitespace in plain text", () => {
      const richText = [mockRichText("Hello   world")];
      expect(richTextToMarkdown(richText)).toBe("Hello   world");
    });

    it("handles special characters in plain text", () => {
      const richText = [mockRichText("Hello <world> & \"friends\"")];
      expect(richTextToMarkdown(richText)).toBe("Hello <world> & \"friends\"");
    });
  });

  describe("bold text", () => {
    it("wraps bold text with double asterisks", () => {
      const richText = [mockRichText("bold text", { bold: true })];
      expect(richTextToMarkdown(richText)).toBe("**bold text**");
    });

    it("handles bold text with special characters", () => {
      const richText = [mockRichText("bold & special", { bold: true })];
      expect(richTextToMarkdown(richText)).toBe("**bold & special**");
    });
  });

  describe("italic text", () => {
    it("wraps italic text with single asterisks", () => {
      const richText = [mockRichText("italic text", { italic: true })];
      expect(richTextToMarkdown(richText)).toBe("*italic text*");
    });

    it("uses asterisk (not underscore) for italic", () => {
      const richText = [mockRichText("emphasis", { italic: true })];
      const result = richTextToMarkdown(richText);
      expect(result).toBe("*emphasis*");
      expect(result).not.toContain("_");
    });
  });

  describe("strikethrough text", () => {
    it("wraps strikethrough text with double tildes", () => {
      const richText = [mockRichText("deleted", { strikethrough: true })];
      expect(richTextToMarkdown(richText)).toBe("~~deleted~~");
    });
  });

  describe("inline code", () => {
    it("wraps code with backticks", () => {
      const richText = [mockRichText("console.log()", { code: true })];
      expect(richTextToMarkdown(richText)).toBe("`console.log()`");
    });

    it("handles code containing backticks (simple wrapping)", () => {
      // Note: The implementation uses simple backtick wrapping.
      // Complex cases with nested backticks may need manual escaping.
      const richText = [mockRichText("use `code` here", { code: true })];
      expect(richTextToMarkdown(richText)).toBe("`use `code` here`");
    });

    it("handles code with special characters", () => {
      const richText = [mockRichText("<div>", { code: true })];
      expect(richTextToMarkdown(richText)).toBe("`<div>`");
    });
  });

  describe("links", () => {
    it("converts text with link to markdown link format", () => {
      const richText = [mockRichText("click here", {}, "https://example.com")];
      expect(richTextToMarkdown(richText)).toBe(
        "[click here](https://example.com)"
      );
    });

    it("handles links with special characters in URL", () => {
      const richText = [
        mockRichText("search", {}, "https://example.com/search?q=test&page=1"),
      ];
      expect(richTextToMarkdown(richText)).toBe(
        "[search](https://example.com/search?q=test&page=1)"
      );
    });

    it("handles links with special characters in text", () => {
      const richText = [
        mockRichText("Click & learn more", {}, "https://example.com"),
      ];
      expect(richTextToMarkdown(richText)).toBe(
        "[Click & learn more](https://example.com)"
      );
    });
  });

  describe("underline text", () => {
    it("ignores underline annotation (no standard Markdown equivalent)", () => {
      // Per spec: underline is ignored since there's no standard Markdown equivalent
      const richText = [mockRichText("underlined", { underline: true })];
      expect(richTextToMarkdown(richText)).toBe("underlined");
    });

    it("preserves text content when underline is the only annotation", () => {
      const richText = [mockRichText("important", { underline: true })];
      const result = richTextToMarkdown(richText);
      // Should just be plain text - underline is ignored
      expect(result).toBe("important");
      expect(result).not.toContain("<u>");
    });
  });

  describe("nested annotations (combined formatting)", () => {
    it("combines bold and italic (bold + italic = ***text***)", () => {
      const richText = [mockRichText("emphasized", { bold: true, italic: true })];
      expect(richTextToMarkdown(richText)).toBe("***emphasized***");
    });

    it("combines bold and strikethrough", () => {
      const richText = [
        mockRichText("deleted bold", { bold: true, strikethrough: true }),
      ];
      expect(richTextToMarkdown(richText)).toBe("**~~deleted bold~~**");
    });

    it("combines italic and strikethrough", () => {
      const richText = [
        mockRichText("deleted italic", { italic: true, strikethrough: true }),
      ];
      expect(richTextToMarkdown(richText)).toBe("*~~deleted italic~~*");
    });

    it("combines bold, italic, and strikethrough", () => {
      const richText = [
        mockRichText("all three", {
          bold: true,
          italic: true,
          strikethrough: true,
        }),
      ];
      expect(richTextToMarkdown(richText)).toBe("***~~all three~~***");
    });

    it("combines bold with underline (underline ignored)", () => {
      // Underline is ignored per spec, so only bold formatting applies
      const richText = [
        mockRichText("bold underlined", { bold: true, underline: true }),
      ];
      expect(richTextToMarkdown(richText)).toBe("**bold underlined**");
    });

    it("combines italic with underline (underline ignored)", () => {
      // Underline is ignored per spec, so only italic formatting applies
      const richText = [
        mockRichText("italic underlined", { italic: true, underline: true }),
      ];
      expect(richTextToMarkdown(richText)).toBe("*italic underlined*");
    });

    it("combines bold and code", () => {
      const richText = [
        mockRichText("important code", { bold: true, code: true }),
      ];
      expect(richTextToMarkdown(richText)).toBe("**`important code`**");
    });

    it("combines italic and code", () => {
      const richText = [
        mockRichText("emphasized code", { italic: true, code: true }),
      ];
      expect(richTextToMarkdown(richText)).toBe("*`emphasized code`*");
    });

    it("combines bold + link", () => {
      const richText = [
        mockRichText("important link", { bold: true }, "https://example.com"),
      ];
      expect(richTextToMarkdown(richText)).toBe(
        "[**important link**](https://example.com)"
      );
    });

    it("combines italic + link", () => {
      const richText = [
        mockRichText("emphasized link", { italic: true }, "https://example.com"),
      ];
      expect(richTextToMarkdown(richText)).toBe(
        "[*emphasized link*](https://example.com)"
      );
    });

    it("combines bold + italic + link", () => {
      const richText = [
        mockRichText(
          "very important",
          { bold: true, italic: true },
          "https://example.com"
        ),
      ];
      expect(richTextToMarkdown(richText)).toBe(
        "[***very important***](https://example.com)"
      );
    });

    it("combines all supported annotations (bold, italic, strikethrough, code)", () => {
      // Note: underline is ignored per spec
      const richText = [
        mockRichText("everything", {
          bold: true,
          italic: true,
          strikethrough: true,
          underline: true, // This will be ignored
          code: true,
        }),
      ];
      // Order: code -> strikethrough -> bold+italic (combined as ***)
      // Underline is skipped
      expect(richTextToMarkdown(richText)).toBe("***~~`everything`~~***");
    });
  });

  describe("multiple rich text items concatenated", () => {
    it("concatenates multiple plain text items", () => {
      const richText = [
        mockRichText("Hello "),
        mockRichText("world"),
        mockRichText("!"),
      ];
      expect(richTextToMarkdown(richText)).toBe("Hello world!");
    });

    it("concatenates items with different annotations", () => {
      const richText = [
        mockRichText("Normal "),
        mockRichText("bold", { bold: true }),
        mockRichText(" and "),
        mockRichText("italic", { italic: true }),
        mockRichText(" text"),
      ];
      expect(richTextToMarkdown(richText)).toBe(
        "Normal **bold** and *italic* text"
      );
    });

    it("concatenates code and text", () => {
      const richText = [
        mockRichText("Use "),
        mockRichText("npm install", { code: true }),
        mockRichText(" to install"),
      ];
      expect(richTextToMarkdown(richText)).toBe(
        "Use `npm install` to install"
      );
    });

    it("handles multiple links in sequence", () => {
      const richText = [
        mockRichText("Visit "),
        mockRichText("Google", {}, "https://google.com"),
        mockRichText(" or "),
        mockRichText("GitHub", {}, "https://github.com"),
      ];
      expect(richTextToMarkdown(richText)).toBe(
        "Visit [Google](https://google.com) or [GitHub](https://github.com)"
      );
    });

    it("handles mixed formatting in a sentence", () => {
      const richText = [
        mockRichText("This is "),
        mockRichText("very", { bold: true, italic: true }),
        mockRichText(" "),
        mockRichText("important", { underline: true }), // underline ignored
        mockRichText(": "),
        mockRichText("read the docs", {}, "https://docs.example.com"),
        mockRichText("!"),
      ];
      // Note: underline is ignored, so "important" appears as plain text
      expect(richTextToMarkdown(richText)).toBe(
        "This is ***very*** important: [read the docs](https://docs.example.com)!"
      );
    });
  });

  describe("empty array handling", () => {
    it("returns empty string for empty array", () => {
      expect(richTextToMarkdown([])).toBe("");
    });

    it("returns empty string for null-like input", () => {
      // @ts-expect-error Testing null input
      expect(richTextToMarkdown(null)).toBe("");
      // @ts-expect-error Testing undefined input
      expect(richTextToMarkdown(undefined)).toBe("");
    });
  });

  describe("rich text with line breaks", () => {
    it("preserves newlines in text content", () => {
      const richText = [mockRichText("Line 1\nLine 2")];
      expect(richTextToMarkdown(richText)).toBe("Line 1\nLine 2");
    });

    it("preserves multiple newlines", () => {
      const richText = [mockRichText("Paragraph 1\n\nParagraph 2")];
      expect(richTextToMarkdown(richText)).toBe("Paragraph 1\n\nParagraph 2");
    });

    it("handles newlines with formatting", () => {
      const richText = [mockRichText("Bold\ntext", { bold: true })];
      expect(richTextToMarkdown(richText)).toBe("**Bold\ntext**");
    });

    it("handles carriage return + newline (Windows style)", () => {
      const richText = [mockRichText("Line 1\r\nLine 2")];
      expect(richTextToMarkdown(richText)).toBe("Line 1\r\nLine 2");
    });
  });

  describe("edge cases", () => {
    it("handles empty string segments", () => {
      const richText = [
        mockRichText(""),
        mockRichText("visible"),
        mockRichText(""),
      ];
      expect(richTextToMarkdown(richText)).toBe("visible");
    });

    it("handles text with only whitespace", () => {
      const richText = [mockRichText("   ")];
      expect(richTextToMarkdown(richText)).toBe("   ");
    });

    it("handles color annotations (should be ignored)", () => {
      // Color annotations have no Markdown equivalent and should be ignored
      const richText = [mockRichText("colored", { color: "red" })];
      expect(richTextToMarkdown(richText)).toBe("colored");
    });

    it("handles text with markdown special characters", () => {
      // Should preserve markdown special characters in plain text
      // (escaping is handled at the block level, not rich text level)
      const richText = [mockRichText("# Not a heading * or ** or ~~")];
      expect(richTextToMarkdown(richText)).toBe("# Not a heading * or ** or ~~");
    });

    it("handles long text segments", () => {
      const longText = "Lorem ipsum ".repeat(100);
      const richText = [mockRichText(longText)];
      expect(richTextToMarkdown(richText)).toBe(longText);
    });

    it("handles unicode characters", () => {
      const richText = [mockRichText("Hello")];
      expect(richTextToMarkdown(richText)).toBe("Hello");
    });

    it("handles emoji in text", () => {
      const richText = [mockRichText("Hello world")];
      expect(richTextToMarkdown(richText)).toBe("Hello world");
    });

    it("handles text starting/ending with spaces", () => {
      const richText = [mockRichText(" spaced ")];
      expect(richTextToMarkdown(richText)).toBe(" spaced ");
    });
  });

  describe("type safety with SDK types", () => {
    it("accepts properly typed MockRichTextItem array", () => {
      const richText: MockRichTextItem[] = [
        {
          type: "text",
          text: { content: "typed text", link: null },
          plain_text: "typed text",
          href: null,
          annotations: {
            bold: true,
            italic: false,
            strikethrough: false,
            underline: false,
            code: false,
            color: "default",
          },
        },
      ];
      expect(richTextToMarkdown(richText)).toBe("**typed text**");
    });
  });
});
