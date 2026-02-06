/**
 * mdast to Notion block converter.
 *
 * Converts mdast block nodes (from remark parsing) to Notion block creation payloads.
 * This is the reverse of `blocks-to-md.ts`'s `blocksToMarkdown()`.
 *
 * Supported mdast node types:
 * - heading (depth 1-3) → heading_1/heading_2/heading_3
 * - paragraph → paragraph
 * - code → code block with language
 * - list (ordered/unordered) → bulleted_list_item/numbered_list_item
 * - listItem with checked → to_do
 * - blockquote → quote
 * - table → table with table_row children
 * - containerDirective (note/tip/info/warning/danger) → callout
 * - html containing <details><summary> → toggle
 * - thematicBreak → divider
 * - image → image block with external URL
 *
 * Unsupported types are logged with a warning and skipped.
 */

import type { Content, Root, PhrasingContent } from "mdast";
import type { NotionBlockPayload } from "../types.js";
import {
  phrasesToRichText,
  type NotionRichTextPayload,
} from "./md-to-rich-text.js";

/**
 * Maps Docusaurus admonition types to Notion callout icons.
 * This is the reverse of CALLOUT_ICON_TO_ADMONITION in blocks-to-md.ts.
 */
const ADMONITION_TO_ICON: Record<string, string> = {
  note: "📝",
  tip: "💡",
  info: "ℹ️",
  warning: "⚠️",
  danger: "🔥",
};

/**
 * Converts an array of mdast block nodes to Notion block creation payloads.
 *
 * This is the main entry point for converting markdown AST to Notion blocks.
 * Iterate over block-level Content nodes, dispatch to type-specific handlers,
 * and return a flat array of block payloads suitable for:
 * - `pages.create({ children: [...] })`
 * - `blocks.children.append({ children: [...] })`
 *
 * @param nodes - Array of mdast Content nodes (typically Root.children)
 * @returns Array of Notion block payloads
 *
 * @example
 * ```ts
 * const ast = parseMarkdown("# Hello\n\nWorld");
 * const blocks = mdastToNotionBlocks(ast.children);
 * // blocks = [
 * //   { type: "heading_1", heading_1: { rich_text: [...] } },
 * //   { type: "paragraph", paragraph: { rich_text: [...] } }
 * // ]
 * ```
 */
export function mdastToNotionBlocks(nodes: Content[]): NotionBlockPayload[] {
  if (!nodes || nodes.length === 0) {
    return [];
  }

  const result: NotionBlockPayload[] = [];

  for (const node of nodes) {
    const converted = convertNode(node);
    if (converted !== null) {
      // Some handlers return arrays (e.g., lists), others return single blocks
      if (Array.isArray(converted)) {
        result.push(...converted);
      } else {
        result.push(converted);
      }
    }
  }

  return result;
}

/**
 * Converts a single mdast node to Notion block payload(s).
 *
 * @param node - An mdast Content node
 * @returns A single block payload, an array of payloads, or null if skipped
 */
function convertNode(
  node: Content
): NotionBlockPayload | NotionBlockPayload[] | null {
  switch (node.type) {
    case "heading":
      return convertHeading(node);

    case "paragraph":
      return convertParagraph(node);

    case "code":
      return convertCode(node);

    case "list":
      return convertList(node);

    case "blockquote":
      return convertBlockquote(node);

    case "table":
      return convertTable(node);

    case "thematicBreak":
      return { type: "divider", divider: {} };

    case "image":
      return convertImage(node);

    case "html":
      return convertHtml(node);

    // Container directives from remark-directive (:::note, :::tip, etc.)
    case "containerDirective":
      return convertContainerDirective(node as ContainerDirectiveNode);

    // Leaf directives (::directive) - typically skip or convert to text
    case "leafDirective":
      console.warn(
        `[md-to-blocks] Skipping unsupported leafDirective: ${(node as LeafDirectiveNode).name}`
      );
      return null;

    // Text directives (:directive[text]) are inline, not block-level
    case "textDirective":
      return null;

    // These are handled within their parent containers
    case "listItem":
    case "tableRow":
    case "tableCell":
      return null;

    // Definition and footnote nodes are reference-style, need full document context
    case "definition":
    case "footnoteDefinition":
      console.warn(
        `[md-to-blocks] Skipping unsupported node type: ${node.type}`
      );
      return null;

    // YAML frontmatter should already be extracted before AST conversion
    case "yaml":
      return null;

    default:
      console.warn(
        `[md-to-blocks] Unknown node type: ${(node as Content).type}`
      );
      return null;
  }
}

