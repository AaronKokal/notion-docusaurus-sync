/**
 * Frontmatter-to-Properties Mapper for Notion pages.
 *
 * Converts Docusaurus frontmatter objects back to Notion property update payloads.
 * This is the reverse of `properties-to-fm.ts`.
 *
 * Frontmatter mappings (Docusaurus -> Notion):
 * - title -> Name (title)
 * - slug -> Slug (rich_text)
 * - description -> Description (rich_text)
 * - tags -> Tags (multi_select)
 * - sidebar_position -> Sidebar Position (number)
 * - date -> Published Date (date)
 * - sidebar_label -> Category (select)
 * - status -> Status (select)
 */

import type { FrontmatterToPropertiesConfig } from "../types.js";

/**
 * Notion property type identifiers.
 * Used to determine which payload format to create for each property.
 */
export type NotionPropertyType =
  | "title"
  | "rich_text"
  | "multi_select"
  | "number"
  | "date"
  | "select";

/**
 * Default frontmatter key to Notion property name mappings.
 * This is the reverse of DEFAULT_PROPERTY_MAPPINGS in properties-to-fm.ts.
 */
const DEFAULT_FRONTMATTER_MAPPINGS: Record<string, string> = {
  title: "Name",
  slug: "Slug",
  description: "Description",
  tags: "Tags",
  sidebar_position: "Sidebar Position",
  date: "Published Date",
  sidebar_label: "Category",
  status: "Status",
  category: "Category",
};

/**
 * Default Notion property types for each property name.
 * Tells the converter which payload format to create.
 */
const DEFAULT_PROPERTY_TYPES: Record<string, NotionPropertyType> = {
  Name: "title",
  Slug: "rich_text",
  Description: "rich_text",
  Tags: "multi_select",
  "Sidebar Position": "number",
  "Published Date": "date",
  Category: "select",
  Status: "select",
};

/**
 * Creates a Notion title property payload.
 *
 * @param value - The title string
 * @returns Notion title property payload
 *
 * @example
 * ```ts
 * createTitlePayload("Getting Started")
 * // Returns: { title: [{ text: { content: "Getting Started" } }] }
 * ```
 */
function createTitlePayload(value: string): { title: Array<{ text: { content: string } }> } {
  return {
    title: [{ text: { content: value } }],
  };
}

/**
 * Creates a Notion rich_text property payload.
 *
 * @param value - The text string
 * @returns Notion rich_text property payload
 *
 * @example
 * ```ts
 * createRichTextPayload("getting-started")
 * // Returns: { rich_text: [{ text: { content: "getting-started" } }] }
 * ```
 */
function createRichTextPayload(value: string): { rich_text: Array<{ text: { content: string } }> } {
  return {
    rich_text: [{ text: { content: value } }],
  };
}

/**
 * Creates a Notion multi_select property payload.
 *
 * @param values - Array of tag names
 * @returns Notion multi_select property payload
 *
 * @example
 * ```ts
 * createMultiSelectPayload(["tutorial", "beginner"])
 * // Returns: { multi_select: [{ name: "tutorial" }, { name: "beginner" }] }
 * ```
 */
function createMultiSelectPayload(values: string[]): { multi_select: Array<{ name: string }> } {
  return {
    multi_select: values.map((name) => ({ name })),
  };
}

/**
 * Creates a Notion number property payload.
 *
 * @param value - The number value
 * @returns Notion number property payload
 *
 * @example
 * ```ts
 * createNumberPayload(3)
 * // Returns: { number: 3 }
 * ```
 */
function createNumberPayload(value: number): { number: number } {
  return {
    number: value,
  };
}

/**
 * Creates a Notion date property payload.
 *
 * @param value - The date string in YYYY-MM-DD format
 * @returns Notion date property payload
 *
 * @example
 * ```ts
 * createDatePayload("2024-01-15")
 * // Returns: { date: { start: "2024-01-15" } }
 * ```
 */
function createDatePayload(value: string): { date: { start: string } } {
  return {
    date: { start: value },
  };
}

/**
 * Creates a Notion select property payload.
 *
 * @param value - The option name
 * @returns Notion select property payload
 *
 * @example
 * ```ts
 * createSelectPayload("Guides")
 * // Returns: { select: { name: "Guides" } }
 * ```
 */
function createSelectPayload(value: string): { select: { name: string } } {
  return {
    select: { name: value },
  };
}

/**
 * Checks if a value is empty or should be skipped.
 *
 * @param value - The value to check
 * @returns True if the value should be skipped
 */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string" && value.trim() === "") {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
}

/**
 * Validates and normalizes a string value.
 * Returns null if the value is not a valid non-empty string.
 *
 * @param value - The value to validate
 * @param key - The frontmatter key (for error messages)
 * @returns The string value or null if invalid
 */
function validateString(value: unknown, key: string): string | null {
  if (typeof value !== "string") {
    if (value !== null && value !== undefined) {
      console.warn(
        `[fm-to-properties] Expected string for '${key}', got ${typeof value}. Skipping.`
      );
    }
    return null;
  }
  return value;
}

/**
 * Validates and normalizes a number value.
 * Returns null if the value is not a valid number.
 *
 * @param value - The value to validate
 * @param key - The frontmatter key (for error messages)
 * @returns The number value or null if invalid
 */
function validateNumber(value: unknown, key: string): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  // Try to parse string as number
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  if (value !== null && value !== undefined) {
    console.warn(
      `[fm-to-properties] Expected number for '${key}', got ${typeof value}. Skipping.`
    );
  }
  return null;
}

