/**
 * Unit tests for mdast-to-Notion block converter.
 *
 * Tests the mdastToNotionBlocks function per User Story 2 acceptance scenarios:
 * 1. Paragraph AST node → Notion paragraph block with rich_text array
 * 2. Heading AST nodes (depth 1-3) → Notion heading_1/heading_2/heading_3 blocks
 * 3. Code AST node → Notion code block with language and rich_text content
 * 4. List AST nodes (ordered/unordered) → Notion bulleted_list_item/numbered_list_item blocks
 * 5. Nested list items → Notion list items with children (nested blocks)
 * 6. Blockquote AST node → Notion quote block
 * 7. Table AST node → Notion table block with table_row children
 * 8. Docusaurus admonition directive → Notion callout block with appropriate icon
 * 9. <details><summary> HTML block → Notion toggle block
 * 10. Image AST node → Notion image block with external URL
 * 11. Thematic break AST node → Notion divider block
 * 12. Task list item (`- [x] done`) → Notion to_do block with checked=true
 * 13. Unsupported AST node type → warning logged and node skipped gracefully
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mdastToNotionBlocks } from "../../src/converter/md-to-blocks.js";
import type {
  Content,
  Paragraph,
  Heading,
  Code,
  List,
  ListItem,
  Blockquote,
  Table,
  TableRow,
  TableCell,
  ThematicBreak,
  Image,
  Html,
  Text,
  Strong,
  Emphasis,
  InlineCode,
  Delete,
  Link,
  PhrasingContent,
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

/**
 * Helper to create a Paragraph node.
 */
function paragraph(...children: PhrasingContent[]): Paragraph {
  return { type: "paragraph", children };
}

/**
 * Helper to create a Heading node.
 */
function heading(depth: 1 | 2 | 3 | 4 | 5 | 6, ...children: PhrasingContent[]): Heading {
  return { type: "heading", depth, children };
}

/**
 * Helper to create a Code node.
 */
function code(value: string, lang?: string | null, meta?: string | null): Code {
  return { type: "code", value, lang: lang ?? null, meta: meta ?? null };
}

/**
 * Helper to create a List node.
 */
function list(ordered: boolean, ...children: ListItem[]): List {
  return { type: "list", ordered, spread: false, children };
}

/**
 * Helper to create a ListItem node.
 */
function listItem(checked: boolean | null, ...children: Content[]): ListItem {
  return { type: "listItem", spread: false, checked, children };
}

/**
 * Helper to create a Blockquote node.
 */
function blockquote(...children: Content[]): Blockquote {
  return { type: "blockquote", children };
}

/**
 * Helper to create a Table node.
 */
function table(align: ("left" | "right" | "center" | null)[] | null, ...children: TableRow[]): Table {
  return { type: "table", align, children };
}

/**
 * Helper to create a TableRow node.
 */
function tableRow(...children: TableCell[]): TableRow {
  return { type: "tableRow", children };
}

/**
 * Helper to create a TableCell node.
 */
function tableCell(...children: PhrasingContent[]): TableCell {
  return { type: "tableCell", children };
}

/**
 * Helper to create a ThematicBreak node.
 */
function thematicBreak(): ThematicBreak {
  return { type: "thematicBreak" };
}

/**
 * Helper to create an Image node.
 */
function image(url: string, alt?: string | null, title?: string | null): Image {
  return { type: "image", url, alt: alt ?? undefined, title: title ?? undefined };
}

/**
 * Helper to create an Html node.
 */
function html(value: string): Html {
  return { type: "html", value };
}

/**
 * Helper to create a container directive node (Docusaurus admonition).
 */
function containerDirective(name: string, ...children: Content[]): Content {
  return {
    type: "containerDirective" as Content["type"],
    name,
    children,
  } as unknown as Content;
}

/**
 * Helper to create a leaf directive node.
 */
function leafDirective(name: string): Content {
  return {
    type: "leafDirective" as Content["type"],
    name,
    children: [],
  } as unknown as Content;
}

