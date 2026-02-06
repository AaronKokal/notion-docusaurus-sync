/**
 * Unit tests for the NotionWriter class.
 *
 * Tests page creation, content replacement, property updates, and archiving
 * with mocked Notion API calls.
 *
 * User Story 5 acceptance scenarios:
 * - Create new page with properties and content blocks
 * - Update existing page properties and replace content blocks
 * - Handle pages with more than 100 blocks (batch creation)
 * - Archive pages when files are deleted
 * - Retry with exponential backoff on rate limiting (via NotionClientWrapper)
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NotionWriter } from "../../src/sync/notion-writer.js";
import { NotionClientWrapper } from "../../src/notion/client.js";

// Mock the NotionClientWrapper
vi.mock("../../src/notion/client.js", () => ({
  NotionClientWrapper: vi.fn(),
}));

describe("NotionWriter", () => {
  let writer: NotionWriter;
  let mockClient: {
    rawClient: {
      pages: {
        create: Mock;
        update: Mock;
      };
      blocks: {
        children: {
          append: Mock;
        };
        delete: Mock;
      };
    };
    getPageBlocks: Mock;
  };

  const databaseId = "test-database-id";

  beforeEach(() => {
    // Create mock client with all required methods
    mockClient = {
      rawClient: {
        pages: {
          create: vi.fn().mockResolvedValue({ id: "new-page-id" }),
          update: vi.fn().mockResolvedValue({ id: "updated-page-id" }),
        },
        blocks: {
          children: {
            append: vi.fn().mockResolvedValue({ results: [] }),
          },
          delete: vi.fn().mockResolvedValue({}),
        },
      },
      getPageBlocks: vi.fn().mockResolvedValue([]),
    };

    // Make NotionClientWrapper return our mock
    (NotionClientWrapper as unknown as Mock).mockImplementation(
      () => mockClient
    );

    writer = new NotionWriter(
      mockClient as unknown as NotionClientWrapper,
      databaseId
    );
  });

  describe("createPage", () => {
    it("creates a page with properties and no blocks", async () => {
      const properties = {
        Name: { title: [{ text: { content: "Test Page" } }] },
      };

      const pageId = await writer.createPage(properties, []);

      expect(pageId).toBe("new-page-id");
      expect(mockClient.rawClient.pages.create).toHaveBeenCalledWith({
        parent: { database_id: databaseId },
        properties,
      });
    });

    it("creates a page with properties and blocks", async () => {
      const properties = {
        Name: { title: [{ text: { content: "Test Page" } }] },
      };
      const blocks = [
        {
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: "Hello" } }] },
        },
      ];

      const pageId = await writer.createPage(properties, blocks);

      expect(pageId).toBe("new-page-id");
      expect(mockClient.rawClient.pages.create).toHaveBeenCalledWith({
        parent: { database_id: databaseId },
        properties,
        children: blocks,
      });
    });

    it("creates page with first 100 blocks and appends the rest", async () => {
      const properties = {
        Name: { title: [{ text: { content: "Large Page" } }] },
      };

      // Create 150 blocks
      const blocks = Array.from({ length: 150 }, (_, i) => ({
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: `Block ${i}` } }] },
      }));

      const pageId = await writer.createPage(properties, blocks);

      expect(pageId).toBe("new-page-id");

      // Should create with first 100 blocks
      expect(mockClient.rawClient.pages.create).toHaveBeenCalledWith({
        parent: { database_id: databaseId },
        properties,
        children: blocks.slice(0, 100),
      });

      // Should append remaining 50 blocks
      expect(mockClient.rawClient.blocks.children.append).toHaveBeenCalledTimes(
        1
      );
      expect(mockClient.rawClient.blocks.children.append).toHaveBeenCalledWith({
        block_id: "new-page-id",
        children: blocks.slice(100),
      });
    });

    it("handles exactly 100 blocks without extra append call", async () => {
      const properties = {
        Name: { title: [{ text: { content: "100 Blocks" } }] },
      };

      const blocks = Array.from({ length: 100 }, (_, i) => ({
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: `Block ${i}` } }] },
      }));

      await writer.createPage(properties, blocks);

      expect(mockClient.rawClient.pages.create).toHaveBeenCalledWith({
        parent: { database_id: databaseId },
        properties,
        children: blocks,
      });

      // No append call needed
      expect(
        mockClient.rawClient.blocks.children.append
      ).not.toHaveBeenCalled();
    });

    it("batches blocks correctly when more than 200 blocks", async () => {
      const properties = {
        Name: { title: [{ text: { content: "Very Large Page" } }] },
      };

      // Create 250 blocks
      const blocks = Array.from({ length: 250 }, (_, i) => ({
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: `Block ${i}` } }] },
      }));

      await writer.createPage(properties, blocks);

      // First 100 in create
      expect(mockClient.rawClient.pages.create).toHaveBeenCalledWith({
        parent: { database_id: databaseId },
        properties,
        children: blocks.slice(0, 100),
      });

      // Two append calls: blocks 100-199 and 200-249
      expect(mockClient.rawClient.blocks.children.append).toHaveBeenCalledTimes(
        2
      );
      expect(
        mockClient.rawClient.blocks.children.append
      ).toHaveBeenNthCalledWith(1, {
        block_id: "new-page-id",
        children: blocks.slice(100, 200),
      });
      expect(
        mockClient.rawClient.blocks.children.append
      ).toHaveBeenNthCalledWith(2, {
        block_id: "new-page-id",
        children: blocks.slice(200),
      });
    });
  });

  describe("replacePageContent", () => {
    it("deletes existing blocks and appends new ones", async () => {
      const pageId = "existing-page-id";
      const existingBlocks = [
        { id: "block-1", type: "paragraph" },
        { id: "block-2", type: "heading_1" },
      ];
      mockClient.getPageBlocks.mockResolvedValue(existingBlocks);

      const newBlocks = [
        {
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: "New content" } }] },
        },
      ];

      await writer.replacePageContent(pageId, newBlocks);

      // Should fetch existing blocks
      expect(mockClient.getPageBlocks).toHaveBeenCalledWith(pageId);

      // Should delete all existing blocks
      expect(mockClient.rawClient.blocks.delete).toHaveBeenCalledTimes(2);
      expect(mockClient.rawClient.blocks.delete).toHaveBeenNthCalledWith(1, {
        block_id: "block-1",
      });
      expect(mockClient.rawClient.blocks.delete).toHaveBeenNthCalledWith(2, {
        block_id: "block-2",
      });

      // Should append new blocks
      expect(mockClient.rawClient.blocks.children.append).toHaveBeenCalledWith({
        block_id: pageId,
        children: newBlocks,
      });
    });

    it("handles page with no existing blocks", async () => {
      const pageId = "empty-page-id";
      mockClient.getPageBlocks.mockResolvedValue([]);

      const newBlocks = [
        {
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: "Content" } }] },
        },
      ];

      await writer.replacePageContent(pageId, newBlocks);

      expect(mockClient.getPageBlocks).toHaveBeenCalledWith(pageId);
      expect(mockClient.rawClient.blocks.delete).not.toHaveBeenCalled();
      expect(mockClient.rawClient.blocks.children.append).toHaveBeenCalledWith({
        block_id: pageId,
        children: newBlocks,
      });
    });

    it("handles replacing with empty blocks array", async () => {
      const pageId = "page-id";
      const existingBlocks = [{ id: "block-1", type: "paragraph" }];
      mockClient.getPageBlocks.mockResolvedValue(existingBlocks);

      await writer.replacePageContent(pageId, []);

      // Should delete existing blocks
      expect(mockClient.rawClient.blocks.delete).toHaveBeenCalledWith({
        block_id: "block-1",
      });

      // Should not append anything
      expect(
        mockClient.rawClient.blocks.children.append
      ).not.toHaveBeenCalled();
    });

    it("batches new blocks when replacing with more than 100", async () => {
      const pageId = "page-id";
      mockClient.getPageBlocks.mockResolvedValue([]);

      const newBlocks = Array.from({ length: 150 }, (_, i) => ({
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: `Block ${i}` } }] },
      }));

      await writer.replacePageContent(pageId, newBlocks);

      // Should append in 2 batches
      expect(mockClient.rawClient.blocks.children.append).toHaveBeenCalledTimes(
        2
      );
      expect(
        mockClient.rawClient.blocks.children.append
      ).toHaveBeenNthCalledWith(1, {
        block_id: pageId,
        children: newBlocks.slice(0, 100),
      });
      expect(
        mockClient.rawClient.blocks.children.append
      ).toHaveBeenNthCalledWith(2, {
        block_id: pageId,
        children: newBlocks.slice(100),
      });
    });

    it("deletes many existing blocks", async () => {
      const pageId = "page-id";
      const existingBlocks = Array.from({ length: 50 }, (_, i) => ({
        id: `block-${i}`,
        type: "paragraph",
      }));
      mockClient.getPageBlocks.mockResolvedValue(existingBlocks);

      await writer.replacePageContent(pageId, []);

      // Should delete all 50 blocks
      expect(mockClient.rawClient.blocks.delete).toHaveBeenCalledTimes(50);
    });
  });

  describe("updateProperties", () => {
    it("updates page properties", async () => {
      const pageId = "page-id";
      const properties = {
        Name: { title: [{ text: { content: "Updated Title" } }] },
        Status: { select: { name: "Published" } },
      };

      await writer.updateProperties(pageId, properties);

      expect(mockClient.rawClient.pages.update).toHaveBeenCalledWith({
        page_id: pageId,
        properties,
      });
    });

    it("updates single property", async () => {
      const pageId = "page-id";
      const properties = {
        Slug: { rich_text: [{ text: { content: "new-slug" } }] },
      };

      await writer.updateProperties(pageId, properties);

      expect(mockClient.rawClient.pages.update).toHaveBeenCalledWith({
        page_id: pageId,
        properties,
      });
    });
  });

  describe("archivePage", () => {
    it("archives a page by setting archived: true", async () => {
      const pageId = "page-to-archive";

      await writer.archivePage(pageId);

      expect(mockClient.rawClient.pages.update).toHaveBeenCalledWith({
        page_id: pageId,
        archived: true,
      });
    });
  });

  describe("error handling", () => {
    it("propagates page creation errors", async () => {
      const error = new Error("API error");
      mockClient.rawClient.pages.create.mockRejectedValue(error);

      await expect(writer.createPage({}, [])).rejects.toThrow("API error");
    });

    it("propagates block append errors", async () => {
      const error = new Error("Append failed");
      mockClient.rawClient.pages.create.mockResolvedValue({ id: "page-id" });
      mockClient.rawClient.blocks.children.append.mockRejectedValue(error);

      const blocks = Array.from({ length: 150 }, () => ({
        type: "paragraph",
        paragraph: { rich_text: [] },
      }));

      await expect(writer.createPage({}, blocks)).rejects.toThrow(
        "Append failed"
      );
    });

    it("propagates block delete errors during replacement", async () => {
      const error = new Error("Delete failed");
      mockClient.getPageBlocks.mockResolvedValue([
        { id: "block-1", type: "paragraph" },
      ]);
      mockClient.rawClient.blocks.delete.mockRejectedValue(error);

      await expect(writer.replacePageContent("page-id", [])).rejects.toThrow(
        "Delete failed"
      );
    });

    it("propagates property update errors", async () => {
      const error = new Error("Update failed");
      mockClient.rawClient.pages.update.mockRejectedValue(error);

      await expect(writer.updateProperties("page-id", {})).rejects.toThrow(
        "Update failed"
      );
    });

    it("propagates archive errors", async () => {
      const error = new Error("Archive failed");
      mockClient.rawClient.pages.update.mockRejectedValue(error);

      await expect(writer.archivePage("page-id")).rejects.toThrow(
        "Archive failed"
      );
    });
  });
});
