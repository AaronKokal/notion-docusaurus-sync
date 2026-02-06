/**
 * Notion SDK v5 Client Wrapper.
 *
 * Handles the dataSources API indirection, pagination, rate limiting,
 * and recursive block fetching so the rest of the codebase doesn't
 * deal with these low-level concerns.
 */

import {
  Client,
  isFullPage,
  isFullBlock,
  getDataSourcesFromDatabase,
  type NotionPage,
  type NotionBlock,
} from "./types.js";

/**
 * Configuration for the NotionClientWrapper.
 */
export interface NotionClientConfig {
  /** Notion integration token */
  token: string;
  /** Minimum delay between requests in ms (default: 334ms for 3 req/s) */
  minRequestInterval?: number;
  /** Maximum retry attempts on 429 (default: 3) */
  maxRetries?: number;
}

/**
 * Error thrown when rate limiting exhausts retries.
 */
export class NotionRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = "NotionRateLimitError";
  }
}

/**
 * SDK v5 client wrapper that handles data source resolution, pagination,
 * rate limiting, and recursive block fetching.
 *
 * @example
 * ```ts
 * const client = new NotionClientWrapper({ token: process.env.NOTION_TOKEN! });
 * const dataSourceId = await client.getDataSourceId(databaseId);
 * const pages = await client.queryPages(dataSourceId);
 * for (const page of pages) {
 *   const blocks = await client.getPageBlocks(page.id);
 * }
 * ```
 */
export class NotionClientWrapper {
  private readonly client: Client;
  private readonly minRequestInterval: number;
  private readonly maxRetries: number;

  /** Timestamp of the last API request (for rate limiting) */
  private lastRequestTime: number = 0;

  /** Cache of database ID → data source ID */
  private dataSourceCache: Map<string, string> = new Map();

