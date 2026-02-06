/**
 * Mock factories for Notion API response shapes.
 *
 * These helpers produce realistic objects that match @notionhq/client v5 SDK types
 * for use in unit tests without hitting the actual API.
 */

/**
 * Annotations for rich text elements.
 */
export interface MockAnnotations {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  color?:
    | "default"
    | "gray"
    | "brown"
    | "orange"
    | "yellow"
    | "green"
    | "blue"
    | "purple"
    | "pink"
    | "red"
    | "default_background"
    | "gray_background"
    | "brown_background"
    | "orange_background"
    | "yellow_background"
    | "green_background"
    | "blue_background"
    | "purple_background"
    | "pink_background"
    | "red_background";
}

/**
 * Represents a rich text item response from the Notion API.
 */
export interface MockRichTextItem {
  type: "text" | "mention" | "equation";
  text?: {
    content: string;
    link: { url: string } | null;
  };
  mention?: Record<string, unknown>;
  equation?: { expression: string };
  plain_text: string;
  href: string | null;
  annotations: Required<MockAnnotations>;
}

/**
 * Creates a mock rich text array element.
 *
 * @param text - The plain text content
 * @param annotations - Optional formatting annotations
 * @param link - Optional URL to create a link
 * @returns A rich text item matching Notion API response shape
 */
export function mockRichText(
  text: string,
  annotations: MockAnnotations = {},
  link?: string
): MockRichTextItem {
  return {
    type: "text",
    text: {
      content: text,
      link: link ? { url: link } : null,
    },
    plain_text: text,
    href: link ?? null,
    annotations: {
      bold: annotations.bold ?? false,
      italic: annotations.italic ?? false,
      strikethrough: annotations.strikethrough ?? false,
      underline: annotations.underline ?? false,
      code: annotations.code ?? false,
      color: annotations.color ?? "default",
    },
  };
}

/**
 * Block types supported by the mock factory.
 */
export type MockBlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "to_do"
  | "toggle"
  | "code"
  | "quote"
  | "callout"
  | "divider"
  | "table"
  | "table_row"
  | "image"
  | "bookmark"
  | "child_page"
  | "child_database"
  | "embed"
  | "video"
  | "file"
  | "pdf"
  | "audio"
  | "equation"
  | "synced_block"
  | "column"
  | "column_list"
  | "link_preview"
  | "link_to_page"
  | "breadcrumb";

/**
 * Options for creating mock blocks.
 */
export interface MockBlockOptions {
  /** Block ID override */
  id?: string;
  /** Whether block has children */
  hasChildren?: boolean;
  /** Block creation time */
  createdTime?: string;
  /** Block last edited time */
  lastEditedTime?: string;
  /** Whether block is archived */
  archived?: boolean;
  /** For code blocks: language */
  language?: string;
  /** For callout blocks: icon emoji */
  icon?: string;
  /** For to_do blocks: checked state */
  checked?: boolean;
  /** For image blocks: URL */
  url?: string;
  /** For image blocks: caption */
  caption?: string;
  /** For table blocks: column count */
  tableWidth?: number;
  /** For table blocks: has header row */
  hasRowHeader?: boolean;
  /** For table blocks: has header column */
  hasColumnHeader?: boolean;
  /** For table_row blocks: cells content */
  cells?: string[][];
  /** For bookmark blocks: URL */
  bookmarkUrl?: string;
}

/**
 * Base structure for a mock block response.
 */
export interface MockBlock {
  object: "block";
  id: string;
  type: MockBlockType;
  created_time: string;
  created_by: { object: "user"; id: string };
  last_edited_time: string;
  last_edited_by: { object: "user"; id: string };
  has_children: boolean;
  archived: boolean;
  in_trash: boolean;
  parent: { type: "page_id"; page_id: string };
  [key: string]: unknown;
}

let blockIdCounter = 0;

/**
 * Generates a unique mock block ID.
 */
function generateBlockId(): string {
  blockIdCounter++;
  return `block-${blockIdCounter.toString().padStart(4, "0")}-${Date.now().toString(36)}`;
}

/**
 * Creates a mock block object matching Notion API response shape.
 *
 * @param type - The type of block to create
 * @param content - The text content (for text-based blocks) or configuration object
 * @param options - Additional options for the block
 * @returns A block object matching Notion API response shape
 */
