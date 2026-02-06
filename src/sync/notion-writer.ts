/**
 * Notion page writer for Git → Notion sync.
 *
 * Provides operations to create new pages, replace page content,
 * update properties, and archive pages in Notion.
 *
 * User Story 5 acceptance scenarios:
 * - Create new page with properties and content blocks
 * - Update existing page properties and replace content blocks
 * - Handle pages with more than 100 blocks (batch creation)
 * - Archive pages when files are deleted from Git
 * - Use rate limiting via NotionClientWrapper
 *
 * Block replacement strategy (per ADR-003):
 * 1. Delete all existing child blocks
 * 2. Append new blocks in batches of 100
 */

import { NotionClientWrapper } from "../notion/client.js";
import type { NotionBlockPayload } from "../types.js";

/**
 * Maximum number of blocks per API call.
 * Notion's API limits children array to 100 blocks.
 */
const MAX_BLOCKS_PER_REQUEST = 100;

/**
 * Notion page writer for creating, updating, and archiving pages.
 *
 * All operations go through the NotionClientWrapper for rate limiting
 * and retry handling.
 *
 * @example
 * ```ts
 * const client = new NotionClientWrapper({ token: process.env.NOTION_TOKEN! });
 * const writer = new NotionWriter(client, databaseId);
 *
 * // Create a new page
 * const pageId = await writer.createPage(
 *   { Name: { title: [{ text: { content: "New Page" } }] } },
 *   [{ type: "paragraph", paragraph: { rich_text: [...] } }]
 * );
 *
 * // Update page content
 * await writer.replacePageContent(pageId, newBlocks);
 *
 * // Archive page
 * await writer.archivePage(pageId);
 * ```
 */
export class NotionWriter {
  constructor(
    private readonly client: NotionClientWrapper,
    private readonly databaseId: string
  ) {}

  /**
   * Creates a new page in the database with properties and content blocks.
   *
   * If the page has more than 100 blocks, the first 100 are included in
   * the pages.create call, and the rest are appended via blocks.children.append
   * in batches of 100.
   *
   * @param properties - Notion property payloads for the page
   * @param blocks - Array of Notion block payloads for the page content
   * @returns The created page ID
   *
   * @example
   * ```ts
   * const pageId = await writer.createPage(
   *   {
   *     Name: { title: [{ text: { content: "Getting Started" } }] },
   *     Slug: { rich_text: [{ text: { content: "getting-started" } }] }
   *   },
   *   [
   *     { type: "heading_1", heading_1: { rich_text: [...] } },
   *     { type: "paragraph", paragraph: { rich_text: [...] } }
   *   ]
   * );
   * ```
   */
  async createPage(
    properties: Record<string, unknown>,
    blocks: NotionBlockPayload[]
  ): Promise<string> {
    // Split blocks into first batch (for create) and remaining batches
    const firstBatch = blocks.slice(0, MAX_BLOCKS_PER_REQUEST);
    const remainingBlocks = blocks.slice(MAX_BLOCKS_PER_REQUEST);

    // Create page with first batch of blocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      parent: { database_id: this.databaseId },
      properties,
    };

    if (firstBatch.length > 0) {
      createParams.children = firstBatch;
    }

    const response = await this.client.rawClient.pages.create(createParams);
    const pageId = response.id;

    // Append remaining blocks in batches
    if (remainingBlocks.length > 0) {
      await this.appendBlocksInBatches(pageId, remainingBlocks);
    }

    return pageId;
  }

  /**
   * Replaces all content blocks on an existing page.
   *
   * Per ADR-003 (page-level replacement):
   * 1. Fetches all existing child block IDs
   * 2. Deletes each block
   * 3. Appends new blocks in batches of 100
   *
   * This is simpler than block-level diffing and ensures the page
   * content exactly matches the source markdown.
   *
   * @param pageId - The Notion page ID
   * @param blocks - Array of new block payloads to set as page content
   *
   * @example
   * ```ts
   * await writer.replacePageContent(pageId, [
   *   { type: "heading_1", heading_1: { rich_text: [...] } },
   *   { type: "paragraph", paragraph: { rich_text: [...] } }
   * ]);
   * ```
   */
  async replacePageContent(
    pageId: string,
    blocks: NotionBlockPayload[]
  ): Promise<void> {
    // Step 1: Get all existing child blocks
    const existingBlocks = await this.client.getPageBlocks(pageId);

    // Step 2: Delete all existing blocks
    // Note: We only need to delete top-level blocks; deleting a parent
    // automatically deletes its children
    for (const block of existingBlocks) {
      await this.client.rawClient.blocks.delete({ block_id: block.id });
    }

    // Step 3: Append new blocks
    if (blocks.length > 0) {
      await this.appendBlocksInBatches(pageId, blocks);
    }
  }

  /**
   * Updates a page's properties without changing its content.
   *
   * @param pageId - The Notion page ID
   * @param properties - Notion property payloads to update
   *
   * @example
   * ```ts
   * await writer.updateProperties(pageId, {
   *   Name: { title: [{ text: { content: "Updated Title" } }] },
   *   Status: { select: { name: "Published" } }
   * });
   * ```
   */
  async updateProperties(
    pageId: string,
    properties: Record<string, unknown>
  ): Promise<void> {
    await this.client.rawClient.pages.update({
      page_id: pageId,
      properties: properties as Parameters<
        typeof this.client.rawClient.pages.update
      >[0]["properties"],
    });
  }

  /**
   * Archives a page (sets archived: true).
   *
   * Used when a markdown file is deleted from Git — we archive the
   * corresponding Notion page rather than permanently deleting it.
   *
   * @param pageId - The Notion page ID to archive
   *
   * @example
   * ```ts
   * await writer.archivePage(pageId);
   * ```
   */
  async archivePage(pageId: string): Promise<void> {
    await this.client.rawClient.pages.update({
      page_id: pageId,
      archived: true,
    });
  }

  /**
   * Appends blocks to a page in batches of MAX_BLOCKS_PER_REQUEST.
   *
   * @param pageId - The page or block ID to append to
   * @param blocks - Array of block payloads to append
   */
  private async appendBlocksInBatches(
    pageId: string,
    blocks: NotionBlockPayload[]
  ): Promise<void> {
    // Split blocks into batches of MAX_BLOCKS_PER_REQUEST
    for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_REQUEST) {
      const batch = blocks.slice(i, i + MAX_BLOCKS_PER_REQUEST);

      await this.client.rawClient.blocks.children.append({
        block_id: pageId,
        children: batch,
      });
    }
  }
}
