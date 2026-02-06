/**
 * Markdown Parser for Docusaurus files.
 *
 * Parses markdown files into frontmatter + mdast AST.
 * Uses unified/remark pipeline with:
 * - remark-parse: Markdown → mdast
 * - remark-gfm: GFM support (tables, strikethrough, task lists)
 * - remark-directive: Docusaurus admonitions (:::note, :::tip, etc.)
 *
 * Frontmatter is extracted manually (not via remark-frontmatter) to keep
 * dependencies minimal.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { parse as parseYaml } from "yaml";
import type { Root } from "mdast";

/**
 * Result of parsing a markdown file.
 */
export interface ParsedMarkdownFile {
  /** Parsed frontmatter as key-value object */
  frontmatter: Record<string, unknown>;
  /** mdast AST of the markdown body */
  ast: Root;
}

/**
 * Result of frontmatter extraction.
 */
export interface FrontmatterExtractionResult {
  /** Parsed frontmatter as key-value object */
  frontmatter: Record<string, unknown>;
  /** Markdown body without frontmatter */
  body: string;
}

/**
 * Extracts YAML frontmatter from markdown content.
 *
 * Frontmatter must be at the very start of the file, delimited by `---`.
 * Handles edge cases:
 * - No frontmatter → empty object, full content as body
 * - Empty frontmatter (`---\n---`) → empty object, rest as body
 * - Frontmatter only (no body) → parsed frontmatter, empty body
 *
 * @param content - Raw markdown file content
 * @returns Object with parsed frontmatter and remaining body
 *
 * @example
 * ```ts
 * const result = extractFrontmatter(`---
 * title: Hello
 * ---
 * # Content`);
 * // result.frontmatter = { title: "Hello" }
 * // result.body = "# Content"
 * ```
 */
export function extractFrontmatter(content: string): FrontmatterExtractionResult {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, "\n");

  // Must start with `---` followed by newline
  if (!normalized.startsWith("---\n") && normalized !== "---") {
    return { frontmatter: {}, body: normalized };
  }

  // Find the closing `---`
  // Start searching after the opening delimiter
  const closingIndex = normalized.indexOf("\n---", 4);

  if (closingIndex === -1) {
    // No closing delimiter found - treat entire content as frontmatter-less
    // This handles the edge case of content that starts with "---" but has no closing
    return { frontmatter: {}, body: normalized };
  }

  // Extract YAML content between delimiters
  const yamlContent = normalized.slice(4, closingIndex);

  // Parse YAML
  let frontmatter: Record<string, unknown> = {};
  if (yamlContent.trim()) {
    try {
      const parsed = parseYaml(yamlContent);
      // Ensure parsed result is an object
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        frontmatter = parsed as Record<string, unknown>;
      }
    } catch {
      // Invalid YAML - return empty frontmatter
      console.warn("Failed to parse frontmatter YAML, treating as no frontmatter");
      return { frontmatter: {}, body: normalized };
    }
  }

  // Extract body after closing delimiter
  // Skip the `\n---` (4 chars) and any trailing newline
  let body = normalized.slice(closingIndex + 4);
  // Remove leading newline if present (common after closing `---`)
  if (body.startsWith("\n")) {
    body = body.slice(1);
  }

  return { frontmatter, body };
}

/**
 * Parses markdown body content into an mdast AST.
 *
 * Uses the unified/remark pipeline with:
 * - remark-parse: Core markdown parsing
 * - remark-gfm: GitHub Flavored Markdown (tables, strikethrough, task lists)
 * - remark-directive: Docusaurus admonitions (:::note, :::tip, etc.)
 *
 * @param body - Markdown content (without frontmatter)
 * @returns mdast Root node containing the AST
 *
 * @example
 * ```ts
 * const ast = parseMarkdown("# Hello\n\nParagraph with **bold**.");
 * // ast.type === "root"
 * // ast.children[0].type === "heading"
 * // ast.children[1].type === "paragraph"
 * ```
 */
export function parseMarkdown(body: string): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective);

  // Parse returns a Root node
  return processor.parse(body);
}

/**
 * Parses a complete markdown file including frontmatter and body.
 *
 * Combines `extractFrontmatter` and `parseMarkdown` into a single call.
 * This is the main entry point for processing markdown files.
 *
 * @param content - Raw markdown file content (including frontmatter)
 * @returns Object with parsed frontmatter and mdast AST
 *
 * @example
 * ```ts
 * const { frontmatter, ast } = parseMarkdownFile(`---
 * title: Getting Started
 * tags:
 *   - tutorial
 * ---
 * # Introduction
 *
 * Welcome to the guide.
 * `);
 *
 * console.log(frontmatter.title); // "Getting Started"
 * console.log(ast.children[0].type); // "heading"
 * ```
 */
export function parseMarkdownFile(content: string): ParsedMarkdownFile {
  const { frontmatter, body } = extractFrontmatter(content);
  const ast = parseMarkdown(body);

  return { frontmatter, ast };
}
