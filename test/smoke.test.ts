import { describe, it, expect } from "vitest";

describe("smoke test", () => {
  it("types module exports exist", async () => {
    const types = await import("../src/types.js");
    expect(types).toBeDefined();
  });

  it("sync stubs throw not-implemented errors", async () => {
    const { syncNotionToGit } = await import("../src/sync/notion-to-git.js");
    const { syncGitToNotion } = await import("../src/sync/git-to-notion.js");

    await expect(syncNotionToGit({} as any)).rejects.toThrow("Not yet implemented");
    await expect(syncGitToNotion({} as any)).rejects.toThrow("Not yet implemented");
  });
});
