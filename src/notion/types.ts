/**
 * Notion SDK type helpers for the sync engine.
 *
 * Re-exports useful types from @notionhq/client and defines helper types
 * for working with the v5 API. Uses `as any` casts where SDK types
 * lag behind the actual v5 API responses.
 */

// Re-export core SDK types that we use frequently
export type {
  // Page and database types
  PageObjectResponse,
  PartialPageObjectResponse,
  DatabaseObjectResponse,
  PartialDatabaseObjectResponse,
  DataSourceObjectResponse,
  PartialDataSourceObjectResponse,

  // Block types (all specific block responses)
  BlockObjectResponse,
  PartialBlockObjectResponse,
  ParagraphBlockObjectResponse,
  Heading1BlockObjectResponse,
  Heading2BlockObjectResponse,
  Heading3BlockObjectResponse,
  BulletedListItemBlockObjectResponse,
  NumberedListItemBlockObjectResponse,
  QuoteBlockObjectResponse,
  ToDoBlockObjectResponse,
  ToggleBlockObjectResponse,
  CodeBlockObjectResponse,
  CalloutBlockObjectResponse,
  DividerBlockObjectResponse,
  TableBlockObjectResponse,
  TableRowBlockObjectResponse,
  ImageBlockObjectResponse,
  BookmarkBlockObjectResponse,
  EmbedBlockObjectResponse,
  VideoBlockObjectResponse,
  FileBlockObjectResponse,
  AudioBlockObjectResponse,
  EquationBlockObjectResponse,
  ChildPageBlockObjectResponse,
  ChildDatabaseBlockObjectResponse,
  ColumnListBlockObjectResponse,
  ColumnBlockObjectResponse,
  LinkToPageBlockObjectResponse,
  SyncedBlockBlockObjectResponse,
  TemplateBlockObjectResponse,
  BreadcrumbBlockObjectResponse,
  TableOfContentsBlockObjectResponse,
  LinkPreviewBlockObjectResponse,
  PdfBlockObjectResponse,
  UnsupportedBlockObjectResponse,

  // Rich text types
  RichTextItemResponse,
  TextRichTextItemResponse,
  MentionRichTextItemResponse,
  EquationRichTextItemResponse,

  // Property types (for page properties in query results)
  PropertyItemObjectResponse,
  TitlePropertyItemObjectResponse,
  RichTextPropertyItemObjectResponse,
  NumberPropertyItemObjectResponse,
  SelectPropertyItemObjectResponse,
  MultiSelectPropertyItemObjectResponse,
  StatusPropertyItemObjectResponse,
  DatePropertyItemObjectResponse,
  CheckboxPropertyItemObjectResponse,
  UrlPropertyItemObjectResponse,
  EmailPropertyItemObjectResponse,
  PhoneNumberPropertyItemObjectResponse,
  PeoplePropertyItemObjectResponse,
  FilesPropertyItemObjectResponse,
  CreatedByPropertyItemObjectResponse,
  CreatedTimePropertyItemObjectResponse,
  LastEditedByPropertyItemObjectResponse,
  LastEditedTimePropertyItemObjectResponse,
  FormulaPropertyItemObjectResponse,
  RelationPropertyItemObjectResponse,
  RollupPropertyItemObjectResponse,
  UniqueIdPropertyItemObjectResponse,
  VerificationPropertyItemObjectResponse,

  // API response types
  QueryDataSourceResponse,
  ListBlockChildrenResponse,
  GetDatabaseResponse,
  GetDataSourceResponse,
  CreatePageResponse,
  UpdatePageResponse,

  // User types
  UserObjectResponse,
  PartialUserObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

// Re-export helper functions from SDK
export {
  isFullPage,
  isFullBlock,
  isFullDatabase,
  isFullDataSource,
  isFullPageOrDataSource,
  collectPaginatedAPI,
  iteratePaginatedAPI,
} from "@notionhq/client";

// Re-export Client class
export { Client } from "@notionhq/client";

// -----------------------------------------------------------------------------
// Helper type aliases for common use cases
// -----------------------------------------------------------------------------

import type {
  PageObjectResponse,
  BlockObjectResponse,
  RichTextItemResponse,
  PropertyItemObjectResponse,
  QueryDataSourceResponse,
  ListBlockChildrenResponse,
} from "@notionhq/client/build/src/api-endpoints";

/**
 * A page result from dataSources.query.
 *
 * The SDK's QueryDataSourceResponse.results can be pages, partial pages,
 * data sources, or partial data sources. For our sync engine, we always
 * filter to full page objects using isFullPage().
 */
export type NotionPage = PageObjectResponse;

/**
 * A block from blocks.children.list.
 *
 * The SDK's ListBlockChildrenResponse.results can be full or partial blocks.
 * We always filter to full block objects using isFullBlock().
 */
export type NotionBlock = BlockObjectResponse;

/**
 * A single rich text element (from the rich_text array in blocks/properties).
 */
export type NotionRichText = RichTextItemResponse;

/**
 * A property value from a page's properties.
 * This is the union of all possible property item responses.
 */
export type NotionProperty = PropertyItemObjectResponse;

/**
 * The result type from dataSources.query.
 * Note: results array contains PageObjectResponse | PartialPageObjectResponse |
 * DataSourceObjectResponse | PartialDataSourceObjectResponse.
 */
export type NotionQueryResult = QueryDataSourceResponse;

/**
 * The result type from blocks.children.list.
 * Note: results array contains BlockObjectResponse | PartialBlockObjectResponse.
 */
export type NotionBlocksResult = ListBlockChildrenResponse;

// -----------------------------------------------------------------------------
// Types for SDK v5 API gaps
// -----------------------------------------------------------------------------

/**
 * Database response with data_sources array.
 *
 * The v5 SDK's databases.retrieve returns a response that includes a
 * `data_sources` array, but this may not be fully typed in the SDK yet.
 * Use this interface when accessing data_sources from the response.
 */
export interface DatabaseWithDataSources {
  id: string;
  object: "database";
  // data_sources is available in v5 API responses but may not be typed
  data_sources?: Array<{
    id: string;
    object: "data_source";
  }>;
  // Other fields exist but we only need these for data source resolution
  [key: string]: unknown;
}

/**
 * Extract data_sources from a database response.
 *
 * Use this helper when the SDK types don't expose data_sources directly.
 * This casts to `any` to access the v5 API field.
 *
 * @example
 * const dbResponse = await notion.databases.retrieve({ database_id });
 * const dataSources = getDataSourcesFromDatabase(dbResponse);
 * const dataSourceId = dataSources?.[0]?.id;
 */
export function getDataSourcesFromDatabase(
  database: unknown
): Array<{ id: string; object: "data_source" }> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (database as any)?.data_sources;
}

/**
 * Page property value as it appears in PageObjectResponse.properties.
 *
 * Note: PageObjectResponse.properties is Record<string, PagePropertyValueWithIdResponse>
 * which is different from PropertyItemObjectResponse (used in getPageProperty API).
 * The page properties in query results include an `id` field and the property value.
 */
export type NotionPageProperty = PageObjectResponse["properties"][string];

/**
 * Block type string literal union.
 * Useful for switch statements and type guards.
 */
export type NotionBlockType = BlockObjectResponse["type"];

/**
 * Property type string literal union for PropertyItemObjectResponse.
 */
export type NotionPropertyType = PropertyItemObjectResponse["type"];
