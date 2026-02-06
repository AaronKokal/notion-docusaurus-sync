import { describe, it, expect } from "vitest";
import { Client } from "@notionhq/client";

const TEST_DB_ID = "2ffc0fdf-942d-817f-ad7e-efd2e1887262";

/**
 * Connectivity tests — require NOTION_TOKEN env var.
 * Skipped in CI unless credentials are available.
 *
 * NOTE on SDK v5 API:
 * - databases.retrieve(database_id) returns database metadata (no properties)
 * - The database has a data_sources[] array with data source IDs
 * - dataSources.retrieve(data_source_id) returns properties
 * - dataSources.query(data_source_id) queries pages
 */
describe.skipIf(!process.env.NOTION_TOKEN)("notion connectivity", () => {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  it("can retrieve the test database", async () => {
    const db = await notion.databases.retrieve({ database_id: TEST_DB_ID });
    expect(db.id).toBe(TEST_DB_ID);
    expect((db as any).data_sources?.length).toBeGreaterThan(0);
  });

  it("can query pages via data source", async () => {
    const db = await notion.databases.retrieve({ database_id: TEST_DB_ID });
    const dsId = (db as any).data_sources[0].id;

    const response = await notion.dataSources.query({
      data_source_id: dsId,
      page_size: 10,
    });
    expect(response.results.length).toBeGreaterThan(0);
  });

  it("test database has expected properties", async () => {
    const db = await notion.databases.retrieve({ database_id: TEST_DB_ID });
    const dsId = (db as any).data_sources[0].id;
    const ds = await notion.dataSources.retrieve({ data_source_id: dsId });

    const propNames = Object.keys(ds.properties);
    expect(propNames).toContain("Name");
    expect(propNames).toContain("Status");
    expect(propNames).toContain("Slug");
    expect(propNames).toContain("Tags");
    expect(propNames).toContain("Sidebar Position");
    expect(propNames).toContain("Published Date");
    expect(propNames).toContain("Category");
  });

  it("can read block children from a page", async () => {
    const db = await notion.databases.retrieve({ database_id: TEST_DB_ID });
    const dsId = (db as any).data_sources[0].id;

    const response = await notion.dataSources.query({
      data_source_id: dsId,
      page_size: 1,
    });
    const pageId = response.results[0].id;
    const blocks = await notion.blocks.children.list({ block_id: pageId });
    expect(blocks.results.length).toBeGreaterThan(0);
  });
});
