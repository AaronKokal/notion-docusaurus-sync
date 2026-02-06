/**
 * Unit tests for NotionClientWrapper.
 *
 * Tests the SDK v5 client wrapper including:
 * - Data source ID resolution from database metadata
 * - Page querying with pagination
 * - Block fetching with recursive children
 * - Rate limiting and retry logic
 */

import { describe, it, expect, beforeEach, vi, type Mock, afterEach } from "vitest";
import {
  NotionClientWrapper,
  NotionRateLimitError,
  type NotionClientConfig,
} from "../../src/notion/client.js";
import {
  mockNotionPage,
  mockBlock,
  mockQueryResponse,
  mockBlocksResponse,
  mockDatabaseResponse,
  resetMockCounters,
} from "../helpers.js";

describe("NotionClientWrapper", () => {
  let wrapper: NotionClientWrapper;
  let mockDatabasesRetrieve: Mock;
  let mockDataSourcesQuery: Mock;
  let mockBlocksChildrenList: Mock;

  const config: NotionClientConfig = {
    token: "test-token",
    minRequestInterval: 0, // Disable rate limiting delays in tests
    maxRetries: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockCounters();

    wrapper = new NotionClientWrapper(config);

    // Access the raw client and spy on its methods
    const rawClient = wrapper.rawClient;
    mockDatabasesRetrieve = vi.spyOn(rawClient.databases, "retrieve") as Mock;
    mockDataSourcesQuery = vi.spyOn(rawClient.dataSources, "query") as Mock;
    mockBlocksChildrenList = vi.spyOn(
      rawClient.blocks.children,
      "list"
    ) as Mock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getDataSourceId", () => {
    it("resolves data source ID from database metadata", async () => {
      const databaseId = "db-123";
      const dataSourceId = "ds-456";
      const dbResponse = mockDatabaseResponse(databaseId, dataSourceId, "Test DB");

      mockDatabasesRetrieve.mockResolvedValueOnce(dbResponse);

      const result = await wrapper.getDataSourceId(databaseId);

      expect(result).toBe(dataSourceId);
      expect(mockDatabasesRetrieve).toHaveBeenCalledWith({
        database_id: databaseId,
      });
    });

    it("caches data source ID for subsequent calls", async () => {
      const databaseId = "db-123";
      const dataSourceId = "ds-456";
      const dbResponse = mockDatabaseResponse(databaseId, dataSourceId);

      mockDatabasesRetrieve.mockResolvedValueOnce(dbResponse);

      // First call
      const result1 = await wrapper.getDataSourceId(databaseId);
      // Second call - should use cache
      const result2 = await wrapper.getDataSourceId(databaseId);

      expect(result1).toBe(dataSourceId);
      expect(result2).toBe(dataSourceId);
      // Should only call API once
      expect(mockDatabasesRetrieve).toHaveBeenCalledTimes(1);
    });

    it("throws error when database has no data sources", async () => {
      const databaseId = "db-no-sources";
      const dbResponse = {
        object: "database",
        id: databaseId,
        data_sources: [], // Empty array
      };

      mockDatabasesRetrieve.mockResolvedValueOnce(dbResponse);

      await expect(wrapper.getDataSourceId(databaseId)).rejects.toThrow(
        `Database ${databaseId} has no data sources`
      );
    });

    it("throws error when data_sources is undefined", async () => {
      const databaseId = "db-undefined-sources";
      const dbResponse = {
        object: "database",
        id: databaseId,
        // data_sources not present
      };

      mockDatabasesRetrieve.mockResolvedValueOnce(dbResponse);

      await expect(wrapper.getDataSourceId(databaseId)).rejects.toThrow(
        `Database ${databaseId} has no data sources`
      );
    });

    it("clearCache invalidates the cache", async () => {
      const databaseId = "db-123";
      const dataSourceId1 = "ds-456";
      const dataSourceId2 = "ds-789";

      mockDatabasesRetrieve
        .mockResolvedValueOnce(mockDatabaseResponse(databaseId, dataSourceId1))
        .mockResolvedValueOnce(mockDatabaseResponse(databaseId, dataSourceId2));

      // First call
      const result1 = await wrapper.getDataSourceId(databaseId);
      expect(result1).toBe(dataSourceId1);

      // Clear cache
      wrapper.clearCache();

      // Second call should hit API again
      const result2 = await wrapper.getDataSourceId(databaseId);
      expect(result2).toBe(dataSourceId2);
      expect(mockDatabasesRetrieve).toHaveBeenCalledTimes(2);
    });
  });

  describe("queryPages", () => {
    it("returns all pages from a single response", async () => {
      const dataSourceId = "ds-123";
      const pages = [
        mockNotionPage({ id: "page-1" }),
        mockNotionPage({ id: "page-2" }),
      ];

      mockDataSourcesQuery.mockResolvedValueOnce(
        mockQueryResponse(pages, false, null)
      );

      const result = await wrapper.queryPages(dataSourceId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("page-1");
      expect(result[1].id).toBe("page-2");
      expect(mockDataSourcesQuery).toHaveBeenCalledWith({
        data_source_id: dataSourceId,
        start_cursor: undefined,
      });
    });

    it("handles pagination and fetches all pages", async () => {
      const dataSourceId = "ds-123";
      const page1 = mockNotionPage({ id: "page-1" });
      const page2 = mockNotionPage({ id: "page-2" });
      const page3 = mockNotionPage({ id: "page-3" });

      mockDataSourcesQuery
        .mockResolvedValueOnce(mockQueryResponse([page1], true, "cursor-1"))
        .mockResolvedValueOnce(mockQueryResponse([page2], true, "cursor-2"))
        .mockResolvedValueOnce(mockQueryResponse([page3], false, null));

      const result = await wrapper.queryPages(dataSourceId);

      expect(result).toHaveLength(3);
      expect(result.map((p) => p.id)).toEqual(["page-1", "page-2", "page-3"]);
      expect(mockDataSourcesQuery).toHaveBeenCalledTimes(3);
      expect(mockDataSourcesQuery).toHaveBeenNthCalledWith(2, {
        data_source_id: dataSourceId,
        start_cursor: "cursor-1",
      });
      expect(mockDataSourcesQuery).toHaveBeenNthCalledWith(3, {
        data_source_id: dataSourceId,
        start_cursor: "cursor-2",
      });
    });

    it("filters out partial page responses", async () => {
      const dataSourceId = "ds-123";
      const fullPage = mockNotionPage({ id: "full-page" });
      const partialPage = { object: "page", id: "partial-page" }; // Missing 'properties'

      mockDataSourcesQuery.mockResolvedValueOnce({
        object: "list",
        results: [fullPage, partialPage],
        has_more: false,
        next_cursor: null,
        type: "page",
      });

      const result = await wrapper.queryPages(dataSourceId);

      // isFullPage from SDK filters out partial pages (ones without 'properties')
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("full-page");
    });

    it("passes filter parameter to the query", async () => {
      const dataSourceId = "ds-123";
      const filter = {
        property: "Status",
        select: { equals: "Published" },
      };

      mockDataSourcesQuery.mockResolvedValueOnce(
        mockQueryResponse([], false, null)
      );

      await wrapper.queryPages(dataSourceId, filter);

      expect(mockDataSourcesQuery).toHaveBeenCalledWith({
        data_source_id: dataSourceId,
        start_cursor: undefined,
        filter,
      });
    });

    it("returns empty array when no pages exist", async () => {
      const dataSourceId = "ds-123";

      mockDataSourcesQuery.mockResolvedValueOnce(
        mockQueryResponse([], false, null)
      );

      const result = await wrapper.queryPages(dataSourceId);

      expect(result).toEqual([]);
    });
  });

  describe("getPageBlocks", () => {
    it("returns all blocks from a page", async () => {
      const pageId = "page-123";
      const blocks = [
        mockBlock("paragraph", "First paragraph"),
        mockBlock("heading_1", "Main Heading"),
        mockBlock("paragraph", "Second paragraph"),
      ];

      mockBlocksChildrenList.mockResolvedValueOnce(
        mockBlocksResponse(blocks, false, null)
      );

      const result = await wrapper.getPageBlocks(pageId);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe("paragraph");
      expect(result[1].type).toBe("heading_1");
      expect(result[2].type).toBe("paragraph");
      expect(mockBlocksChildrenList).toHaveBeenCalledWith({
        block_id: pageId,
        start_cursor: undefined,
      });
    });

    it("handles pagination for blocks", async () => {
      const pageId = "page-123";
      const block1 = mockBlock("paragraph", "Block 1");
      const block2 = mockBlock("paragraph", "Block 2");

      mockBlocksChildrenList
        .mockResolvedValueOnce(mockBlocksResponse([block1], true, "block-cursor"))
        .mockResolvedValueOnce(mockBlocksResponse([block2], false, null));

      const result = await wrapper.getPageBlocks(pageId);

      expect(result).toHaveLength(2);
      expect(mockBlocksChildrenList).toHaveBeenCalledTimes(2);
      expect(mockBlocksChildrenList).toHaveBeenNthCalledWith(2, {
        block_id: pageId,
        start_cursor: "block-cursor",
      });
    });

    it("recursively fetches children for blocks with has_children", async () => {
      const pageId = "page-123";
      const toggleBlock = mockBlock("toggle", "Toggle Title", {
        id: "toggle-1",
        hasChildren: true,
      });
      const childBlock = mockBlock("paragraph", "Child content", {
        id: "child-1",
      });

      // First call: get page blocks (toggle with children)
      mockBlocksChildrenList.mockResolvedValueOnce(
        mockBlocksResponse([toggleBlock], false, null)
      );

      // Second call: get toggle's children
      mockBlocksChildrenList.mockResolvedValueOnce(
        mockBlocksResponse([childBlock], false, null)
      );

      const result = await wrapper.getPageBlocks(pageId);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("toggle");
      expect(result[0].has_children).toBe(true);
      // Children should be attached to the block
      expect((result[0] as { children?: unknown[] }).children).toHaveLength(1);
      expect(
        ((result[0] as { children?: { type: string }[] }).children?.[0] as { type: string })
          .type
      ).toBe("paragraph");
      expect(mockBlocksChildrenList).toHaveBeenCalledTimes(2);
      expect(mockBlocksChildrenList).toHaveBeenNthCalledWith(2, {
        block_id: "toggle-1",
        start_cursor: undefined,
      });
    });

    it("handles deeply nested children", async () => {
      const pageId = "page-123";
      const outerToggle = mockBlock("toggle", "Outer", {
        id: "outer",
        hasChildren: true,
      });
      const innerToggle = mockBlock("toggle", "Inner", {
        id: "inner",
        hasChildren: true,
      });
      const deepChild = mockBlock("paragraph", "Deep content", { id: "deep" });

      mockBlocksChildrenList
        .mockResolvedValueOnce(mockBlocksResponse([outerToggle], false, null))
        .mockResolvedValueOnce(mockBlocksResponse([innerToggle], false, null))
        .mockResolvedValueOnce(mockBlocksResponse([deepChild], false, null));

      const result = await wrapper.getPageBlocks(pageId);

      expect(result).toHaveLength(1);
      const outer = result[0] as { children?: { children?: unknown[] }[] };
      expect(outer.children).toHaveLength(1);
      expect(outer.children?.[0]?.children).toHaveLength(1);
      expect(mockBlocksChildrenList).toHaveBeenCalledTimes(3);
    });

    it("filters out partial block responses", async () => {
      const pageId = "page-123";
      const fullBlock = mockBlock("paragraph", "Full block");
      const partialBlock = { object: "block", id: "partial" }; // Missing 'type'

      mockBlocksChildrenList.mockResolvedValueOnce({
        object: "list",
        results: [fullBlock, partialBlock],
        has_more: false,
        next_cursor: null,
        type: "block",
        block: {},
      });

      const result = await wrapper.getPageBlocks(pageId);

      // isFullBlock from SDK filters out partial blocks (ones without 'type')
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("paragraph");
    });

    it("returns empty array for page with no blocks", async () => {
      const pageId = "page-empty";

      mockBlocksChildrenList.mockResolvedValueOnce(
        mockBlocksResponse([], false, null)
      );

      const result = await wrapper.getPageBlocks(pageId);

      expect(result).toEqual([]);
    });
  });

  describe("rate limiting", () => {
    it("retries on 429 rate limit error with exponential backoff", async () => {
      const databaseId = "db-123";
      const dataSourceId = "ds-456";
      const dbResponse = mockDatabaseResponse(databaseId, dataSourceId);

      // First two calls fail with rate limit, third succeeds
      const rateLimitError = { status: 429, code: "rate_limited" };
      mockDatabasesRetrieve
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(dbResponse);

      // Use fake timers to avoid actual delays
      vi.useFakeTimers();
      const resultPromise = wrapper.getDataSourceId(databaseId);

      // Advance through retry delays
      await vi.advanceTimersByTimeAsync(1000); // First retry delay
      await vi.advanceTimersByTimeAsync(2000); // Second retry delay

      const result = await resultPromise;
      vi.useRealTimers();

      expect(result).toBe(dataSourceId);
      expect(mockDatabasesRetrieve).toHaveBeenCalledTimes(3);
    });

    it("throws NotionRateLimitError after max retries exhausted", async () => {
      const databaseId = "db-123";
      const rateLimitError = { status: 429, code: "rate_limited" };

      // All calls fail with rate limit
      mockDatabasesRetrieve.mockRejectedValue(rateLimitError);

      vi.useFakeTimers();

      // Start the operation and immediately attach error handler to prevent unhandled rejection
      let caughtError: unknown;
      const resultPromise = wrapper.getDataSourceId(databaseId).catch((err) => {
        caughtError = err;
      });

      // Advance through all retry delays (4 attempts: initial + 3 retries)
      // Need enough time for: 1000ms + 2000ms + 4000ms backoff delays
      await vi.advanceTimersByTimeAsync(10000);

      // Wait for the promise to settle
      await resultPromise;

      vi.useRealTimers();

      expect(caughtError).toBeInstanceOf(NotionRateLimitError);
      expect((caughtError as Error).message).toBe(
        "Rate limit exceeded after 3 retries"
      );
      expect(mockDatabasesRetrieve).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it("uses retry-after header when available", async () => {
      const databaseId = "db-123";
      const dataSourceId = "ds-456";
      const dbResponse = mockDatabaseResponse(databaseId, dataSourceId);

      const rateLimitError = {
        status: 429,
        code: "rate_limited",
        headers: { "retry-after": "5" }, // 5 seconds
      };

      mockDatabasesRetrieve
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(dbResponse);

      vi.useFakeTimers();
      const resultPromise = wrapper.getDataSourceId(databaseId);

      // Should wait 5000ms as per retry-after header
      await vi.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;
      vi.useRealTimers();

      expect(result).toBe(dataSourceId);
    });

    it("rethrows non-rate-limit errors immediately", async () => {
      const databaseId = "db-123";
      const notFoundError = new Error("Database not found");
      (notFoundError as Error & { status?: number }).status = 404;

      mockDatabasesRetrieve.mockRejectedValueOnce(notFoundError);

      await expect(wrapper.getDataSourceId(databaseId)).rejects.toThrow(
        "Database not found"
      );
      // Should not retry
      expect(mockDatabasesRetrieve).toHaveBeenCalledTimes(1);
    });

    it("recognizes rate limit by code property", async () => {
      const databaseId = "db-123";
      const dataSourceId = "ds-456";
      const dbResponse = mockDatabaseResponse(databaseId, dataSourceId);

      // Error with code instead of status
      const rateLimitError = { code: "rate_limited" };
      mockDatabasesRetrieve
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(dbResponse);

      vi.useFakeTimers();
      const resultPromise = wrapper.getDataSourceId(databaseId);
      await vi.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;
      vi.useRealTimers();

      expect(result).toBe(dataSourceId);
      expect(mockDatabasesRetrieve).toHaveBeenCalledTimes(2);
    });
  });

  describe("rawClient accessor", () => {
    it("exposes the underlying Notion client", () => {
      const raw = wrapper.rawClient;

      expect(raw).toBeDefined();
      expect(raw.databases).toBeDefined();
      expect(raw.dataSources).toBeDefined();
      expect(raw.blocks).toBeDefined();
    });
  });

  describe("constructor defaults", () => {
    it("uses default minRequestInterval of 334ms", () => {
      const wrapperWithDefaults = new NotionClientWrapper({ token: "test" });
      // Access private property for testing (not ideal but necessary here)
      const interval = (
        wrapperWithDefaults as unknown as { minRequestInterval: number }
      ).minRequestInterval;
      expect(interval).toBe(334);
    });

    it("uses default maxRetries of 3", () => {
      const wrapperWithDefaults = new NotionClientWrapper({ token: "test" });
      const retries = (wrapperWithDefaults as unknown as { maxRetries: number })
        .maxRetries;
      expect(retries).toBe(3);
    });
  });
});