export function mockBlock(
  type: MockBlockType,
  content: string | MockRichTextItem[] = "",
  options: MockBlockOptions = {}
): MockBlock {
  const now = new Date().toISOString();
  const id = options.id ?? generateBlockId();

  const richText: MockRichTextItem[] =
    typeof content === "string"
      ? content
        ? [mockRichText(content)]
        : []
      : content;

  const baseBlock: MockBlock = {
    object: "block",
    id,
    type,
    created_time: options.createdTime ?? now,
    created_by: { object: "user", id: "user-001" },
    last_edited_time: options.lastEditedTime ?? now,
    last_edited_by: { object: "user", id: "user-001" },
    has_children: options.hasChildren ?? false,
    archived: options.archived ?? false,
    in_trash: false,
    parent: { type: "page_id", page_id: "page-001" },
  };

  // Add type-specific content
  switch (type) {
    case "paragraph":
      baseBlock.paragraph = {
        rich_text: richText,
        color: "default",
      };
      break;

    case "heading_1":
      baseBlock.heading_1 = {
        rich_text: richText,
        is_toggleable: false,
        color: "default",
      };
      break;

    case "heading_2":
      baseBlock.heading_2 = {
        rich_text: richText,
        is_toggleable: false,
        color: "default",
      };
      break;

    case "heading_3":
      baseBlock.heading_3 = {
        rich_text: richText,
        is_toggleable: false,
        color: "default",
      };
      break;

    case "bulleted_list_item":
      baseBlock.bulleted_list_item = {
        rich_text: richText,
        color: "default",
      };
      break;

    case "numbered_list_item":
      baseBlock.numbered_list_item = {
        rich_text: richText,
        color: "default",
      };
      break;

    case "to_do":
      baseBlock.to_do = {
        rich_text: richText,
        checked: options.checked ?? false,
        color: "default",
      };
      break;

    case "toggle":
      baseBlock.toggle = {
        rich_text: richText,
        color: "default",
      };
      break;

    case "code":
      baseBlock.code = {
        rich_text: richText,
        caption: [],
        language: options.language ?? "plain text",
      };
      break;

    case "quote":
      baseBlock.quote = {
        rich_text: richText,
        color: "default",
      };
      break;

    case "callout":
      baseBlock.callout = {
        rich_text: richText,
        icon: options.icon
          ? { type: "emoji", emoji: options.icon }
          : { type: "emoji", emoji: "💡" },
        color: "default",
      };
      break;

    case "divider":
      baseBlock.divider = {};
      break;

    case "table":
      baseBlock.table = {
        table_width: options.tableWidth ?? 3,
        has_row_header: options.hasRowHeader ?? true,
        has_column_header: options.hasColumnHeader ?? false,
      };
      baseBlock.has_children = true;
      break;

    case "table_row":
      baseBlock.table_row = {
        cells: (options.cells ?? [["Cell 1", "Cell 2", "Cell 3"]]).map((row) =>
          row.map((cell) => [mockRichText(cell)])
        ),
      };
      break;

    case "image":
      baseBlock.image = {
        type: "external",
        external: {
          url: options.url ?? "https://example.com/image.png",
        },
        caption: options.caption ? [mockRichText(options.caption)] : [],
      };
      break;

    case "bookmark":
      baseBlock.bookmark = {
        url: options.bookmarkUrl ?? "https://example.com",
        caption: [],
      };
      break;

    case "equation":
      baseBlock.equation = {
        expression: typeof content === "string" ? content : "E = mc^2",
      };
      break;

    case "child_page":
      baseBlock.child_page = {
        title: typeof content === "string" ? content : "Child Page",
      };
      break;

    case "child_database":
      baseBlock.child_database = {
        title: typeof content === "string" ? content : "Child Database",
      };
      break;

    case "embed":
      baseBlock.embed = {
        url: options.url ?? "https://example.com/embed",
        caption: [],
      };
      break;

    case "video":
      baseBlock.video = {
        type: "external",
        external: {
          url: options.url ?? "https://example.com/video.mp4",
        },
        caption: [],
      };
      break;

    case "file":
      baseBlock.file = {
        type: "external",
        external: {
          url: options.url ?? "https://example.com/file.pdf",
        },
        caption: [],
        name: "file.pdf",
      };
      break;

    case "pdf":
      baseBlock.pdf = {
        type: "external",
        external: {
          url: options.url ?? "https://example.com/document.pdf",
        },
        caption: [],
      };
      break;

    case "audio":
      baseBlock.audio = {
        type: "external",
        external: {
          url: options.url ?? "https://example.com/audio.mp3",
        },
        caption: [],
      };
      break;

    case "synced_block":
      baseBlock.synced_block = {
        synced_from: null,
      };
      break;

    case "column":
      baseBlock.column = {};
      baseBlock.has_children = true;
      break;

    case "column_list":
      baseBlock.column_list = {};
      baseBlock.has_children = true;
      break;

    case "link_preview":
      baseBlock.link_preview = {
        url: options.url ?? "https://example.com",
      };
      break;

    case "link_to_page":
      baseBlock.link_to_page = {
        type: "page_id",
        page_id: "linked-page-001",
      };
      break;

    case "breadcrumb":
      baseBlock.breadcrumb = {};
      break;

    default:
      // For any unsupported type, add empty content
      (baseBlock as Record<string, unknown>)[type] = {};
  }

  return baseBlock;
}

