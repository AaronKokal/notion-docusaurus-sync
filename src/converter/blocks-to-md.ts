/**
 * Notion blocks to Markdown converter.
 *
 * Transforms Notion block objects (as returned by blocks.children.list)
 * into Docusaurus-compatible Markdown strings.
 *
 * Supported block types (per FR-002):
 * - paragraph, heading_1/2/3
 * - bulleted_list_item, numbered_list_item
 * - code, quote, callout
 * - divider, table, toggle
 * - image, to_do, bookmark
 *
 * Unsupported block types are logged with a warning and rendered as
 * HTML comments (per FR-007).
 */

import type { NotionBlock, NotionRichText } from "../notion/types.js";
import { richTextToMarkdown } from "./rich-text.js";

/**
 * Block with children attached (for recursive block structures).
 *
 * The Notion API returns blocks without children inline - they must be
 * fetched separately. This interface extends NotionBlock to include
 * pre-fetched children for recursive conversion.
 */
export interface BlockWithChildren extends Omit<NotionBlock, "type"> {
  type: NotionBlock["type"];
  children?: BlockWithChildren[];
}

/**
 * Maps Notion callout icon emojis to Docusaurus admonition types.
 * Unmapped icons default to "note".
 */
const CALLOUT_ICON_TO_ADMONITION: Record<string, string> = {
  "💡": "tip",
  "ℹ️": "info",
  "⚠️": "warning",
  "🔥": "danger",
  "❗": "danger",
  "✅": "tip",
  "📝": "note",
  "🚨": "danger",
  "⛔": "danger",
  "❌": "danger",
  "🚫": "danger",
};

/**
 * Converts an array of Notion blocks to a Markdown string.
 *
 * Handles nested block structures (toggles, tables, column lists)
 * by recursively converting children. List items are automatically
 * grouped and properly indented.
 *
 * @param blocks - Array of Notion blocks (with optional children attached)
 * @returns Markdown string suitable for Docusaurus
 *
 * @example
 * ```ts
 * const md = blocksToMarkdown([
 *   { type: "heading_1", heading_1: { rich_text: [...] }, ... },
 *   { type: "paragraph", paragraph: { rich_text: [...] }, ... },
 * ]);
 * // Returns: "# Heading\n\nParagraph content"
 * ```
 */
export function blocksToMarkdown(blocks: BlockWithChildren[]): string {
  if (!blocks || blocks.length === 0) {
    return "";
  }

  const lines: string[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    // Group consecutive list items of the same type
    if (
      block.type === "bulleted_list_item" ||
      block.type === "numbered_list_item"
    ) {
      const listType = block.type;
      const listItems: BlockWithChildren[] = [];

      // Collect all consecutive items of the same list type
      while (i < blocks.length && blocks[i].type === listType) {
        listItems.push(blocks[i]);
        i++;
      }

      // Convert the entire list
      lines.push(convertList(listItems, listType));
    } else {
      // Single block conversion
      const converted = convertBlock(block);
      if (converted !== null) {
        lines.push(converted);
      }
      i++;
    }
  }

  return lines.join("\n\n");
}

/**
 * Converts a single block to Markdown.
 *
 * @param block - A Notion block with optional children
 * @param indent - Indentation level for nested content
 * @returns Markdown string, or null if the block should be skipped
 */