  constructor(config: NotionClientConfig) {
    this.client = new Client({ auth: config.token });
    this.minRequestInterval = config.minRequestInterval ?? 334; // 3 req/s
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * Resolves the data source ID for a database.
   *
   * The SDK v5 API requires querying via data source IDs rather than
   * database IDs directly. This method calls `databases.retrieve` and
   * extracts the first data source ID from the response.
   *
   * Results are cached per instance — subsequent calls for the same
   * database ID return the cached value without hitting the API.
   *
   * @param databaseId - The Notion database ID
   * @returns The data source ID for querying pages
   * @throws Error if the database has no data sources
   */
  async getDataSourceId(databaseId: string): Promise<string> {
    // Return cached value if available
    const cached = this.dataSourceCache.get(databaseId);
    if (cached) {
      return cached;
    }

    // Fetch database metadata
    const response = await this.executeWithRateLimiting(() =>
      this.client.databases.retrieve({ database_id: databaseId })
    );

    // Extract data_sources using the helper (handles SDK type gaps)
    const dataSources = getDataSourcesFromDatabase(response);

    if (!dataSources || dataSources.length === 0) {
      throw new Error(
        `Database ${databaseId} has no data sources. ` +
          `Ensure you're using the SDK v5 API and the database exists.`
      );
    }

    const dataSourceId = dataSources[0].id;

    // Cache for future calls
    this.dataSourceCache.set(databaseId, dataSourceId);

    return dataSourceId;
  }

  /**
   * Queries all pages from a data source.
   *
   * Handles pagination automatically — if the response indicates more
   * results are available, this method continues fetching until all
   * pages are retrieved.
   *
   * @param dataSourceId - The data source ID (from getDataSourceId)
   * @param filter - Optional filter object for the query
   * @returns Array of all pages from the data source
   */
  async queryPages(
    dataSourceId: string,
    filter?: unknown
  ): Promise<NotionPage[]> {
    const allPages: NotionPage[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const queryParams: any = {
        data_source_id: dataSourceId,
        start_cursor: cursor,
      };
      if (filter) {
        queryParams.filter = filter;
      }
      const response = await this.executeWithRateLimiting(() =>
        this.client.dataSources.query(queryParams)
      );

      // Filter to full page objects only
      for (const result of response.results) {
        if (isFullPage(result)) {
          allPages.push(result);
        }
      }

      hasMore = response.has_more;
      cursor = response.next_cursor ?? undefined;
    }

    return allPages;
  }

  /**
   * Fetches all blocks for a page, including nested children.
   *
   * Handles pagination and recursively fetches child blocks for any
   * block that has `has_children: true`. This ensures the complete
   * block tree is returned.
   *
   * @param pageId - The Notion page ID
   * @returns Array of all blocks (including nested children)
   */
  async getPageBlocks(pageId: string): Promise<NotionBlock[]> {
    return this.fetchBlockChildren(pageId);
  }

  /**
   * Recursively fetches block children.
   *
   * @param blockId - The parent block or page ID
   * @returns Array of blocks with their children populated
   */
  private async fetchBlockChildren(blockId: string): Promise<NotionBlock[]> {
    const allBlocks: NotionBlock[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.executeWithRateLimiting(() =>
        this.client.blocks.children.list({
          block_id: blockId,
          start_cursor: cursor,
        })
      );

      for (const result of response.results) {
        if (isFullBlock(result)) {
          allBlocks.push(result);

          // Recursively fetch children if present
          if (result.has_children) {
            const children = await this.fetchBlockChildren(result.id);
            // Attach children to the block for processing
            // We store them in a custom property that the converter will use
            (result as NotionBlock & { children?: NotionBlock[] }).children =
              children;
          }
        }
      }

      hasMore = response.has_more;
      cursor = response.next_cursor ?? undefined;
    }

    return allBlocks;
  }

  /**
   * Executes an API call with rate limiting and retry logic.
   *
   * - Ensures minimum interval between requests (3 req/s)
   * - On 429 response, retries with exponential backoff (1s, 2s, 4s)
   * - Throws NotionRateLimitError if retries are exhausted
   *
   * @param apiCall - The API call to execute
   * @returns The API response
   */
  private async executeWithRateLimiting<T>(apiCall: () => Promise<T>): Promise<T> {
    // Enforce minimum interval between requests
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await this.sleep(this.minRequestInterval - elapsed);
    }

    let lastError: unknown;
    let retryDelay = 1000; // Start with 1 second

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.lastRequestTime = Date.now();
        return await apiCall();
      } catch (error) {
        lastError = error;

        // Check if this is a rate limit error (429)
        if (this.isRateLimitError(error)) {
          if (attempt < this.maxRetries) {
            // Get retry-after from error if available, otherwise use exponential backoff
            const retryAfter = this.getRetryAfter(error) ?? retryDelay;
            await this.sleep(retryAfter);
            retryDelay *= 2; // Exponential backoff for next attempt
            continue;
          }

          // Retries exhausted
          throw new NotionRateLimitError(
            `Rate limit exceeded after ${this.maxRetries} retries`,
            this.getRetryAfter(error)
          );
        }

        // Non-rate-limit error, rethrow immediately
        throw error;
      }
    }

    // Should never reach here, but TypeScript needs this
    throw lastError;
  }

  /**
   * Checks if an error is a Notion rate limit error (HTTP 429).
   */
  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === "object") {
      // Notion SDK errors have a 'code' property for API errors
      // and a 'status' property for HTTP status codes
      const err = error as { status?: number; code?: string };
      return err.status === 429 || err.code === "rate_limited";
    }
    return false;
  }

  /**
   * Extracts the retry-after value from a rate limit error (in ms).
   */
  private getRetryAfter(error: unknown): number | undefined {
    if (error && typeof error === "object") {
      const err = error as { headers?: { "retry-after"?: string } };
      const retryAfter = err.headers?.["retry-after"];
      if (retryAfter) {
        // Retry-after is in seconds, convert to ms
        return parseInt(retryAfter, 10) * 1000;
      }
    }
    return undefined;
  }

  /**
   * Sleeps for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clears the data source cache.
   * Useful for testing or when database structure changes.
   */
  clearCache(): void {
    this.dataSourceCache.clear();
  }

  /**
   * Exposes the underlying Notion client for advanced use cases.
   * Use with caution — prefer the wrapper methods for standard operations.
   */
  get rawClient(): Client {
    return this.client;
  }
}