/**
 * Converts a heading node to a Notion heading block.
 * Notion supports heading levels 1-3; levels 4+ are converted to heading_3.
 */
function convertHeading(
  node: Extract<Content, { type: "heading" }>
): NotionBlockPayload {
  const children = node.children as PhrasingContent[];
  const richText = phrasesToRichText(children);

  // Notion only supports heading levels 1-3
  const level = Math.min(node.depth, 3) as 1 | 2 | 3;
  const headingKey = `heading_${level}` as
    | "heading_1"
    | "heading_2"
    | "heading_3";

  return {
    type: headingKey,
    [headingKey]: {
      rich_text: richText,
    },
  };
}

/**
 * Converts a paragraph node to a Notion paragraph block.
 */
function convertParagraph(
  node: Extract<Content, { type: "paragraph" }>
): NotionBlockPayload {
  const children = node.children as PhrasingContent[];
  const richText = phrasesToRichText(children);

  return {
    type: "paragraph",
    paragraph: {
      rich_text: richText,
    },
  };
}

/**
 * Converts a code block to a Notion code block.
 */
function convertCode(
  node: Extract<Content, { type: "code" }>
): NotionBlockPayload {
  // Notion's language must not be empty - use "plain text" as fallback
  const language = node.lang || "plain text";

  return {
    type: "code",
    code: {
      language,
      rich_text: [
        {
          type: "text",
          text: {
            content: node.value,
          },
        },
      ],
    },
  };
}

/**
 * Converts a list node to an array of Notion list item blocks.
 * Handles both ordered and unordered lists.
 */
function convertList(
  node: Extract<Content, { type: "list" }>
): NotionBlockPayload[] {
  const blocks: NotionBlockPayload[] = [];
  const isOrdered = node.ordered === true;

  for (const item of node.children) {
    if (item.type === "listItem") {
      const converted = convertListItem(item, isOrdered);
      if (converted) {
        blocks.push(converted);
      }
    }
  }

  return blocks;
}

/**
 * Converts a list item to a Notion list item or to_do block.
 * Task list items (with checked property) become to_do blocks.
 */
function convertListItem(
  node: Extract<Content, { type: "listItem" }>,
  isOrdered: boolean
): NotionBlockPayload | null {
  // Task list items have a `checked` property
  if (typeof node.checked === "boolean") {
    return convertToDoItem(node);
  }

  const blockType = isOrdered ? "numbered_list_item" : "bulleted_list_item";

  // List item children can include paragraphs, nested lists, etc.
  // The first paragraph's content becomes the list item's rich_text
  // Subsequent items (including nested lists) become children
  const { richText, childBlocks } = extractListItemContent(node);

  const block: NotionBlockPayload = {
    type: blockType,
    [blockType]: {
      rich_text: richText,
    },
  };

  // Add nested children if present
  if (childBlocks.length > 0) {
    block[blockType].children = childBlocks;
  }

  return block;
}

/**
 * Extracts rich_text and child blocks from a list item's children.
 *
 * The first paragraph (or first inline content) becomes the main rich_text.
 * Subsequent blocks (including nested lists) become children.
 */