/**
 * Property types for mock page properties.
 */
export type MockPropertyType =
  | "title"
  | "rich_text"
  | "select"
  | "multi_select"
  | "number"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone_number"
  | "status"
  | "people"
  | "files"
  | "relation"
  | "rollup"
  | "formula"
  | "created_time"
  | "created_by"
  | "last_edited_time"
  | "last_edited_by";

/**
 * Options for creating mock pages.
 */
export interface MockPageOptions {
  /** Page ID override */
  id?: string;
  /** Page properties */
  properties?: Record<string, MockPropertyValue>;
  /** Page creation time */
  createdTime?: string;
  /** Page last edited time */
  lastEditedTime?: string;
  /** Page URL */
  url?: string;
  /** Whether page is archived */
  archived?: boolean;
  /** Parent database ID */
  parentDatabaseId?: string;
  /** Page icon emoji */
  icon?: string;
  /** Page cover URL */
  cover?: string;
}

/**
 * Configuration for a mock property value.
 */
export interface MockPropertyValue {
  type: MockPropertyType;
  value: unknown;
}

/**
 * Represents a mock page response from the Notion API.
 */
export interface MockPage {
  object: "page";
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: { object: "user"; id: string };
  last_edited_by: { object: "user"; id: string };
  archived: boolean;
  in_trash: boolean;
  is_locked: boolean;
  url: string;
  public_url: string | null;
  parent:
    | { type: "database_id"; database_id: string }
    | { type: "page_id"; page_id: string }
    | { type: "workspace"; workspace: true };
  properties: Record<string, MockPageProperty>;
  icon: { type: "emoji"; emoji: string } | null;
  cover: { type: "external"; external: { url: string } } | null;
}

/**
 * Represents a property on a mock page.
 */
export interface MockPageProperty {
  id: string;
  type: MockPropertyType;
  [key: string]: unknown;
}

let pageIdCounter = 0;
let propertyIdCounter = 0;

/**
 * Generates a unique mock page ID.
 */
function generatePageId(): string {
  pageIdCounter++;
  return `page-${pageIdCounter.toString().padStart(4, "0")}-${Date.now().toString(36)}`;
}

/**
 * Generates a unique property ID.
 */
function generatePropertyId(): string {
  propertyIdCounter++;
  return `prop-${propertyIdCounter.toString().padStart(4, "0")}`;
}

/**
 * Creates a property value object for a mock page.
 */
function createPropertyValue(
  type: MockPropertyType,
  value: unknown
): MockPageProperty {
  const id = generatePropertyId();

  switch (type) {
    case "title":
      return {
        id,
        type: "title",
        title:
          typeof value === "string"
            ? [mockRichText(value)]
            : (value as MockRichTextItem[]),
      };

    case "rich_text":
      return {
        id,
        type: "rich_text",
        rich_text:
          typeof value === "string"
            ? [mockRichText(value)]
            : (value as MockRichTextItem[]),
      };

    case "select":
      return {
        id,
        type: "select",
        select: value
          ? {
              id: `select-${Date.now()}`,
              name: value as string,
              color: "default" as const,
            }
          : null,
      };

    case "multi_select":
      return {
        id,
        type: "multi_select",
        multi_select: (value as string[]).map((name, i) => ({
          id: `multi-select-${i}`,
          name,
          color: "default" as const,
        })),
      };

    case "number":
      return {
        id,
        type: "number",
        number: value as number | null,
      };

    case "date":
      return {
        id,
        type: "date",
        date: value
          ? {
              start: value as string,
              end: null,
              time_zone: null,
            }
          : null,
      };

    case "checkbox":
      return {
        id,
        type: "checkbox",
        checkbox: value as boolean,
      };

    case "url":
      return {
        id,
        type: "url",
        url: value as string | null,
      };

    case "email":
      return {
        id,
        type: "email",
        email: value as string | null,
      };

    case "phone_number":
      return {
        id,
        type: "phone_number",
        phone_number: value as string | null,
      };

    case "status":
      return {
        id,
        type: "status",
        status: value
          ? {
              id: `status-${Date.now()}`,
              name: value as string,
              color: "default" as const,
            }
          : null,
      };

    case "people":
      return {
        id,
        type: "people",
        people: (value as string[]).map((userId) => ({
          object: "user" as const,
          id: userId,
        })),
      };

    case "files":
      return {
        id,
        type: "files",
        files: (value as string[]).map((url, i) => ({
          name: `file-${i}`,
          type: "external" as const,
          external: { url },
        })),
      };

    case "relation":
      return {
        id,
        type: "relation",
        relation: (value as string[]).map((pageId) => ({
          id: pageId,
        })),
        has_more: false,
      };

    case "rollup":
      return {
        id,
        type: "rollup",
        rollup: {
          type: "number",
          number: value as number | null,
          function: "sum",
        },
      };

    case "formula":
      return {
        id,
        type: "formula",
        formula: {
          type: "string",
          string: value as string | null,
        },
      };

    case "created_time":
      return {
        id,
        type: "created_time",
        created_time: value as string,
      };

    case "created_by":
      return {
        id,
        type: "created_by",
        created_by: {
          object: "user" as const,
          id: value as string,
        },
      };

    case "last_edited_time":
      return {
        id,
        type: "last_edited_time",
        last_edited_time: value as string,
      };

    case "last_edited_by":
      return {
        id,
        type: "last_edited_by",
        last_edited_by: {
          object: "user" as const,
          id: value as string,
        },
      };

    default:
      return { id, type };
  }
}

