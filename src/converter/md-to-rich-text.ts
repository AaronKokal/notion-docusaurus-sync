/**
 * Markdown to Notion rich text converter.
 *
 * Converts mdast phrasing content (inline nodes) to Notion rich_text arrays.
 * This is the reverse of `rich-text.ts`'s `richTextToMarkdown()`.
 *
 * Handles the following mdast node types:
 * - text: Plain text content
 * - strong: **bold** -> annotations.bold: true
 * - emphasis: *italic* -> annotations.italic: true
 * - inlineCode: `code` -> annotations.code: true
 * - delete: ~~strikethrough~~ -> annotations.strikethrough: true
 * - link: [text](url) -> text.link.url set
 *
 * Multiple annotations are combined correctly via recursive traversal
 * with an annotation stack.
 */

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
 * Notion rich text annotations.
 * Controls text formatting (bold, italic, etc.).
 */
export interface NotionAnnotations {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
}

/**
 * Notion rich text element for page/block creation payloads.
 *
 * This is the payload format for creating/updating rich text content.
 * Different from the read response format (RichTextItemResponse).
 */
export interface NotionRichTextPayload {
  type: "text";
  text: {
    content: string;
    link?: {
      url: string;
    } | null;
  };
  annotations?: NotionAnnotations;
}

/**
 * Converts mdast phrasing content (inline nodes) to Notion rich_text array.
 *
 * Walks the phrasing content tree depth-first, maintaining an "annotation stack".
 * When entering `strong`, accumulates `bold: true`; when entering `emphasis`,
 * accumulates `italic: true`. At leaf `text` nodes, emits a rich_text element
 * with the accumulated annotations.
 *
 * @param nodes - Array of mdast phrasing content nodes
 * @returns Array of Notion rich_text payload objects
 *
 * @example
 * ```ts
 * // Plain text
 * const result = phrasesToRichText([{ type: "text", value: "Hello" }]);
 * // [{ type: "text", text: { content: "Hello" }, annotations: {} }]
 *
 * // Bold text
 * const result = phrasesToRichText([{
 *   type: "strong",
 *   children: [{ type: "text", value: "bold" }]
 * }]);
 * // [{ type: "text", text: { content: "bold" }, annotations: { bold: true } }]
 *
 * // Combined formatting
 * const result = phrasesToRichText([{
 *   type: "strong",
 *   children: [{
 *     type: "emphasis",
 *     children: [{ type: "text", value: "bold italic" }]
 *   }]
 * }]);
 * // [{ type: "text", text: { content: "bold italic" }, annotations: { bold: true, italic: true } }]
 * ```
 */
export function phrasesToRichText(
  nodes: PhrasingContent[]
): NotionRichTextPayload[] {
  if (!nodes || nodes.length === 0) {
    return [];
  }

  const result: NotionRichTextPayload[] = [];

  for (const node of nodes) {
    const converted = convertPhrasingNode(node, {}, null);
    result.push(...converted);
  }

  return result;
}

/**
 * Internal state for annotation accumulation during traversal.
 */
interface AnnotationState {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  code?: boolean;
}

/**
 * Converts a single phrasing node to rich_text elements.
 *
 * Recursively processes the node tree, accumulating annotations as it descends.
 * When reaching a text node, emits a rich_text element with all accumulated
 * annotations and link URL (if within a link).
 *
 * @param node - The phrasing content node to convert
 * @param annotations - Accumulated annotations from parent nodes
 * @param linkUrl - Link URL if within a link node, null otherwise
 * @returns Array of rich_text payload objects
 */
function convertPhrasingNode(
  node: PhrasingContent,
  annotations: AnnotationState,
  linkUrl: string | null
): NotionRichTextPayload[] {
  switch (node.type) {
    case "text":
      return [createRichTextElement(node.value, annotations, linkUrl)];

    case "strong":
      return convertChildren(
        (node as Strong).children,
        { ...annotations, bold: true },
        linkUrl
      );

    case "emphasis":
      return convertChildren(
        (node as Emphasis).children,
        { ...annotations, italic: true },
        linkUrl
      );

    case "inlineCode":
      // Inline code is a leaf node (no children), its content is in `value`
      return [
        createRichTextElement(
          (node as InlineCode).value,
          { ...annotations, code: true },
          linkUrl
        ),
      ];

    case "delete":
      return convertChildren(
        (node as Delete).children,
        { ...annotations, strikethrough: true },
        linkUrl
      );

    case "link":
      // Link wraps children and adds a URL
      return convertChildren(
        (node as Link).children,
        annotations,
        (node as Link).url
      );

    case "break":
      // Line break - render as newline character
      return [createRichTextElement("\n", annotations, linkUrl)];

    case "html":
      // Inline HTML - render as plain text (Notion doesn't support HTML)
      return [createRichTextElement(node.value, annotations, linkUrl)];

    case "image":
      // Inline image - render alt text as placeholder
      // Note: Block-level images are handled by md-to-blocks.ts
      const alt = node.alt || "image";
      return [createRichTextElement(`[${alt}]`, annotations, node.url)];

    case "imageReference":
    case "linkReference":
    case "footnoteReference":
      // These are reference-style nodes that require definition resolution
      // For now, skip them (they'd need the full document context)
      console.warn(
        `[md-to-rich-text] Skipping unsupported phrasing node type: ${node.type}`
      );
      return [];

    case "textDirective":
      // Text directives from remark-directive (e.g., :abbr[HTML]{title="..."})
      // These are inline directives - convert their children as text
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const directive = node as any;
      if (directive.children && Array.isArray(directive.children)) {
        return convertChildren(directive.children, annotations, linkUrl);
      }
      return [];

    default:
      // Unknown phrasing node type - log warning and skip
      console.warn(
        `[md-to-rich-text] Unknown phrasing node type: ${(node as PhrasingContent).type}`
      );
      return [];
  }
}

/**
 * Converts an array of child phrasing nodes.
 *
 * @param children - Array of phrasing content nodes
 * @param annotations - Accumulated annotations to pass to children
 * @param linkUrl - Link URL if within a link, null otherwise
 * @returns Flattened array of rich_text payload objects
 */
function convertChildren(
  children: PhrasingContent[],
  annotations: AnnotationState,
  linkUrl: string | null
): NotionRichTextPayload[] {
  const result: NotionRichTextPayload[] = [];

  for (const child of children) {
    result.push(...convertPhrasingNode(child, annotations, linkUrl));
  }

  return result;
}

/**
 * Creates a Notion rich_text element with the given content and formatting.
 *
 * @param content - The text content
 * @param annotations - Text formatting annotations
 * @param linkUrl - Optional link URL
 * @returns A Notion rich_text payload object
 */
function createRichTextElement(
  content: string,
  annotations: AnnotationState,
  linkUrl: string | null
): NotionRichTextPayload {
  const element: NotionRichTextPayload = {
    type: "text",
    text: {
      content,
    },
    annotations: {},
  };

  // Add link if present
  if (linkUrl) {
    element.text.link = { url: linkUrl };
  }

  // Add non-default annotations
  // Only include annotations that are true to keep payloads minimal
  if (annotations.bold) {
    element.annotations!.bold = true;
  }
  if (annotations.italic) {
    element.annotations!.italic = true;
  }
  if (annotations.strikethrough) {
    element.annotations!.strikethrough = true;
  }
  if (annotations.code) {
    element.annotations!.code = true;
  }

  return element;
}