function convertBlock(
  block: BlockWithChildren,
  indent: number = 0
): string | null {
  const indentStr = "  ".repeat(indent);

  switch (block.type) {
    case "paragraph":
      return convertParagraph(block);

    case "heading_1":
      return convertHeading(block, 1);

    case "heading_2":
      return convertHeading(block, 2);

    case "heading_3":
      return convertHeading(block, 3);

    case "bulleted_list_item":
    case "numbered_list_item":
      // These are handled by convertList() in the main loop
      // If we get here, it's a single item not part of a grouped list
      return convertListItem(block, block.type, 0, 0);

    case "to_do":
      return convertToDo(block);

    case "toggle":
      return convertToggle(block);

    case "code":
      return convertCode(block);

    case "quote":
      return convertQuote(block);

    case "callout":
      return convertCallout(block);

    case "divider":
      return "---";

    case "table":
      return convertTable(block);

    case "image":
      return convertImage(block);

    case "bookmark":
      return convertBookmark(block);

    case "equation":
      return convertEquation(block);

    case "embed":
      return convertEmbed(block);

    case "video":
      return convertVideo(block);

    case "file":
      return convertFile(block);

    case "pdf":
      return convertPdf(block);

    case "audio":
      return convertAudio(block);

    case "column_list":
      return convertColumnList(block);

    case "column":
      // Columns are handled by column_list
      return null;

    case "table_row":
      // Table rows are handled by table
      return null;

    case "child_page":
      return convertChildPage(block);

    case "child_database":
      return convertChildDatabase(block);

    case "link_to_page":
      return convertLinkToPage(block);

    case "link_preview":
      return convertLinkPreview(block);

    case "synced_block":
      return convertSyncedBlock(block);

    case "breadcrumb":
      // Breadcrumbs are a Notion UI element, skip in markdown
      return null;

    case "table_of_contents":
      // Table of contents is auto-generated by Docusaurus
      return null;

    case "unsupported":
      logUnsupportedBlock(block.type, block.id);
      return `<!-- Unsupported block: ${block.type} -->`;

    default:
      // Unknown block type - log warning and render as comment
      logUnsupportedBlock(block.type, block.id);
      return `<!-- Unsupported block: ${block.type} -->`;
  }
}

/**
 * Converts a paragraph block to Markdown.
 */
function convertParagraph(block: BlockWithChildren): string {
  const paragraph = getBlockContent(block, "paragraph");
  if (!paragraph) return "";

  const text = richTextToMarkdown(paragraph.rich_text ?? []);

  // If paragraph has children (rare but possible), append them indented
  if (block.children && block.children.length > 0) {
    const childrenMd = blocksToMarkdown(block.children);
    return text + "\n\n" + childrenMd;
  }

  return text;
}

/**
 * Converts a heading block to Markdown.
 */
function convertHeading(
  block: BlockWithChildren,
  level: 1 | 2 | 3
): string {
  const headingKey = `heading_${level}` as
    | "heading_1"
    | "heading_2"
    | "heading_3";
  const heading = getBlockContent(block, headingKey);
  if (!heading) return "";

  const text = richTextToMarkdown(heading.rich_text ?? []);
  const prefix = "#".repeat(level);

  // Toggleable headings can have children
  if (block.children && block.children.length > 0) {
    const childrenMd = blocksToMarkdown(block.children);
    return `${prefix} ${text}\n\n${childrenMd}`;
  }

  return `${prefix} ${text}`;
}

/**
 * Converts a list of consecutive list items to Markdown.
 * Handles nested lists via children.
 */
function convertList(
  items: BlockWithChildren[],
  listType: "bulleted_list_item" | "numbered_list_item"
): string {
  return items
    .map((item, index) => convertListItem(item, listType, 0, index))
    .join("\n");
}

/**
 * Converts a single list item to Markdown.
 */
function convertListItem(
  block: BlockWithChildren,
  listType: "bulleted_list_item" | "numbered_list_item",
  depth: number,
  index: number
): string {
  const content = getBlockContent(block, listType);
  if (!content) return "";

  const text = richTextToMarkdown(content.rich_text ?? []);
  const indent = "  ".repeat(depth);
  const marker = listType === "bulleted_list_item" ? "-" : `${index + 1}.`;

  let result = `${indent}${marker} ${text}`;

  // Handle nested list items
  if (block.children && block.children.length > 0) {
    const nestedItems: string[] = [];

    for (let i = 0; i < block.children.length; i++) {
      const child = block.children[i];

      // Nested list items
      if (
        child.type === "bulleted_list_item" ||
        child.type === "numbered_list_item"
      ) {
        nestedItems.push(
          convertListItem(child, child.type, depth + 1, i)
        );
      } else {
        // Non-list children get converted and indented
        const converted = convertBlock(child);
        if (converted) {
          const indented = converted
            .split("\n")
            .map((line) => "  ".repeat(depth + 1) + line)
            .join("\n");
          nestedItems.push(indented);
        }
      }
    }

    if (nestedItems.length > 0) {
      result += "\n" + nestedItems.join("\n");
    }
  }

  return result;
}

