/**
 * Rich text to Markdown converter for Notion content.
 *
 * Converts Notion rich text arrays (as returned by the SDK) into
 * Markdown-formatted strings for use in Docusaurus documentation.
 */

import type { NotionRichText } from "../notion/types.js";

/**
 * Converts a Notion rich text array to a Markdown string.
 *
 * Handles the following annotations:
 * - **bold** -> `**text**`
 * - *italic* -> `*text*`
 * - ~~strikethrough~~ -> `~~text~~`
 * - `code` -> `` `text` ``
 * - links -> `[text](url)`
 * - underline -> ignored (no standard Markdown equivalent)
 * - color -> ignored (no standard Markdown equivalent)
 *
 * Multiple annotations are combined correctly:
 * - bold + italic -> `***text***`
 * - bold + link -> `[**text**](url)`
 *
 * @param richTexts - Array of Notion rich text elements
 * @returns Markdown-formatted string
 *
 * @example
 * ```ts
 * const md = richTextToMarkdown([
 *   { type: "text", text: { content: "Hello " }, plain_text: "Hello ", annotations: { bold: false, ... } },
 *   { type: "text", text: { content: "world" }, plain_text: "world", annotations: { bold: true, ... } },
 * ]);
 * // Returns: "Hello **world**"
 * ```
 */
export function richTextToMarkdown(richTexts: NotionRichText[]): string {
  // Handle empty/null input
  if (!richTexts || richTexts.length === 0) {
    return "";
  }

  return richTexts.map(formatRichTextElement).join("");
}

/**
 * Formats a single rich text element to Markdown.
 */
function formatRichTextElement(element: NotionRichText): string {
  // Get the plain text content
  let text = element.plain_text ?? "";

  // If there's no text, return empty
  if (!text) {
    return "";
  }

  const annotations = element.annotations;

  // Apply inline formatting in the correct order
  // Code should be applied first (innermost) to prevent issues with special chars
  if (annotations?.code) {
    text = `\`${text}\``;
  }

  // Apply strikethrough
  if (annotations?.strikethrough) {
    text = `~~${text}~~`;
  }

  // Apply bold and italic
  // Combined bold+italic uses *** wrapper
  if (annotations?.bold && annotations?.italic) {
    text = `***${text}***`;
  } else if (annotations?.bold) {
    text = `**${text}**`;
  } else if (annotations?.italic) {
    text = `*${text}*`;
  }

  // Apply link (outermost wrapper)
  // Check both href and text.link for the URL
  const linkUrl = element.href ?? getTextLink(element);
  if (linkUrl) {
    text = `[${text}](${linkUrl})`;
  }

  // Underline and color are intentionally ignored
  // (no standard Markdown equivalent, Docusaurus doesn't use them)

  return text;
}

/**
 * Extracts the link URL from a text element's text.link property.
 * Returns null if no link is present.
 */
function getTextLink(element: NotionRichText): string | null {
  if (element.type === "text" && element.text?.link) {
    return element.text.link.url;
  }
  return null;
}
