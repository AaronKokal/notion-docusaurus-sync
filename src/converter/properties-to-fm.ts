/**
 * Property-to-Frontmatter Mapper for Notion pages.
 *
 * Converts Notion database properties into Docusaurus frontmatter objects.
 * Handles property type extraction and mapping to appropriate frontmatter keys.
 *
 * Property mappings (Notion → Docusaurus):
 * - Name (title) → title
 * - Slug (rich_text) → slug
 * - Description (rich_text) → description
 * - Tags (multi_select) → tags
 * - Sidebar Position (number) → sidebar_position
 * - Published Date (date) → date
 * - Category (select) → sidebar_label
 * - Status (select) → determines shouldPublish flag
 */

import { stringify } from "yaml";
import type { NotionPageProperty, NotionRichText } from "../notion/types.js";

/**
 * Configuration for property-to-frontmatter mapping.
 */
export interface PropertyMapperConfig {
  /** The Notion property name that contains the publish status (default: "Status") */
  statusProperty?: string;
  /** The status value that indicates a page should be published (default: "Published") */
  publishedStatus?: string;
  /** Custom property name to frontmatter key mappings (optional) */
  propertyMappings?: Record<string, string>;
}

/**
 * Result of property-to-frontmatter conversion.
 */
export interface FrontmatterResult {
  /** The frontmatter object ready for YAML serialization */
  frontmatter: Record<string, unknown>;
  /** Whether this page should be published (based on Status property) */
  shouldPublish: boolean;
}

/**
 * Default property name to frontmatter key mappings.
 * Matches the CMS template from the test Notion database.
 */
const DEFAULT_PROPERTY_MAPPINGS: Record<string, string> = {
  Name: "title",
  Slug: "slug",
  Description: "description",
  Tags: "tags",
  "Sidebar Position": "sidebar_position",
  "Published Date": "date",
  Category: "sidebar_label",
};

/**
 * Extracts plain text from a Notion rich text array.
 *
 * Unlike richTextToMarkdown, this function returns just the plain text
 * without any formatting. Useful for frontmatter values where markdown
 * formatting is not desired.
 *
 * @param richTexts - Array of Notion rich text elements
 * @returns Plain text string concatenated from all elements
 *
 * @example
 * ```ts
 * const text = richTextToPlainText([
 *   { plain_text: "Hello ", ... },
 *   { plain_text: "world", ... },
 * ]);
 * // Returns: "Hello world"
 * ```
 */
export function richTextToPlainText(richTexts: NotionRichText[]): string {
  if (!richTexts || richTexts.length === 0) {
    return "";
  }
  return richTexts.map((rt) => rt.plain_text ?? "").join("");
}

/**
 * Converts Notion page properties to a Docusaurus frontmatter object.
 *
 * Extracts values from Notion property types and maps them to appropriate
 * frontmatter keys. Also determines whether the page should be published
 * based on the Status property.
 *
 * @param properties - The page's properties record from Notion API
 * @param config - Configuration for status property and mappings
 * @returns Object containing frontmatter and shouldPublish flag
 *
 * @example
 * ```ts
 * const result = propertiesToFrontmatter(page.properties, {
 *   statusProperty: "Status",
 *   publishedStatus: "Published",
 * });
 *
 * if (result.shouldPublish) {
 *   // Write file with result.frontmatter
 * }
 * ```
 */