/**
 * Creates a mock page object matching Notion API response shape from dataSources.query.
 *
 * @param options - Configuration for the mock page
 * @returns A page object matching Notion API response shape
 */
export function mockNotionPage(options: MockPageOptions = {}): MockPage {
  const now = new Date().toISOString();
  const id = options.id ?? generatePageId();
  const parentDatabaseId = options.parentDatabaseId ?? "database-001";

  // Build properties from options
  const properties: Record<string, MockPageProperty> = {};

  // Add default title if not provided
  if (!options.properties?.Name && !options.properties?.Title) {
    properties.Name = createPropertyValue("title", "Untitled");
  }

  // Process provided properties
  if (options.properties) {
    for (const [name, config] of Object.entries(options.properties)) {
      properties[name] = createPropertyValue(config.type, config.value);
    }
  }

  return {
    object: "page",
    id,
    created_time: options.createdTime ?? now,
    last_edited_time: options.lastEditedTime ?? now,
    created_by: { object: "user", id: "user-001" },
    last_edited_by: { object: "user", id: "user-001" },
    archived: options.archived ?? false,
    in_trash: false,
    is_locked: false,
    url: options.url ?? `https://www.notion.so/${id.replace(/-/g, "")}`,
    public_url: null,
    parent: { type: "database_id", database_id: parentDatabaseId },
    properties,
    icon: options.icon ? { type: "emoji", emoji: options.icon } : null,
    cover: options.cover
      ? { type: "external", external: { url: options.cover } }
      : null,
  };
}

/**
 * Creates a mock dataSources.query response.
 *
 * @param pages - Array of mock pages to include in the response
 * @param hasMore - Whether there are more pages to fetch
 * @param nextCursor - Cursor for the next page of results
 * @returns A query response matching Notion API shape
 */
export function mockQueryResponse(
  pages: MockPage[],
  hasMore: boolean = false,
  nextCursor: string | null = null
): {
  object: "list";
  results: MockPage[];
  next_cursor: string | null;
  has_more: boolean;
  type: "page";
} {
  return {
    object: "list",
    results: pages,
    next_cursor: nextCursor,
    has_more: hasMore,
    type: "page",
  };
}

/**
 * Creates a mock blocks.children.list response.
 *
 * @param blocks - Array of mock blocks to include in the response
 * @param hasMore - Whether there are more blocks to fetch
 * @param nextCursor - Cursor for the next page of results
 * @returns A block list response matching Notion API shape
 */
export function mockBlocksResponse(
  blocks: MockBlock[],
  hasMore: boolean = false,
  nextCursor: string | null = null
): {
  object: "list";
  results: MockBlock[];
  next_cursor: string | null;
  has_more: boolean;
  type: "block";
  block: Record<string, never>;
} {
  return {
    object: "list",
    results: blocks,
    next_cursor: nextCursor,
    has_more: hasMore,
    type: "block",
    block: {},
  };
}

/**
 * Creates a mock database.retrieve response with data_sources array.
 *
 * @param databaseId - The database ID
 * @param dataSourceId - The data source ID
 * @param title - The database title
 * @returns A database response matching Notion API shape
 */
export function mockDatabaseResponse(
  databaseId: string,
  dataSourceId: string,
  title: string = "Test Database"
): {
  object: "database";
  id: string;
  title: MockRichTextItem[];
  data_sources: Array<{ id: string; object: "data_source" }>;
  created_time: string;
  last_edited_time: string;
  is_inline: boolean;
  archived: boolean;
  in_trash: boolean;
} {
  const now = new Date().toISOString();
  return {
    object: "database",
    id: databaseId,
    title: [mockRichText(title)],
    data_sources: [{ id: dataSourceId, object: "data_source" }],
    created_time: now,
    last_edited_time: now,
    is_inline: false,
    archived: false,
    in_trash: false,
  };
}

/**
 * Resets all ID counters (useful between tests).
 */
export function resetMockCounters(): void {
  blockIdCounter = 0;
  pageIdCounter = 0;
  propertyIdCounter = 0;
}