function extractListItemContent(
  node: Extract<Content, { type: "listItem" }>
): {
  richText: NotionRichTextPayload[];
  childBlocks: NotionBlockPayload[];
} {
  const children = node.children || [];
  let richText: NotionRichTextPayload[] = [];
  const childBlocks: NotionBlockPayload[] = [];
  let foundFirstParagraph = false;

  for (const child of children) {
    if (!foundFirstParagraph && child.type === "paragraph") {
      // First paragraph provides the main rich_text
      richText = phrasesToRichText(child.children as PhrasingContent[]);
      foundFirstParagraph = true;
    } else {
      // Everything else becomes child blocks
      const converted = convertNode(child);
      if (converted !== null) {
        if (Array.isArray(converted)) {
          childBlocks.push(...converted);
        } else {
          childBlocks.push(converted);
        }
      }
    }
  }

  // If no paragraph found, the list item might have direct text content
  // This shouldn't normally happen in standard markdown
  if (!foundFirstParagraph && children.length > 0) {
    // Try to convert children directly
    for (const child of children) {
      const converted = convertNode(child);
      if (converted !== null) {
        if (Array.isArray(converted)) {
          childBlocks.push(...converted);
        } else {
          childBlocks.push(converted);
        }
      }
    }
  }

  return { richText, childBlocks };
}

/**
 * Converts a task list item to a Notion to_do block.
 */
function convertToDoItem(
  node: Extract<Content, { type: "listItem" }>
): NotionBlockPayload {
  const { richText, childBlocks } = extractListItemContent(node);

  const block: NotionBlockPayload = {
    type: "to_do",
    to_do: {
      rich_text: richText,
      checked: node.checked === true,
    },
  };

  if (childBlocks.length > 0) {
    block.to_do.children = childBlocks;
  }

  return block;
}

/**
 * Converts a blockquote to a Notion quote block.
 */
function convertBlockquote(
  node: Extract<Content, { type: "blockquote" }>
): NotionBlockPayload {
  // Blockquote children are typically paragraphs
  // Combine all paragraphs' content into the quote's rich_text
  // Other content types become children

  const allRichText: NotionRichTextPayload[] = [];
  const childBlocks: NotionBlockPayload[] = [];

  for (const child of node.children) {
    if (child.type === "paragraph") {
      const richText = phrasesToRichText(child.children as PhrasingContent[]);
      // Add line break between paragraphs
      if (allRichText.length > 0) {
        allRichText.push({
          type: "text",
          text: { content: "\n" },
        });
      }
      allRichText.push(...richText);
    } else {
      // Non-paragraph children become nested blocks
      const converted = convertNode(child);
      if (converted !== null) {
        if (Array.isArray(converted)) {
          childBlocks.push(...converted);
        } else {
          childBlocks.push(converted);
        }
      }
    }
  }

  const block: NotionBlockPayload = {
    type: "quote",
    quote: {
      rich_text: allRichText,
    },
  };

  if (childBlocks.length > 0) {
    block.quote.children = childBlocks;
  }

  return block;
}

/**
 * Converts a table to a Notion table block with table_row children.
 */
function convertTable(
  node: Extract<Content, { type: "table" }>
): NotionBlockPayload {
  const rows = node.children || [];

  if (rows.length === 0) {
    // Empty table - return a minimal valid table
    return {
      type: "table",
      table: {
        table_width: 1,
        has_column_header: false,
        has_row_header: false,
        children: [],
      },
    };
  }

  // Determine table width from first row
  const firstRow = rows[0];
  const tableWidth =
    firstRow.type === "tableRow" ? firstRow.children.length : 1;

  // Convert rows to table_row blocks
  const tableRows: NotionBlockPayload[] = [];

  for (const row of rows) {
    if (row.type === "tableRow") {
      const cells: NotionRichTextPayload[][] = [];

      for (const cell of row.children) {
        if (cell.type === "tableCell") {
          const cellRichText = phrasesToRichText(
            cell.children as PhrasingContent[]
          );
          cells.push(cellRichText);
        }
      }

      tableRows.push({
        type: "table_row",
        table_row: {
          cells,
        },
      });
    }
  }

  return {
    type: "table",
    table: {
      table_width: tableWidth,
      has_column_header: true, // First row is typically the header
      has_row_header: false,
      children: tableRows,
    },
  };
}

/**
 * Converts an image node to a Notion image block.
 */
function convertImage(
  node: Extract<Content, { type: "image" }>
): NotionBlockPayload {
  return {
    type: "image",
    image: {
      type: "external",
      external: {
        url: node.url,
      },
      caption: node.alt
        ? [
            {
              type: "text",
              text: { content: node.alt },
            },
          ]
        : [],
    },
  };
}

/**
 * Interface for container directive nodes from remark-directive.
 * These represent Docusaurus admonitions like :::note, :::tip, etc.
 */