/**
 * Converts a to-do (checkbox) block to Markdown.
 */
function convertToDo(block: BlockWithChildren): string {
  const todo = getBlockContent(block, "to_do");
  if (!todo) return "";

  const text = richTextToMarkdown(todo.rich_text ?? []);
  const checkbox = todo.checked ? "[x]" : "[ ]";

  let result = `- ${checkbox} ${text}`;

  // Handle nested content
  if (block.children && block.children.length > 0) {
    const childrenMd = block.children
      .map((child) => {
        const converted = convertBlock(child);
        if (converted) {
          return converted
            .split("\n")
            .map((line) => "  " + line)
            .join("\n");
        }
        return null;
      })
      .filter(Boolean)
      .join("\n");

    if (childrenMd) {
      result += "\n" + childrenMd;
    }
  }

  return result;
}

/**
 * Converts a toggle block to HTML details/summary.
 * Docusaurus supports this HTML structure natively.
 */
function convertToggle(block: BlockWithChildren): string {
  const toggle = getBlockContent(block, "toggle");
  if (!toggle) return "";

  const summary = richTextToMarkdown(toggle.rich_text ?? []);
  const childrenMd =
    block.children && block.children.length > 0
      ? blocksToMarkdown(block.children)
      : "";

  return `<details>
<summary>${summary}</summary>

${childrenMd}

</details>`;
}

/**
 * Converts a code block to fenced code block Markdown.
 */
function convertCode(block: BlockWithChildren): string {
  const code = getBlockContent(block, "code");
  if (!code) return "";

  // Get the code content - it's in rich_text array
  const content = code.rich_text
    ? code.rich_text.map((rt: NotionRichText) => rt.plain_text ?? "").join("")
    : "";

  // Notion's language field values mostly match common Markdown fences
  // "plain text" becomes "" (no language annotation)
  let language = code.language ?? "";
  if (language === "plain text") {
    language = "";
  }

  // Handle caption if present
  const caption = code.caption
    ? richTextToMarkdown(code.caption)
    : "";

  let result = "```" + language + "\n" + content + "\n```";

  if (caption) {
    result += "\n\n*" + caption + "*";
  }

  return result;
}

/**
 * Converts a quote block to blockquote Markdown.
 */
function convertQuote(block: BlockWithChildren): string {
  const quote = getBlockContent(block, "quote");
  if (!quote) return "";

  const text = richTextToMarkdown(quote.rich_text ?? []);

  // Quote text should have each line prefixed with >
  let result = text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  // Handle nested children
  if (block.children && block.children.length > 0) {
    const childrenMd = blocksToMarkdown(block.children);
    // Indent children under the quote
    const indentedChildren = childrenMd
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    result += "\n" + indentedChildren;
  }

  return result;
}

/**
 * Converts a callout block to Docusaurus admonition syntax.
 *
 * Maps callout icons to admonition types:
 * - 💡 → tip
 * - ⚠️ → warning
 * - etc.
 *
 * Unmapped icons default to "note".
 */
function convertCallout(block: BlockWithChildren): string {
  const callout = getBlockContent(block, "callout");
  if (!callout) return "";

  const text = richTextToMarkdown(callout.rich_text ?? []);

  // Determine admonition type from icon
  let admonitionType = "note";
  if (callout.icon) {
    if (callout.icon.type === "emoji" && callout.icon.emoji) {
      admonitionType =
        CALLOUT_ICON_TO_ADMONITION[callout.icon.emoji] ?? "note";
    }
  }

  // Handle children
  let content = text;
  if (block.children && block.children.length > 0) {
    const childrenMd = blocksToMarkdown(block.children);
    content = text + "\n\n" + childrenMd;
  }

  return `:::${admonitionType}

${content}

:::`;
}

/**
 * Converts a table block to pipe-table Markdown.
 * Requires table_row children to be pre-fetched.
 */
