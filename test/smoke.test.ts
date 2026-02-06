import { describe, it, expect } from "vitest";

describe("smoke test", () => {
  it("types module exports exist", async () => {
    const types = await import("../src/types.js");
    expect(types).toBeDefined();
  });

  it("syncNotionToGit is exported and is a function", async () => {
    const { syncNotionToGit } = await import("../src/sync/notion-to-git.js");

    // syncNotionToGit is now fully implemented (no longer throws "Not yet implemented")
    expect(typeof syncNotionToGit).toBe("function");
  });

  it("syncGitToNotion stub throws not-implemented error", async () => {
    const { syncGitToNotion } = await import("../src/sync/git-to-notion.js");

    // syncGitToNotion is still a stub
    await expect(syncGitToNotion({} as any)).rejects.toThrow("Not yet implemented");
  });

  it("index exports all public API modules", async () => {
    const index = await import("../src/index.js");

    // Core sync functions
    expect(typeof index.syncNotionToGit).toBe("function");
    expect(typeof index.syncGitToNotion).toBe("function");

    // Notion client wrapper
    expect(typeof index.NotionClientWrapper).toBe("function");

    // Converters
    expect(typeof index.blocksToMarkdown).toBe("function");
    expect(typeof index.propertiesToFrontmatter).toBe("function");
    expect(typeof index.frontmatterToYaml).toBe("function");
    expect(typeof index.richTextToPlainText).toBe("function");
  });
});
