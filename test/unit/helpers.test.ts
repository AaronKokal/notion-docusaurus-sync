/**
 * Unit tests for the mock factories.
 * Ensures the helpers produce valid Notion API response shapes.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  mockRichText,
  mockBlock,
  mockNotionPage,
  mockQueryResponse,
  mockBlocksResponse,
  mockDatabaseResponse,
  resetMockCounters,
} from "../helpers.js";

describe("mockRichText", () => {
  it("creates basic text with default annotations", () => {
    const result = mockRichText("Hello World");

    expect(result.type).toBe("text");
    expect(result.plain_text).toBe("Hello World");
    expect(result.text?.content).toBe("Hello World");
    expect(result.text?.link).toBeNull();
    expect(result.href).toBeNull();
    expect(result.annotations.bold).toBe(false);
    expect(result.annotations.italic).toBe(false);
    expect(result.annotations.strikethrough).toBe(false);
    expect(result.annotations.underline).toBe(false);
    expect(result.annotations.code).toBe(false);
    expect(result.annotations.color).toBe("default");
  });

  it("creates bold text", () => {
    const result = mockRichText("Bold text", { bold: true });

    expect(result.annotations.bold).toBe(true);
    expect(result.annotations.italic).toBe(false);
  });

  it("creates italic text", () => {
    const result = mockRichText("Italic text", { italic: true });

    expect(result.annotations.italic).toBe(true);
  });

  it("creates strikethrough text", () => {
    const result = mockRichText("Struck text", { strikethrough: true });

    expect(result.annotations.strikethrough).toBe(true);
  });

  it("creates code text", () => {
    const result = mockRichText("code", { code: true });

    expect(result.annotations.code).toBe(true);
  });

  it("creates combined annotations", () => {
    const result = mockRichText("Bold and italic", { bold: true, italic: true });

    expect(result.annotations.bold).toBe(true);
    expect(result.annotations.italic).toBe(true);
  });

  it("creates linked text", () => {
    const result = mockRichText("Click here", {}, "https://example.com");

    expect(result.text?.link?.url).toBe("https://example.com");
    expect(result.href).toBe("https://example.com");
  });

  it("creates colored text", () => {
    const result = mockRichText("Red text", { color: "red" });

    expect(result.annotations.color).toBe("red");
  });
});

describe("mockBlock", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  it("creates a paragraph block", () => {
    const block = mockBlock("paragraph", "Hello World");

    expect(block.object).toBe("block");
    expect(block.type).toBe("paragraph");
    expect(block.has_children).toBe(false);
    expect(block.archived).toBe(false);
    expect(block.paragraph).toBeDefined();
    const para = block.paragraph as { rich_text: unknown[]; color: string };
    expect(para.rich_text).toHaveLength(1);
    expect(para.color).toBe("default");
  });

  it("creates heading blocks", () => {
    const h1 = mockBlock("heading_1", "Heading 1");
    const h2 = mockBlock("heading_2", "Heading 2");
    const h3 = mockBlock("heading_3", "Heading 3");

    expect(h1.type).toBe("heading_1");
    expect(h2.type).toBe("heading_2");
    expect(h3.type).toBe("heading_3");
    expect(h1.heading_1).toBeDefined();
    expect(h2.heading_2).toBeDefined();
    expect(h3.heading_3).toBeDefined();
  });

  it("creates bulleted list item block", () => {
    const block = mockBlock("bulleted_list_item", "List item");

    expect(block.type).toBe("bulleted_list_item");
    expect(block.bulleted_list_item).toBeDefined();
  });

  it("creates numbered list item block", () => {
    const block = mockBlock("numbered_list_item", "List item");

    expect(block.type).toBe("numbered_list_item");
    expect(block.numbered_list_item).toBeDefined();
  });

  it("creates to_do block", () => {
    const unchecked = mockBlock("to_do", "Task", { checked: false });
    const checked = mockBlock("to_do", "Done task", { checked: true });

    expect(unchecked.type).toBe("to_do");
    expect((unchecked.to_do as { checked: boolean }).checked).toBe(false);
    expect((checked.to_do as { checked: boolean }).checked).toBe(true);
  });

  it("creates code block with language", () => {
    const block = mockBlock("code", "const x = 1;", { language: "javascript" });

    expect(block.type).toBe("code");
    const code = block.code as { language: string; rich_text: unknown[] };
    expect(code.language).toBe("javascript");
    expect(code.rich_text).toHaveLength(1);
  });

  it("creates quote block", () => {
    const block = mockBlock("quote", "A wise quote");

    expect(block.type).toBe("quote");
    expect(block.quote).toBeDefined();
  });

  it("creates callout block with icon", () => {
    const block = mockBlock("callout", "Important note", { icon: "⚠️" });

    expect(block.type).toBe("callout");
    const callout = block.callout as { icon: { type: string; emoji: string } };
    expect(callout.icon.type).toBe("emoji");
    expect(callout.icon.emoji).toBe("⚠️");
  });

  it("creates divider block", () => {
    const block = mockBlock("divider");

    expect(block.type).toBe("divider");
    expect(block.divider).toEqual({});
  });

  it("creates table block", () => {
    const block = mockBlock("table", "", { tableWidth: 3, hasRowHeader: true });

    expect(block.type).toBe("table");
    expect(block.has_children).toBe(true);
    const table = block.table as {
      table_width: number;
      has_row_header: boolean;
    };
    expect(table.table_width).toBe(3);
    expect(table.has_row_header).toBe(true);
  });

  it("creates table_row block", () => {
    const block = mockBlock("table_row", "", {
      cells: [["A", "B", "C"]],
    });

    expect(block.type).toBe("table_row");
    const row = block.table_row as { cells: unknown[][] };
    expect(row.cells).toHaveLength(1);
    expect(row.cells[0]).toHaveLength(3);
  });

  it("creates image block", () => {
    const block = mockBlock("image", "", {
      url: "https://example.com/img.png",
      caption: "An image",
    });

    expect(block.type).toBe("image");
    const image = block.image as {
      type: string;
      external: { url: string };
      caption: unknown[];
    };
    expect(image.type).toBe("external");
    expect(image.external.url).toBe("https://example.com/img.png");
    expect(image.caption).toHaveLength(1);
  });

  it("creates bookmark block", () => {
    const block = mockBlock("bookmark", "", {
      bookmarkUrl: "https://example.com",
    });

    expect(block.type).toBe("bookmark");
    expect((block.bookmark as { url: string }).url).toBe("https://example.com");
  });

  it("creates toggle block", () => {
    const block = mockBlock("toggle", "Toggle title", { hasChildren: true });

    expect(block.type).toBe("toggle");
    expect(block.has_children).toBe(true);
  });

  it("accepts rich text array as content", () => {
    const richText = [
      mockRichText("Hello ", { bold: true }),
      mockRichText("World"),
    ];
    const block = mockBlock("paragraph", richText);

    const para = block.paragraph as { rich_text: unknown[] };
    expect(para.rich_text).toHaveLength(2);
  });

  it("handles custom options", () => {
    const block = mockBlock("paragraph", "Test", {
      id: "custom-id-123",
      hasChildren: true,
      archived: true,
    });

    expect(block.id).toBe("custom-id-123");
    expect(block.has_children).toBe(true);
    expect(block.archived).toBe(true);
  });
});

describe("mockNotionPage", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  it("creates a page with default values", () => {
    const page = mockNotionPage();

    expect(page.object).toBe("page");
    expect(page.id).toBeDefined();
    expect(page.created_time).toBeDefined();
    expect(page.last_edited_time).toBeDefined();
    expect(page.archived).toBe(false);
    expect(page.in_trash).toBe(false);
    expect(page.parent.type).toBe("database_id");
    expect(page.properties.Name).toBeDefined();
    expect(page.properties.Name.type).toBe("title");
  });

  it("creates a page with custom properties", () => {
    const page = mockNotionPage({
      properties: {
        Name: { type: "title", value: "My Page" },
        Status: { type: "select", value: "Published" },
        Tags: { type: "multi_select", value: ["tag1", "tag2"] },
        "Sidebar Position": { type: "number", value: 5 },
        "Published Date": { type: "date", value: "2024-01-15" },
      },
    });

    expect((page.properties.Name as { title: unknown[] }).title).toHaveLength(1);
    expect((page.properties.Status as { select: { name: string } }).select.name).toBe(
      "Published"
    );
    expect(
      (page.properties.Tags as { multi_select: Array<{ name: string }> }).multi_select
    ).toHaveLength(2);
    expect((page.properties["Sidebar Position"] as { number: number }).number).toBe(5);
  });

  it("creates a page with custom ID", () => {
    const page = mockNotionPage({ id: "custom-page-id" });

    expect(page.id).toBe("custom-page-id");
  });

  it("creates a page with icon and cover", () => {
    const page = mockNotionPage({
      icon: "📚",
      cover: "https://example.com/cover.jpg",
    });

    expect(page.icon?.type).toBe("emoji");
    expect(page.icon?.emoji).toBe("📚");
    expect(page.cover?.type).toBe("external");
    expect(page.cover?.external.url).toBe("https://example.com/cover.jpg");
  });

  it("creates an archived page", () => {
    const page = mockNotionPage({ archived: true });

    expect(page.archived).toBe(true);
  });

  it("creates a page with custom parent database", () => {
    const page = mockNotionPage({ parentDatabaseId: "db-123" });

    expect(page.parent.type).toBe("database_id");
    expect((page.parent as { database_id: string }).database_id).toBe("db-123");
  });
});

describe("mockQueryResponse", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  it("creates a query response with pages", () => {
    const pages = [mockNotionPage(), mockNotionPage()];
    const response = mockQueryResponse(pages);

    expect(response.object).toBe("list");
    expect(response.type).toBe("page");
    expect(response.results).toHaveLength(2);
    expect(response.has_more).toBe(false);
    expect(response.next_cursor).toBeNull();
  });

  it("creates a paginated response", () => {
    const pages = [mockNotionPage()];
    const response = mockQueryResponse(pages, true, "cursor-abc");

    expect(response.has_more).toBe(true);
    expect(response.next_cursor).toBe("cursor-abc");
  });
});

describe("mockBlocksResponse", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  it("creates a blocks response", () => {
    const blocks = [
      mockBlock("paragraph", "Paragraph 1"),
      mockBlock("paragraph", "Paragraph 2"),
    ];
    const response = mockBlocksResponse(blocks);

    expect(response.object).toBe("list");
    expect(response.type).toBe("block");
    expect(response.results).toHaveLength(2);
    expect(response.has_more).toBe(false);
    expect(response.next_cursor).toBeNull();
  });

  it("creates a paginated blocks response", () => {
    const blocks = [mockBlock("paragraph", "Test")];
    const response = mockBlocksResponse(blocks, true, "block-cursor");

    expect(response.has_more).toBe(true);
    expect(response.next_cursor).toBe("block-cursor");
  });
});

describe("mockDatabaseResponse", () => {
  it("creates a database response with data_sources", () => {
    const response = mockDatabaseResponse(
      "db-123",
      "ds-456",
      "My Database"
    );

    expect(response.object).toBe("database");
    expect(response.id).toBe("db-123");
    expect(response.title[0].plain_text).toBe("My Database");
    expect(response.data_sources).toHaveLength(1);
    expect(response.data_sources[0].id).toBe("ds-456");
    expect(response.data_sources[0].object).toBe("data_source");
  });
});