/**
 * Validates and normalizes an array of strings.
 * Returns null if the value is not a valid array.
 *
 * @param value - The value to validate
 * @param key - The frontmatter key (for error messages)
 * @returns The string array or null if invalid
 */
function validateStringArray(value: unknown, key: string): string[] | null {
  if (!Array.isArray(value)) {
    if (value !== null && value !== undefined) {
      console.warn(
        `[fm-to-properties] Expected array for '${key}', got ${typeof value}. Skipping.`
      );
    }
    return null;
  }
  // Filter to only strings and convert non-strings
  const result = value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      // Convert numbers and booleans to strings
      if (typeof item === "number" || typeof item === "boolean") {
        return String(item);
      }
      return null;
    })
    .filter((item): item is string => item !== null);

  return result.length > 0 ? result : null;
}

/**
 * Validates a date string.
 * Accepts YYYY-MM-DD format or Date objects.
 *
 * @param value - The value to validate
 * @param key - The frontmatter key (for error messages)
 * @returns The date string in YYYY-MM-DD format or null if invalid
 */
function validateDate(value: unknown, key: string): string | null {
  if (value instanceof Date) {
    // Convert Date object to YYYY-MM-DD string
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "string") {
    // Check if it's a valid date format (YYYY-MM-DD or ISO)
    const dateRegex = /^\d{4}-\d{2}-\d{2}/;
    if (dateRegex.test(value)) {
      // Extract just the date part
      return value.split("T")[0];
    }
    console.warn(
      `[fm-to-properties] Invalid date format for '${key}': '${value}'. Expected YYYY-MM-DD. Skipping.`
    );
    return null;
  }
  if (value !== null && value !== undefined) {
    console.warn(
      `[fm-to-properties] Expected date string for '${key}', got ${typeof value}. Skipping.`
    );
  }
  return null;
}

/**
 * Converts a single frontmatter value to a Notion property payload.
 *
 * @param propertyName - The Notion property name
 * @param propertyType - The Notion property type
 * @param value - The frontmatter value
 * @param fmKey - The original frontmatter key (for error messages)
 * @returns The Notion property payload or null if invalid
 */
function convertValue(
  propertyName: string,
  propertyType: NotionPropertyType,
  value: unknown,
  fmKey: string
): unknown {
  switch (propertyType) {
    case "title": {
      const str = validateString(value, fmKey);
      return str !== null ? createTitlePayload(str) : null;
    }

    case "rich_text": {
      const str = validateString(value, fmKey);
      return str !== null ? createRichTextPayload(str) : null;
    }

    case "multi_select": {
      const arr = validateStringArray(value, fmKey);
      return arr !== null ? createMultiSelectPayload(arr) : null;
    }

    case "number": {
      const num = validateNumber(value, fmKey);
      return num !== null ? createNumberPayload(num) : null;
    }

    case "date": {
      const date = validateDate(value, fmKey);
      return date !== null ? createDatePayload(date) : null;
    }

    case "select": {
      const str = validateString(value, fmKey);
      return str !== null ? createSelectPayload(str) : null;
    }

    default:
      console.warn(
        `[fm-to-properties] Unknown property type '${propertyType}' for '${propertyName}'. Skipping.`
      );
      return null;
  }
}

/**
 * Converts Docusaurus frontmatter to Notion property update payloads.
 *
 * Maps frontmatter keys to Notion property names and converts values
 * to the appropriate Notion property payload format.
 *
 * @param frontmatter - The frontmatter object from a markdown file
 * @param config - Configuration for property mappings and types
 * @returns Object containing Notion property payloads keyed by property name
 *
 * @example
 * ```ts
 * const properties = frontmatterToProperties({
 *   title: "Getting Started",
 *   slug: "getting-started",
 *   tags: ["tutorial", "beginner"],
 *   sidebar_position: 3,
 *   date: "2024-01-15",
 * });
 *
 * // Returns:
 * // {
 * //   Name: { title: [{ text: { content: "Getting Started" } }] },
 * //   Slug: { rich_text: [{ text: { content: "getting-started" } }] },
 * //   Tags: { multi_select: [{ name: "tutorial" }, { name: "beginner" }] },
 * //   "Sidebar Position": { number: 3 },
 * //   "Published Date": { date: { start: "2024-01-15" } },
 * // }
 * ```
 */
export function frontmatterToProperties(
  frontmatter: Record<string, unknown>,
  config: FrontmatterToPropertiesConfig = {}
): Record<string, unknown> {
  const { propertyMappings } = config;

  // Merge custom mappings with defaults (custom takes precedence)
  const fmToPropertyMappings = { ...DEFAULT_FRONTMATTER_MAPPINGS, ...propertyMappings };

  // Build property types map (can be extended via config in the future)
  const propertyTypes = { ...DEFAULT_PROPERTY_TYPES };

  const result: Record<string, unknown> = {};

  for (const [fmKey, value] of Object.entries(frontmatter)) {
    // Skip empty values
    if (isEmptyValue(value)) {
      continue;
    }

    // Get the Notion property name for this frontmatter key
    const propertyName = fmToPropertyMappings[fmKey];
    if (!propertyName) {
      console.warn(
        `[fm-to-properties] Unknown frontmatter key '${fmKey}'. Skipping.`
      );
      continue;
    }

    // Get the property type
    const propertyType = propertyTypes[propertyName];
    if (!propertyType) {
      console.warn(
        `[fm-to-properties] No property type defined for '${propertyName}'. Skipping.`
      );
      continue;
    }

    // Convert the value
    const payload = convertValue(propertyName, propertyType, value, fmKey);
    if (payload !== null) {
      result[propertyName] = payload;
    }
  }

  return result;
}