interface ContainerDirectiveNode {
  type: "containerDirective";
  name: string;
  children: Content[];
  attributes?: Record<string, string>;
}

/**
 * Interface for leaf directive nodes from remark-directive.
 */
interface LeafDirectiveNode {
  type: "leafDirective";
  name: string;
  children?: PhrasingContent[];
  attributes?: Record<string, string>;
}

/**
 * Converts a container directive (Docusaurus admonition) to a Notion callout block.
 *
 * Admonition types are mapped to emoji icons:
 * - note → 📝
 * - tip → 💡
 * - info → ℹ️
 * - warning → ⚠️
 * - danger → 🔥
 */
function convertContainerDirective(
  node: ContainerDirectiveNode
): NotionBlockPayload | null {
  const admonitionType = node.name.toLowerCase();
  const icon = ADMONITION_TO_ICON[admonitionType];

  if (!icon) {
    // Unknown directive type - log warning and skip
    console.warn(
      `[md-to-blocks] Unknown container directive: ${node.name}, treating as callout with note icon`
    );
  }

  // Convert children to determine callout content
  // First paragraph becomes the callout's rich_text
  // Subsequent blocks become children
  const allRichText: NotionRichTextPayload[] = [];
  const childBlocks: NotionBlockPayload[] = [];
  let foundFirstParagraph = false;

  for (const child of node.children) {
    if (!foundFirstParagraph && child.type === "paragraph") {
      const richText = phrasesToRichText(child.children as PhrasingContent[]);
      allRichText.push(...richText);
      foundFirstParagraph = true;
    } else {
      const converted = convertNode(child);
      if (converted !== null) {
        if (Array.isArray(converted)) {
          childBlocks.push(...converted);
        } else {
          childBlocks.push(converted);
        }
      }
    }
  }

  const block: NotionBlockPayload = {
    type: "callout",
    callout: {
      rich_text: allRichText,
      icon: {
        type: "emoji",
        emoji: icon || "📝",
      },
    },
  };

  if (childBlocks.length > 0) {
    block.callout.children = childBlocks;
  }

  return block;
}

/**
 * Converts HTML nodes, specifically looking for <details><summary> patterns
 * which should become Notion toggle blocks.
 */
function convertHtml(node: Extract<Content, { type: "html" }>): NotionBlockPayload | null {
  const html = node.value.trim();

  // Check for <details> pattern
  if (html.startsWith("<details")) {
    return parseDetailsToToggle(html);
  }

  // Other HTML is not supported - skip with warning
  // But don't warn for common closing tags or empty elements
  if (
    !html.startsWith("</") &&
    !html.startsWith("<!--") &&
    html !== "<br>" &&
    html !== "<br/>" &&
    html !== "<hr>" &&
    html !== "<hr/>"
  ) {
    console.warn(
      `[md-to-blocks] Skipping unsupported HTML: ${html.substring(0, 50)}${html.length > 50 ? "..." : ""}`
    );
  }

  return null;
}

/**
 * Parses a <details><summary>...</summary>...</details> HTML block
 * into a Notion toggle block.
 *
 * This is a simplified regex-based parser. Complex nested HTML may not
 * parse correctly.
 */
function parseDetailsToToggle(html: string): NotionBlockPayload | null {
  // Extract summary text
  const summaryMatch = html.match(/<summary>([\s\S]*?)<\/summary>/i);
  const summaryText = summaryMatch ? summaryMatch[1].trim() : "Toggle";

  // Extract content between </summary> and </details>
  const contentMatch = html.match(
    /<\/summary>([\s\S]*?)<\/details>/i
  );
  const contentText = contentMatch ? contentMatch[1].trim() : "";

  // Create toggle block
  const block: NotionBlockPayload = {
    type: "toggle",
    toggle: {
      rich_text: [
        {
          type: "text",
          text: { content: summaryText },
        },
      ],
    },
  };

  // If there's content, add it as children
  if (contentText) {
    // The content might be markdown - we could re-parse it
    // For now, just add it as a paragraph
    block.toggle.children = [
      {
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: contentText },
            },
          ],
        },
      },
    ];
  }

  return block;
}