function convertTable(block: BlockWithChildren): string {
  const table = getBlockContent(block, "table");
  if (!table) return "";

  if (!block.children || block.children.length === 0) {
    // Table without rows - render placeholder
    return "<!-- Empty table -->";
  }

  const rows = block.children.filter((child) => child.type === "table_row");
  if (rows.length === 0) {
    return "<!-- Empty table -->";
  }

  const tableWidth = table.table_width ?? 1;
  const hasRowHeader = table.has_row_header ?? false;

  // Convert each row
  const mdRows: string[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const rowContent = getBlockContent(row, "table_row");
    if (!rowContent || !rowContent.cells) continue;

    // Each cell is an array of rich text
    const cells: string[] = [];
    for (let colIndex = 0; colIndex < tableWidth; colIndex++) {
      const cellRichText = rowContent.cells[colIndex] ?? [];
      cells.push(richTextToMarkdown(cellRichText));
    }

    mdRows.push("| " + cells.join(" | ") + " |");

    // Add header separator after first row
    if (rowIndex === 0) {
      const separator = "| " + cells.map(() => "---").join(" | ") + " |";
      mdRows.push(separator);
    }
  }

  return mdRows.join("\n");
}

/**
 * Converts an image block to Markdown image syntax.
 * Uses a placeholder URL - actual image handling is in spec 005.
 */
function convertImage(block: BlockWithChildren): string {
  const image = getBlockContent(block, "image");
  if (!image) return "";

  // Get the image URL based on type (file or external)
  let url = "";
  if (image.type === "file" && image.file) {
    url = image.file.url ?? "";
  } else if (image.type === "external" && image.external) {
    url = image.external.url ?? "";
  }

  // Get caption if present
  const caption = image.caption
    ? richTextToMarkdown(image.caption)
    : "";

  // Use caption as alt text, or "image" if no caption
  const altText = caption || "image";

  return `![${altText}](${url})`;
}

/**
 * Converts a bookmark block to a Markdown link.
 */
function convertBookmark(block: BlockWithChildren): string {
  const bookmark = getBlockContent(block, "bookmark");
  if (!bookmark) return "";

  const url = bookmark.url ?? "";
  const caption = bookmark.caption
    ? richTextToMarkdown(bookmark.caption)
    : url;

  return `[${caption}](${url})`;
}

/**
 * Converts an equation block to LaTeX math syntax.
 */
function convertEquation(block: BlockWithChildren): string {
  const equation = getBlockContent(block, "equation");
  if (!equation) return "";

  const expression = equation.expression ?? "";
  // Use display math ($$) for block-level equations
  return `$$\n${expression}\n$$`;
}

/**
 * Converts an embed block to a link (embeds are not portable).
 */
function convertEmbed(block: BlockWithChildren): string {
  const embed = getBlockContent(block, "embed");
  if (!embed) return "";

  const url = embed.url ?? "";
  const caption = embed.caption
    ? richTextToMarkdown(embed.caption)
    : url;

  return `[${caption}](${url})`;
}

/**
 * Converts a video block to a link or embed.
 */
function convertVideo(block: BlockWithChildren): string {
  const video = getBlockContent(block, "video");
  if (!video) return "";

  let url = "";
  if (video.type === "file" && video.file) {
    url = video.file.url ?? "";
  } else if (video.type === "external" && video.external) {
    url = video.external.url ?? "";
  }

  const caption = video.caption
    ? richTextToMarkdown(video.caption)
    : "Video";

  // Check if it's a YouTube URL - could render as iframe
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    return `[${caption}](${url})`;
  }

  return `[${caption}](${url})`;
}

/**
 * Converts a file block to a download link.
 */
function convertFile(block: BlockWithChildren): string {
  const file = getBlockContent(block, "file");
  if (!file) return "";

  let url = "";
  if (file.type === "file" && file.file) {
    url = file.file.url ?? "";
  } else if (file.type === "external" && file.external) {
    url = file.external.url ?? "";
  }

  const name = file.name ?? "Download file";
  const caption = file.caption
    ? richTextToMarkdown(file.caption)
    : name;

  return `[${caption}](${url})`;
}

/**
 * Converts a PDF block to a link.
 */