describe("md-to-blocks", () => {
  describe("mdastToNotionBlocks", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    describe("Acceptance Scenario 1: Paragraph", () => {
      it("converts paragraph with plain text to Notion paragraph block", () => {
        const nodes: Content[] = [paragraph(text("Hello, world!"))];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("paragraph");
        expect(result[0].paragraph.rich_text).toHaveLength(1);
        expect(result[0].paragraph.rich_text[0].text.content).toBe("Hello, world!");
      });

      it("converts paragraph with formatted text to rich_text array with annotations", () => {
        const nodes: Content[] = [
          paragraph(
            text("Normal "),
            strong(text("bold")),
            text(" and "),
            emphasis(text("italic")),
            text(" text"),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("paragraph");

        const richText = result[0].paragraph.rich_text;
        expect(richText).toHaveLength(5);
        expect(richText[0].text.content).toBe("Normal ");
        expect(richText[1].text.content).toBe("bold");
        expect(richText[1].annotations.bold).toBe(true);
        expect(richText[3].text.content).toBe("italic");
        expect(richText[3].annotations.italic).toBe(true);
      });

      it("converts paragraph with inline code and link", () => {
        const nodes: Content[] = [
          paragraph(
            text("Use "),
            inlineCode("npm install"),
            text(" or visit "),
            link("https://example.com", text("the docs")),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        const richText = result[0].paragraph.rich_text;
        expect(richText[1].annotations.code).toBe(true);
        expect(richText[1].text.content).toBe("npm install");
        expect(richText[3].text.link?.url).toBe("https://example.com");
      });

      it("converts paragraph with strikethrough", () => {
        const nodes: Content[] = [
          paragraph(text("This is "), del(text("deleted")), text(" text")),
        ];
        const result = mdastToNotionBlocks(nodes);

        const richText = result[0].paragraph.rich_text;
        expect(richText[1].annotations.strikethrough).toBe(true);
      });

      it("converts paragraph with combined annotations", () => {
        const nodes: Content[] = [
          paragraph(strong(emphasis(text("bold and italic")))),
        ];
        const result = mdastToNotionBlocks(nodes);

        const richText = result[0].paragraph.rich_text;
        expect(richText[0].annotations.bold).toBe(true);
        expect(richText[0].annotations.italic).toBe(true);
      });
    });

    describe("Acceptance Scenario 2: Headings", () => {
      it("converts h1 heading to heading_1 block", () => {
        const nodes: Content[] = [heading(1, text("Main Title"))];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("heading_1");
        expect(result[0].heading_1.rich_text[0].text.content).toBe("Main Title");
      });

      it("converts h2 heading to heading_2 block", () => {
        const nodes: Content[] = [heading(2, text("Section Title"))];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].type).toBe("heading_2");
        expect(result[0].heading_2.rich_text[0].text.content).toBe("Section Title");
      });

      it("converts h3 heading to heading_3 block", () => {
        const nodes: Content[] = [heading(3, text("Subsection"))];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].type).toBe("heading_3");
        expect(result[0].heading_3.rich_text[0].text.content).toBe("Subsection");
      });

      it("converts h4+ headings to heading_3 (Notion max depth)", () => {
        const h4: Content[] = [heading(4, text("Level 4"))];
        const h5: Content[] = [heading(5, text("Level 5"))];
        const h6: Content[] = [heading(6, text("Level 6"))];

        expect(mdastToNotionBlocks(h4)[0].type).toBe("heading_3");
        expect(mdastToNotionBlocks(h5)[0].type).toBe("heading_3");
        expect(mdastToNotionBlocks(h6)[0].type).toBe("heading_3");
      });

      it("preserves formatting in heading text", () => {
        const nodes: Content[] = [
          heading(1, text("Title with "), strong(text("bold")), text(" text")),
        ];
        const result = mdastToNotionBlocks(nodes);

        const richText = result[0].heading_1.rich_text;
        expect(richText).toHaveLength(3);
        expect(richText[1].annotations.bold).toBe(true);
      });
    });

    describe("Acceptance Scenario 3: Code blocks", () => {
      it("converts code block with language to Notion code block", () => {
        const nodes: Content[] = [code("console.log('hello');", "javascript")];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("code");
        expect(result[0].code.language).toBe("javascript");
        expect(result[0].code.rich_text[0].text.content).toBe("console.log('hello');");
      });

      it("converts code block without language to plain text", () => {
        const nodes: Content[] = [code("some code")];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].code.language).toBe("plain text");
      });

      it("converts code block with empty string language to plain text", () => {
        const nodes: Content[] = [code("some code", "")];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].code.language).toBe("plain text");
      });

      it("preserves multi-line code content", () => {
        const multiLineCode = `function hello() {
  console.log("Hello");
  return true;
}`;
        const nodes: Content[] = [code(multiLineCode, "javascript")];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].code.rich_text[0].text.content).toBe(multiLineCode);
      });

      it("handles various programming languages", () => {
        const languages = ["typescript", "python", "rust", "go", "java", "bash", "sql"];
        for (const lang of languages) {
          const nodes: Content[] = [code("code here", lang)];
          const result = mdastToNotionBlocks(nodes);
          expect(result[0].code.language).toBe(lang);
        }
      });
    });

    describe("Acceptance Scenario 4: Lists (ordered/unordered)", () => {
      it("converts unordered list to bulleted_list_item blocks", () => {
        const nodes: Content[] = [
          list(
            false,
            listItem(null, paragraph(text("Item one"))),
            listItem(null, paragraph(text("Item two"))),
            listItem(null, paragraph(text("Item three"))),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(3);
        expect(result[0].type).toBe("bulleted_list_item");
        expect(result[1].type).toBe("bulleted_list_item");
        expect(result[2].type).toBe("bulleted_list_item");
        expect(result[0].bulleted_list_item.rich_text[0].text.content).toBe("Item one");
      });

      it("converts ordered list to numbered_list_item blocks", () => {
        const nodes: Content[] = [
          list(
            true,
            listItem(null, paragraph(text("First"))),
            listItem(null, paragraph(text("Second"))),
            listItem(null, paragraph(text("Third"))),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(3);
        expect(result[0].type).toBe("numbered_list_item");
        expect(result[1].type).toBe("numbered_list_item");
        expect(result[2].type).toBe("numbered_list_item");
        expect(result[0].numbered_list_item.rich_text[0].text.content).toBe("First");
      });

      it("converts list items with formatting", () => {
        const nodes: Content[] = [
          list(
            false,
            listItem(null, paragraph(text("Item with "), strong(text("bold")))),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        const richText = result[0].bulleted_list_item.rich_text;
        expect(richText[1].annotations.bold).toBe(true);
      });
    });

    describe("Acceptance Scenario 5: Nested lists", () => {
      it("converts nested unordered list to blocks with children", () => {
        const nodes: Content[] = [
          list(
            false,
            listItem(
              null,
              paragraph(text("Parent")),
              list(
                false,
                listItem(null, paragraph(text("Child 1"))),
                listItem(null, paragraph(text("Child 2"))),
              ),
            ),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("bulleted_list_item");
        expect(result[0].bulleted_list_item.rich_text[0].text.content).toBe("Parent");

        const children = result[0].bulleted_list_item.children;
        expect(children).toHaveLength(2);
        expect(children[0].type).toBe("bulleted_list_item");
        expect(children[0].bulleted_list_item.rich_text[0].text.content).toBe("Child 1");
      });

      it("converts mixed nested lists (numbered inside bulleted)", () => {
        const nodes: Content[] = [
          list(
            false,
            listItem(
              null,
              paragraph(text("Bullet")),
              list(
                true,
                listItem(null, paragraph(text("Numbered 1"))),
                listItem(null, paragraph(text("Numbered 2"))),
              ),
            ),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].type).toBe("bulleted_list_item");
        const children = result[0].bulleted_list_item.children;
        expect(children[0].type).toBe("numbered_list_item");
        expect(children[1].type).toBe("numbered_list_item");
      });

      it("converts deeply nested lists", () => {
        const nodes: Content[] = [
          list(
            false,
            listItem(
              null,
              paragraph(text("Level 1")),
              list(
                false,
                listItem(
                  null,
                  paragraph(text("Level 2")),
                  list(
                    false,
                    listItem(null, paragraph(text("Level 3"))),
                  ),
                ),
              ),
            ),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].bulleted_list_item.rich_text[0].text.content).toBe("Level 1");
        const level2 = result[0].bulleted_list_item.children[0];
        expect(level2.bulleted_list_item.rich_text[0].text.content).toBe("Level 2");
        const level3 = level2.bulleted_list_item.children[0];
        expect(level3.bulleted_list_item.rich_text[0].text.content).toBe("Level 3");
      });
    });

    describe("Acceptance Scenario 6: Blockquotes", () => {
      it("converts simple blockquote to Notion quote block", () => {
        const nodes: Content[] = [
          blockquote(paragraph(text("This is a quote"))),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("quote");
        expect(result[0].quote.rich_text[0].text.content).toBe("This is a quote");
      });

      it("converts multi-paragraph blockquote with line breaks", () => {
        const nodes: Content[] = [
          blockquote(
            paragraph(text("Line one")),
            paragraph(text("Line two")),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        const richText = result[0].quote.rich_text;
        // Should have: "Line one" + "\n" + "Line two"
        expect(richText).toHaveLength(3);
        expect(richText[0].text.content).toBe("Line one");
        expect(richText[1].text.content).toBe("\n");
        expect(richText[2].text.content).toBe("Line two");
      });

      it("converts blockquote with formatting", () => {
        const nodes: Content[] = [
          blockquote(
            paragraph(text("Quote with "), strong(text("bold")), text(" text")),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        const richText = result[0].quote.rich_text;
        expect(richText[1].annotations.bold).toBe(true);
      });

      it("converts blockquote with nested content as children", () => {
        const nodes: Content[] = [
          blockquote(
            paragraph(text("Quote text")),
            list(
              false,
              listItem(null, paragraph(text("List item in quote"))),
            ),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].quote.children).toBeDefined();
        expect(result[0].quote.children[0].type).toBe("bulleted_list_item");
      });
    });

    describe("Acceptance Scenario 7: Tables", () => {
      it("converts simple table to Notion table block", () => {
        const nodes: Content[] = [
          table(
            ["left", "left"],
            tableRow(tableCell(text("Header 1")), tableCell(text("Header 2"))),
            tableRow(tableCell(text("Cell 1")), tableCell(text("Cell 2"))),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("table");
        expect(result[0].table.table_width).toBe(2);
        expect(result[0].table.has_column_header).toBe(true);
        expect(result[0].table.has_row_header).toBe(false);
      });

      it("converts table with table_row children", () => {
        const nodes: Content[] = [
          table(
            null,
            tableRow(tableCell(text("A")), tableCell(text("B"))),
            tableRow(tableCell(text("1")), tableCell(text("2"))),
            tableRow(tableCell(text("3")), tableCell(text("4"))),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        const tableBlock = result[0];
        expect(tableBlock.table.children).toHaveLength(3);
        expect(tableBlock.table.children[0].type).toBe("table_row");
        expect(tableBlock.table.children[1].type).toBe("table_row");
      });

      it("converts table cells to rich_text arrays", () => {
        const nodes: Content[] = [
          table(
            null,
            tableRow(
              tableCell(text("Plain")),
              tableCell(strong(text("Bold"))),
            ),
            tableRow(
              tableCell(inlineCode("code")),
              tableCell(link("https://example.com", text("Link"))),
            ),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        const rows = result[0].table.children;
        // Header row
        expect(rows[0].table_row.cells[0][0].text.content).toBe("Plain");
        expect(rows[0].table_row.cells[1][0].annotations.bold).toBe(true);
        // Data row
        expect(rows[1].table_row.cells[0][0].annotations.code).toBe(true);
        expect(rows[1].table_row.cells[1][0].text.link?.url).toBe("https://example.com");
      });

      it("handles empty table gracefully", () => {
        const nodes: Content[] = [
          table(null),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].type).toBe("table");
        expect(result[0].table.table_width).toBe(1);
        expect(result[0].table.children).toHaveLength(0);
      });
    });

    describe("Acceptance Scenario 8: Docusaurus admonitions (callouts)", () => {
      it("converts :::note directive to callout with 📝 icon", () => {
        const nodes: Content[] = [
          containerDirective("note", paragraph(text("This is a note."))),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("callout");
        expect(result[0].callout.icon.emoji).toBe("📝");
        expect(result[0].callout.rich_text[0].text.content).toBe("This is a note.");
      });

      it("converts :::tip directive to callout with 💡 icon", () => {
        const nodes: Content[] = [
          containerDirective("tip", paragraph(text("This is a tip."))),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].callout.icon.emoji).toBe("💡");
      });

      it("converts :::info directive to callout with ℹ️ icon", () => {
        const nodes: Content[] = [
          containerDirective("info", paragraph(text("This is info."))),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].callout.icon.emoji).toBe("ℹ️");
      });

      it("converts :::warning directive to callout with ⚠️ icon", () => {
        const nodes: Content[] = [
          containerDirective("warning", paragraph(text("This is a warning."))),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].callout.icon.emoji).toBe("⚠️");
      });

      it("converts :::danger directive to callout with 🔥 icon", () => {
        const nodes: Content[] = [
          containerDirective("danger", paragraph(text("This is dangerous!"))),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].callout.icon.emoji).toBe("🔥");
      });

      it("handles case-insensitive directive names", () => {
        const nodes: Content[] = [
          containerDirective("WARNING", paragraph(text("Uppercase warning"))),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].callout.icon.emoji).toBe("⚠️");
      });

      it("handles unknown directive type with default icon and warning", () => {
        const nodes: Content[] = [
          containerDirective("unknown", paragraph(text("Unknown type"))),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].type).toBe("callout");
        expect(result[0].callout.icon.emoji).toBe("📝"); // fallback
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Unknown container directive: unknown"),
        );
      });

      it("converts admonition with nested content as children", () => {
        const nodes: Content[] = [
          containerDirective(
            "tip",
            paragraph(text("Tip text")),
            list(
              false,
              listItem(null, paragraph(text("Item 1"))),
              listItem(null, paragraph(text("Item 2"))),
            ),
            code("const x = 1;", "javascript"),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].callout.rich_text[0].text.content).toBe("Tip text");
        expect(result[0].callout.children).toHaveLength(3); // 2 list items + 1 code block
      });
    });

    describe("Acceptance Scenario 9: <details><summary> toggles", () => {
      it("converts <details><summary> to Notion toggle block", () => {
        const htmlContent = `<details>
<summary>Click to expand</summary>
Hidden content here.
</details>`;
        const nodes: Content[] = [html(htmlContent)];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("toggle");
        expect(result[0].toggle.rich_text[0].text.content).toBe("Click to expand");
      });

      it("extracts toggle content as children", () => {
        const htmlContent = `<details>
<summary>Toggle Title</summary>
This is the hidden content.
</details>`;
        const nodes: Content[] = [html(htmlContent)];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].toggle.children).toBeDefined();
        expect(result[0].toggle.children[0].type).toBe("paragraph");
        expect(result[0].toggle.children[0].paragraph.rich_text[0].text.content).toBe(
          "This is the hidden content.",
        );
      });

      it("handles <details> without content", () => {
        const htmlContent = `<details>
<summary>Empty Toggle</summary>
</details>`;
        const nodes: Content[] = [html(htmlContent)];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].toggle.rich_text[0].text.content).toBe("Empty Toggle");
        expect(result[0].toggle.children).toBeUndefined();
      });

      it("uses default title when summary is missing", () => {
        const htmlContent = `<details>
Some content without summary.
</details>`;
        const nodes: Content[] = [html(htmlContent)];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].toggle.rich_text[0].text.content).toBe("Toggle");
      });
    });

    describe("Acceptance Scenario 10: Images", () => {
      it("converts image to Notion image block with external URL", () => {
        const nodes: Content[] = [
          image("https://example.com/image.png", "Alt text"),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("image");
        expect(result[0].image.type).toBe("external");
        expect(result[0].image.external.url).toBe("https://example.com/image.png");
      });

      it("uses alt text as caption", () => {
        const nodes: Content[] = [
          image("https://example.com/image.png", "This is the caption"),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].image.caption).toHaveLength(1);
        expect(result[0].image.caption[0].text.content).toBe("This is the caption");
      });

      it("handles image without alt text", () => {
        const nodes: Content[] = [image("https://example.com/image.png")];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].image.caption).toEqual([]);
      });

      it("handles relative URLs", () => {
        const nodes: Content[] = [image("./images/diagram.png", "Diagram")];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].image.external.url).toBe("./images/diagram.png");
      });
    });

    describe("Acceptance Scenario 11: Thematic breaks (dividers)", () => {
      it("converts thematic break to Notion divider block", () => {
        const nodes: Content[] = [thematicBreak()];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("divider");
        expect(result[0].divider).toEqual({});
      });
    });

    describe("Acceptance Scenario 12: Task list items (to_do)", () => {
      it("converts unchecked task item to to_do with checked=false", () => {
        const nodes: Content[] = [
          list(
            false,
            listItem(false, paragraph(text("Incomplete task"))),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("to_do");
        expect(result[0].to_do.checked).toBe(false);
        expect(result[0].to_do.rich_text[0].text.content).toBe("Incomplete task");
      });

      it("converts checked task item to to_do with checked=true", () => {
        const nodes: Content[] = [
          list(
            false,
            listItem(true, paragraph(text("Completed task"))),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].type).toBe("to_do");
        expect(result[0].to_do.checked).toBe(true);
      });

      it("converts mixed task list", () => {
        const nodes: Content[] = [
          list(
            false,
            listItem(true, paragraph(text("Done"))),
            listItem(false, paragraph(text("Not done"))),
            listItem(true, paragraph(text("Also done"))),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(3);
        expect(result[0].to_do.checked).toBe(true);
        expect(result[1].to_do.checked).toBe(false);
        expect(result[2].to_do.checked).toBe(true);
      });

      it("converts task items with nested content (regular list)", () => {
        // A task item with nested regular list items (checked: null)
        const nodes: Content[] = [
          list(
            false,
            listItem(
              true,
              paragraph(text("Task with subtasks")),
              list(
                false,
                listItem(null, paragraph(text("Subtask 1"))),
              ),
            ),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].type).toBe("to_do");
        expect(result[0].to_do.children).toBeDefined();
        expect(result[0].to_do.children[0].type).toBe("bulleted_list_item");
      });

      it("converts task items with nested task items", () => {
        // A task item with nested task items (checked: boolean)
        const nodes: Content[] = [
          list(
            false,
            listItem(
              true,
              paragraph(text("Parent task")),
              list(
                false,
                listItem(false, paragraph(text("Child task"))),
              ),
            ),
          ),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].type).toBe("to_do");
        expect(result[0].to_do.checked).toBe(true);
        expect(result[0].to_do.children).toBeDefined();
        // Nested task items also become to_do blocks
        expect(result[0].to_do.children[0].type).toBe("to_do");
        expect(result[0].to_do.children[0].to_do.checked).toBe(false);
      });
    });

    describe("Acceptance Scenario 13: Unsupported node types", () => {
      it("skips and warns for unsupported node types", () => {
        const nodes: Content[] = [
          { type: "footnoteDefinition", identifier: "1", children: [] } as unknown as Content,
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Skipping unsupported node type: footnoteDefinition"),
        );
      });

      it("skips definition nodes", () => {
        const nodes: Content[] = [
          { type: "definition", identifier: "ref", url: "https://example.com" } as unknown as Content,
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
      });

      it("skips leaf directive nodes with warning", () => {
        const nodes: Content[] = [leafDirective("youtube")];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Skipping unsupported leafDirective: youtube"),
        );
      });

      it("skips yaml nodes silently (frontmatter already extracted)", () => {
        const nodes: Content[] = [
          { type: "yaml", value: "title: Test" } as unknown as Content,
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it("skips listItem/tableRow/tableCell nodes (handled by parent)", () => {
        // These should only appear as children of their parent containers
        const nodes: Content[] = [
          listItem(null, paragraph(text("Orphan item"))),
          tableRow(tableCell(text("Orphan cell"))),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it("skips unsupported HTML with warning", () => {
        const nodes: Content[] = [html("<iframe src='evil.com'></iframe>")];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Skipping unsupported HTML"),
        );
      });

      it("skips closing HTML tags silently", () => {
        const nodes: Content[] = [html("</details>")];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it("skips HTML comments silently", () => {
        const nodes: Content[] = [html("<!-- This is a comment -->")];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it("skips <br> tags silently", () => {
        const nodes: Content[] = [html("<br>"), html("<br/>")];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it("skips <hr> tags silently", () => {
        const nodes: Content[] = [html("<hr>"), html("<hr/>")];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it("warns for unknown node types", () => {
        const nodes: Content[] = [
          { type: "customBlock" } as unknown as Content,
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(0);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Unknown node type: customBlock"),
        );
      });
    });

    describe("Edge cases", () => {
      it("returns empty array for empty input", () => {
        const result = mdastToNotionBlocks([]);
        expect(result).toEqual([]);
      });

      it("returns empty array for null input", () => {
        // @ts-expect-error Testing null input
        const result = mdastToNotionBlocks(null);
        expect(result).toEqual([]);
      });

      it("returns empty array for undefined input", () => {
        // @ts-expect-error Testing undefined input
        const result = mdastToNotionBlocks(undefined);
        expect(result).toEqual([]);
      });

      it("handles multiple blocks of same type", () => {
        const nodes: Content[] = [
          paragraph(text("Paragraph 1")),
          paragraph(text("Paragraph 2")),
          paragraph(text("Paragraph 3")),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(3);
        expect(result.every((b) => b.type === "paragraph")).toBe(true);
      });

      it("handles mixed content document", () => {
        const nodes: Content[] = [
          heading(1, text("Title")),
          paragraph(text("Intro paragraph")),
          blockquote(paragraph(text("A quote"))),
          list(false, listItem(null, paragraph(text("List item")))),
          code("const x = 1;", "javascript"),
          thematicBreak(),
          table(null, tableRow(tableCell(text("Cell")))),
        ];
        const result = mdastToNotionBlocks(nodes);

        const types = result.map((b) => b.type);
        expect(types).toEqual([
          "heading_1",
          "paragraph",
          "quote",
          "bulleted_list_item",
          "code",
          "divider",
          "table",
        ]);
      });

      it("handles unicode content", () => {
        const nodes: Content[] = [
          heading(1, text("日本語タイトル")),
          paragraph(text("中文内容 🎉")),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result[0].heading_1.rich_text[0].text.content).toBe("日本語タイトル");
        expect(result[1].paragraph.rich_text[0].text.content).toBe("中文内容 🎉");
      });

      it("handles empty list item gracefully", () => {
        const nodes: Content[] = [
          list(false, listItem(null)),
        ];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("bulleted_list_item");
        expect(result[0].bulleted_list_item.rich_text).toEqual([]);
      });

      it("handles empty blockquote gracefully", () => {
        const nodes: Content[] = [blockquote()];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("quote");
        expect(result[0].quote.rich_text).toEqual([]);
      });

      it("handles empty container directive gracefully", () => {
        const nodes: Content[] = [containerDirective("note")];
        const result = mdastToNotionBlocks(nodes);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("callout");
        expect(result[0].callout.rich_text).toEqual([]);
      });
    });
  });
});