export function propertiesToFrontmatter(
  properties: Record<string, NotionPageProperty>,
  config: PropertyMapperConfig = {}
): FrontmatterResult {
  const {
    statusProperty = "Status",
    publishedStatus = "Published",
    propertyMappings,
  } = config;
  const mappings = { ...DEFAULT_PROPERTY_MAPPINGS, ...propertyMappings };

  const frontmatter: Record<string, unknown> = {};
  let shouldPublish = false; // Default to false unless status matches publishedStatus

  for (const [propertyName, property] of Object.entries(properties)) {
    // Check if this is the status property
    if (propertyName === statusProperty) {
      const statusValue = extractSelectValue(property);
      shouldPublish = statusValue === publishedStatus;
      // Status is not included in frontmatter
      continue;
    }

    // Get the frontmatter key for this property
    const frontmatterKey = mappings[propertyName];
    if (!frontmatterKey) {
      // Property not in mappings, skip it
      continue;
    }

    // Extract the value based on property type
    const value = extractPropertyValue(property);

    // Skip null/empty values
    if (value === null || value === undefined || value === "") {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    frontmatter[frontmatterKey] = value;
  }

  return { frontmatter, shouldPublish };
}

/**
 * Extracts a value from a Notion property based on its type.
 *
 * @param property - A Notion page property
 * @returns The extracted value, or null if empty/unsupported
 */
function extractPropertyValue(property: NotionPageProperty): unknown {
  // Use type assertion since SDK types are complex unions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = property as any;
  const type = prop.type;

  switch (type) {
    case "title":
      return richTextToPlainText(prop.title ?? []);

    case "rich_text":
      return richTextToPlainText(prop.rich_text ?? []);

    case "select":
      return extractSelectValue(property);

    case "multi_select":
      return extractMultiSelectValue(property);

    case "number":
      return prop.number;

    case "date":
      return extractDateValue(property);

    case "checkbox":
      return prop.checkbox;

    case "url":
      return prop.url;

    case "email":
      return prop.email;

    case "phone_number":
      return prop.phone_number;

    case "status":
      // Status is handled like select for value extraction
      return prop.status?.name ?? null;

    case "formula":
      return extractFormulaValue(property);

    case "created_time":
      return prop.created_time;

    case "last_edited_time":
      return prop.last_edited_time;

    default:
      // Unsupported property types return null
      return null;
  }
}

/**
 * Extracts the name from a select property.
 */
function extractSelectValue(property: NotionPageProperty): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = property as any;

  // Handle both 'select' and 'status' types
  if (prop.type === "select" && prop.select) {
    return prop.select.name ?? null;
  }
  if (prop.type === "status" && prop.status) {
    return prop.status.name ?? null;
  }

  return null;
}

/**
 * Extracts an array of names from a multi_select property.
 */
function extractMultiSelectValue(property: NotionPageProperty): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = property as any;

  if (prop.type !== "multi_select" || !prop.multi_select) {
    return [];
  }

  return prop.multi_select.map(
    (item: { name: string }) => item.name
  );
}

/**
 * Extracts a date string from a date property.
 * Returns the start date in ISO format (YYYY-MM-DD).
 */
function extractDateValue(property: NotionPageProperty): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = property as any;

  if (prop.type !== "date" || !prop.date) {
    return null;
  }

  // Return just the date portion (YYYY-MM-DD) from the start date
  const startDate = prop.date.start;
  if (!startDate) {
    return null;
  }

  // If it's a datetime, extract just the date part
  // Otherwise return as-is (it's already just a date)
  if (startDate.includes("T")) {
    return startDate.split("T")[0];
  }

  return startDate;
}

/**
 * Extracts a value from a formula property.
 */
function extractFormulaValue(property: NotionPageProperty): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = property as any;

  if (prop.type !== "formula" || !prop.formula) {
    return null;
  }

  const formula = prop.formula;

  switch (formula.type) {
    case "string":
      return formula.string;
    case "number":
      return formula.number;
    case "boolean":
      return formula.boolean;
    case "date":
      return formula.date?.start ?? null;
    default:
      return null;
  }
}

/**
 * Converts a frontmatter object to a YAML string with delimiters.
 *
 * The output is wrapped in `---` delimiters suitable for Docusaurus
 * markdown files.
 *
 * @param frontmatter - The frontmatter object to serialize
 * @returns YAML string with leading and trailing `---` delimiters
 *
 * @example
 * ```ts
 * const yaml = frontmatterToYaml({
 *   title: "Getting Started",
 *   slug: "getting-started",
 *   tags: ["tutorial", "beginner"],
 * });
 * // Returns:
 * // ---
 * // title: Getting Started
 * // slug: getting-started
 * // tags:
 * //   - tutorial
 * //   - beginner
 * // ---
 * ```
 */
export function frontmatterToYaml(frontmatter: Record<string, unknown>): string {
  if (Object.keys(frontmatter).length === 0) {
    return "---\n---";
  }

  // Use yaml package to stringify
  // The yaml package automatically quotes strings that need it (special chars, etc.)
  const yamlContent = stringify(frontmatter);

  return `---\n${yamlContent}---`;
}