function convertPdf(block: BlockWithChildren): string {
  const pdf = getBlockContent(block, "pdf");
  if (!pdf) return "";

  let url = "";
  if (pdf.type === "file" && pdf.file) {
    url = pdf.file.url ?? "";
  } else if (pdf.type === "external" && pdf.external) {
    url = pdf.external.url ?? "";
  }

  const caption = pdf.caption
    ? richTextToMarkdown(pdf.caption)
    : "PDF Document";

  return `[${caption}](${url})`;
}

/**
 * Converts an audio block to a link.
 */
function convertAudio(block: BlockWithChildren): string {
  const audio = getBlockContent(block, "audio");
  if (!audio) return "";

  let url = "";
  if (audio.type === "file" && audio.file) {
    url = audio.file.url ?? "";
  } else if (audio.type === "external" && audio.external) {
    url = audio.external.url ?? "";
  }

  const caption = audio.caption
    ? richTextToMarkdown(audio.caption)
    : "Audio";

  return `[${caption}](${url})`;
}

/**
 * Converts a column_list block by concatenating columns.
 * Notion columns are rendered sequentially in Markdown (no side-by-side).
 */
function convertColumnList(block: BlockWithChildren): string {
  if (!block.children || block.children.length === 0) {
    return "";
  }

  const columnContents: string[] = [];

  for (const column of block.children) {
    if (column.type === "column" && column.children) {
      const columnMd = blocksToMarkdown(column.children);
      if (columnMd) {
        columnContents.push(columnMd);
      }
    }
  }

  // Separate columns with horizontal rules for visual distinction
  return columnContents.join("\n\n---\n\n");
}

/**
 * Converts a child_page block to a link placeholder.
 */
function convertChildPage(block: BlockWithChildren): string {
  const childPage = getBlockContent(block, "child_page");
  if (!childPage) return "";

  const title = childPage.title ?? "Untitled";

  // Child pages would need their own sync - render as a note
  return `> 📄 **Child page:** ${title}`;
}

/**
 * Converts a child_database block to a placeholder.
 */
function convertChildDatabase(block: BlockWithChildren): string {
  const childDb = getBlockContent(block, "child_database");
  if (!childDb) return "";

  const title = childDb.title ?? "Untitled Database";

  // Child databases would need their own sync - render as a note
  return `> 📊 **Child database:** ${title}`;
}

/**
 * Converts a link_to_page block to a placeholder.
 */
function convertLinkToPage(block: BlockWithChildren): string {
  const linkToPage = getBlockContent(block, "link_to_page");
  if (!linkToPage) return "";

  // Extract the page/database ID
  let targetId = "";
  let targetType = "page";

  if (linkToPage.type === "page_id") {
    targetId = linkToPage.page_id ?? "";
    targetType = "page";
  } else if (linkToPage.type === "database_id") {
    targetId = linkToPage.database_id ?? "";
    targetType = "database";
  }

  return `> 🔗 **Link to ${targetType}:** \`${targetId}\``;
}

/**
 * Converts a link_preview block to a link.
 */
function convertLinkPreview(block: BlockWithChildren): string {
  const preview = getBlockContent(block, "link_preview");
  if (!preview) return "";

  const url = preview.url ?? "";
  return `[${url}](${url})`;
}

/**
 * Converts a synced_block by rendering its children.
 */
function convertSyncedBlock(block: BlockWithChildren): string {
  // If this is the original synced block with children, render them
  if (block.children && block.children.length > 0) {
    return blocksToMarkdown(block.children);
  }

  // If this is a reference to another synced block, note it
  const syncedBlock = getBlockContent(block, "synced_block");
  if (syncedBlock?.synced_from?.block_id) {
    return `<!-- Synced from block: ${syncedBlock.synced_from.block_id} -->`;
  }

  return "";
}

/**
 * Logs a warning for unsupported block types.
 */
function logUnsupportedBlock(type: string, id: string): void {
  console.warn(
    `[blocks-to-md] Unsupported block type "${type}" (id: ${id})`
  );
}

/**
 * Safely extracts block content for a given block type.
 * Uses type assertion since the SDK types are complex unions.
 */
function getBlockContent<T extends string>(
  block: BlockWithChildren,
  type: T
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (block as any)[type];
}
