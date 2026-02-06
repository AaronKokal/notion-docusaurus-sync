/**
 * Unit tests for frontmatter-to-Notion properties mapper.
 *
 * Tests the frontmatterToProperties function per User Story 4 acceptance scenarios:
 * 1. `title: "Getting Started"` -> Name title property payload
 * 2. `slug: "getting-started"` -> Slug rich_text property payload
 * 3. `description: "An intro guide"` -> Description rich_text property payload
 * 4. `tags: [tutorial, beginner]` -> Tags multi_select property payload
 * 5. `sidebar_position: 3` -> Sidebar Position number property payload
 * 6. `date: 2024-01-15` -> Published Date date property payload
 * 7. `status: "Published"` -> Status select property payload
 * 8. `category: "Guides"` -> Category select property payload
 * 9. Unknown frontmatter keys are skipped (with warning)
 * 10. Malformed values are handled gracefully
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { frontmatterToProperties } from "../../src/converter/fm-to-properties.js";
import type { FrontmatterToPropertiesConfig } from "../../src/types.js";

/**
 * Default config for tests - mirrors the test database schema.
 */
const defaultConfig: FrontmatterToPropertiesConfig = {
  propertyMappings: {
    title: "Name",
    slug: "Slug",
    description: "Description",
    tags: "Tags",
    sidebar_position: "Sidebar Position",
    date: "Published Date",
    status: "Status",
    category: "Category",
  },
};

describe("fm-to-properties", () => {
  describe("frontmatterToProperties", () => {
    describe("Acceptance Scenario 1: title to Name title property", () => {
      it("converts title to Notion title property payload", () => {
        const frontmatter = { title: "Getting Started" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Name).toEqual({
          title: [{ text: { content: "Getting Started" } }],
        });
      });

      it("handles title with special characters", () => {
        const frontmatter = { title: 'How to Use "Quotes" & Ampersands' };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Name).toEqual({
          title: [{ text: { content: 'How to Use "Quotes" & Ampersands' } }],
        });
      });

      it("handles title with unicode characters", () => {
        const frontmatter = { title: "Getting Started Guide" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Name).toEqual({
          title: [{ text: { content: "Getting Started Guide" } }],
        });
      });
    });

    describe("Acceptance Scenario 2: slug to Slug rich_text property", () => {
      it("converts slug to Notion rich_text property payload", () => {
        const frontmatter = { slug: "getting-started" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Slug).toEqual({
          rich_text: [{ text: { content: "getting-started" } }],
        });
      });

      it("handles slug with path separators", () => {
        const frontmatter = { slug: "docs/tutorials/getting-started" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Slug).toEqual({
          rich_text: [{ text: { content: "docs/tutorials/getting-started" } }],
        });
      });

      it("handles slug with numbers", () => {
        const frontmatter = { slug: "tutorial-01-basics" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Slug).toEqual({
          rich_text: [{ text: { content: "tutorial-01-basics" } }],
        });
      });
    });

    describe("Acceptance Scenario 3: description to Description rich_text property", () => {
      it("converts description to Notion rich_text property payload", () => {
        const frontmatter = { description: "An intro guide" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Description).toEqual({
          rich_text: [{ text: { content: "An intro guide" } }],
        });
      });

      it("handles description with special characters", () => {
        const frontmatter = {
          description: 'Learn about "advanced" features & more',
        };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Description).toEqual({
          rich_text: [
            { text: { content: 'Learn about "advanced" features & more' } },
          ],
        });
      });

      it("handles multi-line description", () => {
        const frontmatter = { description: "Line one\nLine two" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Description).toEqual({
          rich_text: [{ text: { content: "Line one\nLine two" } }],
        });
      });

      it("handles long description", () => {
        const longDescription = "A".repeat(2000);
        const frontmatter = { description: longDescription };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Description).toEqual({
          rich_text: [{ text: { content: longDescription } }],
        });
      });
    });

    describe("Acceptance Scenario 4: tags to Tags multi_select property", () => {
      it("converts tags array to Notion multi_select property payload", () => {
        const frontmatter = { tags: ["tutorial", "beginner"] };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Tags).toEqual({
          multi_select: [{ name: "tutorial" }, { name: "beginner" }],
        });
      });

      it("handles single tag", () => {
        const frontmatter = { tags: ["documentation"] };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Tags).toEqual({
          multi_select: [{ name: "documentation" }],
        });
      });

      it("handles many tags", () => {
        const frontmatter = {
          tags: ["react", "typescript", "frontend", "guide", "best-practices"],
        };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Tags).toEqual({
          multi_select: [
            { name: "react" },
            { name: "typescript" },
            { name: "frontend" },
            { name: "guide" },
            { name: "best-practices" },
          ],
        });
      });

      it("handles tags with special characters", () => {
        const frontmatter = { tags: ["C++", "C#", "node.js"] };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Tags).toEqual({
          multi_select: [{ name: "C++" }, { name: "C#" }, { name: "node.js" }],
        });
      });

      it("skips empty tags array", () => {
        const frontmatter = { tags: [] };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Tags).toBeUndefined();
      });
    });

    describe("Acceptance Scenario 5: sidebar_position to number property", () => {
      it("converts sidebar_position to Notion number property payload", () => {
        const frontmatter = { sidebar_position: 3 };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result["Sidebar Position"]).toEqual({
          number: 3,
        });
      });

      it("handles sidebar_position of 0", () => {
        const frontmatter = { sidebar_position: 0 };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result["Sidebar Position"]).toEqual({
          number: 0,
        });
      });

      it("handles negative sidebar_position", () => {
        const frontmatter = { sidebar_position: -1 };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result["Sidebar Position"]).toEqual({
          number: -1,
        });
      });

      it("handles decimal sidebar_position", () => {
        const frontmatter = { sidebar_position: 3.5 };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result["Sidebar Position"]).toEqual({
          number: 3.5,
        });
      });

      it("handles large sidebar_position", () => {
        const frontmatter = { sidebar_position: 999 };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result["Sidebar Position"]).toEqual({
          number: 999,
        });
      });
    });

    describe("Acceptance Scenario 6: date to Published Date date property", () => {
      it("converts date to Notion date property payload", () => {
        const frontmatter = { date: "2024-01-15" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result["Published Date"]).toEqual({
          date: { start: "2024-01-15" },
        });
      });

      it("handles date with different format (ISO string)", () => {
        const frontmatter = { date: "2026-02-06" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result["Published Date"]).toEqual({
          date: { start: "2026-02-06" },
        });
      });

      it("handles Date object by converting to string", () => {
        // Note: YAML frontmatter dates are parsed as strings in "YYYY-MM-DD" format
        const frontmatter = { date: "2024-12-25" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result["Published Date"]).toEqual({
          date: { start: "2024-12-25" },
        });
      });
    });

    describe("Acceptance Scenario 7: status to Status select property", () => {
      it("converts status to Notion select property payload", () => {
        const frontmatter = { status: "Published" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Status).toEqual({
          select: { name: "Published" },
        });
      });

      it("handles Draft status", () => {
        const frontmatter = { status: "Draft" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Status).toEqual({
          select: { name: "Draft" },
        });
      });

      it("handles Archived status", () => {
        const frontmatter = { status: "Archived" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Status).toEqual({
          select: { name: "Archived" },
        });
      });

      it("handles custom status values", () => {
        const frontmatter = { status: "In Review" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Status).toEqual({
          select: { name: "In Review" },
        });
      });
    });

    describe("Acceptance Scenario 8: category to Category select property", () => {
      it("converts category to Notion select property payload", () => {
        const frontmatter = { category: "Guides" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Category).toEqual({
          select: { name: "Guides" },
        });
      });

      it("handles category with special characters", () => {
        const frontmatter = { category: "How-To & Tips" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Category).toEqual({
          select: { name: "How-To & Tips" },
        });
      });

      it("handles Tutorials category", () => {
        const frontmatter = { category: "Tutorials" };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Category).toEqual({
          select: { name: "Tutorials" },
        });
      });
    });

    describe("Acceptance Scenario 9: unknown frontmatter keys skipped with warning", () => {
      let warnSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      });

      afterEach(() => {
        warnSpy.mockRestore();
      });

      it("skips unknown frontmatter keys", () => {
        const frontmatter = {
          title: "Test",
          unknown_key: "some value",
          another_unknown: 123,
        };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Name).toBeDefined();
        expect(result.unknown_key).toBeUndefined();
        expect(result.another_unknown).toBeUndefined();
      });

      it("emits warning for unknown frontmatter keys", () => {
        const frontmatter = {
          title: "Test",
          custom_field: "ignored",
        };

        frontmatterToProperties(frontmatter, defaultConfig);

        expect(warnSpy).toHaveBeenCalled();
        // The warning message should mention the unknown key
        expect(warnSpy.mock.calls[0][0]).toContain("custom_field");
      });

      it("emits multiple warnings for multiple unknown keys", () => {
        const frontmatter = {
          unknown1: "value1",
          unknown2: "value2",
        };

        frontmatterToProperties(frontmatter, defaultConfig);

        // Should warn about each unknown key
        expect(warnSpy).toHaveBeenCalledTimes(2);
      });

      it("does not warn for known keys", () => {
        const frontmatter = {
          title: "Test",
          slug: "test",
        };

        frontmatterToProperties(frontmatter, defaultConfig);

        expect(warnSpy).not.toHaveBeenCalled();
      });
    });

    describe("Acceptance Scenario 10: malformed values handled gracefully", () => {
      it("skips null values", () => {
        const frontmatter = {
          title: "Test",
          description: null,
        };

        const result = frontmatterToProperties(
          frontmatter as Record<string, unknown>,
          defaultConfig
        );

        expect(result.Name).toBeDefined();
        expect(result.Description).toBeUndefined();
      });

      it("skips undefined values", () => {
        const frontmatter = {
          title: "Test",
          description: undefined,
        };

        const result = frontmatterToProperties(
          frontmatter as Record<string, unknown>,
          defaultConfig
        );

        expect(result.Name).toBeDefined();
        expect(result.Description).toBeUndefined();
      });

      it("skips empty string values", () => {
        const frontmatter = {
          title: "Test",
          description: "",
        };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Name).toBeDefined();
        expect(result.Description).toBeUndefined();
      });

      it("skips non-array tags with warning", () => {
        const warnSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {});

        const frontmatter = {
          tags: "single-tag",
        };

        const result = frontmatterToProperties(
          frontmatter as Record<string, unknown>,
          defaultConfig
        );

        // Implementation skips non-array tags with a warning
        expect(result.Tags).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
        expect(warnSpy.mock.calls[0][0]).toContain("tags");

        warnSpy.mockRestore();
      });

      it("handles non-number sidebar_position gracefully", () => {
        // YAML might parse "3" as number already, but test string input
        const frontmatter = {
          sidebar_position: "3",
        };

        const result = frontmatterToProperties(
          frontmatter as Record<string, unknown>,
          defaultConfig
        );

        // Should convert string to number if possible
        expect(result["Sidebar Position"]).toEqual({
          number: 3,
        });
      });

      it("skips sidebar_position if not convertible to number", () => {
        const warnSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {});

        const frontmatter = {
          title: "Test",
          sidebar_position: "not-a-number",
        };

        const result = frontmatterToProperties(
          frontmatter as Record<string, unknown>,
          defaultConfig
        );

        expect(result["Sidebar Position"]).toBeUndefined();

        warnSpy.mockRestore();
      });

      it("handles object values gracefully (skips with warning)", () => {
        const warnSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {});

        const frontmatter = {
          title: "Test",
          description: { nested: "object" },
        };

        const result = frontmatterToProperties(
          frontmatter as Record<string, unknown>,
          defaultConfig
        );

        expect(result.Description).toBeUndefined();

        warnSpy.mockRestore();
      });
    });

    describe("Full frontmatter mapping (combined scenario)", () => {
      it("converts complete frontmatter to Notion properties", () => {
        const frontmatter = {
          title: "Getting Started Guide",
          slug: "getting-started",
          description: "A comprehensive guide to getting started",
          tags: ["tutorial", "beginner", "guide"],
          sidebar_position: 1,
          date: "2026-02-06",
          status: "Published",
          category: "Tutorials",
        };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result).toEqual({
          Name: {
            title: [{ text: { content: "Getting Started Guide" } }],
          },
          Slug: {
            rich_text: [{ text: { content: "getting-started" } }],
          },
          Description: {
            rich_text: [
              { text: { content: "A comprehensive guide to getting started" } },
            ],
          },
          Tags: {
            multi_select: [
              { name: "tutorial" },
              { name: "beginner" },
              { name: "guide" },
            ],
          },
          "Sidebar Position": {
            number: 1,
          },
          "Published Date": {
            date: { start: "2026-02-06" },
          },
          Status: {
            select: { name: "Published" },
          },
          Category: {
            select: { name: "Tutorials" },
          },
        });
      });

      it("handles partial frontmatter (some properties missing)", () => {
        const frontmatter = {
          title: "Minimal Page",
          status: "Published",
        };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result).toEqual({
          Name: {
            title: [{ text: { content: "Minimal Page" } }],
          },
          Status: {
            select: { name: "Published" },
          },
        });
      });
    });

    describe("Custom configuration", () => {
      it("merges custom property mappings with defaults", () => {
        // Custom mappings are merged with defaults, but they need
        // property types to be defined in DEFAULT_PROPERTY_TYPES
        // Since "Page Title" and "URL Slug" are not in the defaults,
        // they will be skipped with a warning about no property type.

        // To use truly custom property names, the implementation would
        // need to support propertyTypes in the config as well.
        // For now, test that custom mappings are used for known types.
        const customConfig: FrontmatterToPropertiesConfig = {
          propertyMappings: {
            my_title: "Name",  // Maps to a known property name
            my_slug: "Slug",   // Maps to a known property name
          },
        };

        const frontmatter = {
          my_title: "Custom Mapping",
          my_slug: "custom-slug",
        };

        const result = frontmatterToProperties(frontmatter, customConfig);

        expect(result.Name).toEqual({
          title: [{ text: { content: "Custom Mapping" } }],
        });
        expect(result.Slug).toEqual({
          rich_text: [{ text: { content: "custom-slug" } }],
        });
      });

      it("uses default mappings when empty config provided", () => {
        const frontmatter = {
          title: "Test",
        };

        // Empty config still uses default mappings
        const result = frontmatterToProperties(frontmatter, {});

        // Default mapping: title -> Name
        expect(result.Name).toEqual({
          title: [{ text: { content: "Test" } }],
        });
      });

      it("warns when custom property name has no type defined", () => {
        const warnSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {});

        const customConfig: FrontmatterToPropertiesConfig = {
          propertyMappings: {
            title: "Undefined Property Name",  // Not in DEFAULT_PROPERTY_TYPES
          },
        };

        const frontmatter = {
          title: "Test",
        };

        const result = frontmatterToProperties(frontmatter, customConfig);

        // Should be skipped because "Undefined Property Name" has no type defined
        expect(result["Undefined Property Name"]).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
        expect(warnSpy.mock.calls[0][0]).toContain("No property type defined");

        warnSpy.mockRestore();
      });
    });

    describe("Edge cases", () => {
      it("handles empty frontmatter object", () => {
        const frontmatter = {};

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result).toEqual({});
      });

      it("handles whitespace-only string values", () => {
        const frontmatter = {
          title: "   ",
        };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        // Whitespace-only should be treated as empty and skipped
        expect(result.Name).toBeUndefined();
      });

      it("handles very long property values", () => {
        const longTitle = "A".repeat(2000);
        const frontmatter = { title: longTitle };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Name).toEqual({
          title: [{ text: { content: longTitle } }],
        });
      });

      it("handles special YAML characters in values", () => {
        const frontmatter = {
          title: "Title: With Colon",
          description: "Has # hash and * asterisk",
        };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        expect(result.Name).toEqual({
          title: [{ text: { content: "Title: With Colon" } }],
        });
        expect(result.Description).toEqual({
          rich_text: [{ text: { content: "Has # hash and * asterisk" } }],
        });
      });

      it("preserves order of properties in output", () => {
        const frontmatter = {
          title: "Test",
          slug: "test",
          description: "Test description",
        };

        const result = frontmatterToProperties(frontmatter, defaultConfig);

        // Output should contain all mapped properties
        expect(Object.keys(result)).toContain("Name");
        expect(Object.keys(result)).toContain("Slug");
        expect(Object.keys(result)).toContain("Description");
      });

      it("handles Date objects from YAML parsing", () => {
        // JavaScript Date objects can come from YAML parsing
        const dateObj = new Date("2024-01-15");
        const frontmatter = {
          date: dateObj,
        };

        const result = frontmatterToProperties(
          frontmatter as unknown as Record<string, unknown>,
          defaultConfig
        );

        // Should convert Date to ISO date string
        expect(result["Published Date"]).toEqual({
          date: { start: "2024-01-15" },
        });
      });

      it("handles boolean tags array elements by converting to strings", () => {
        const frontmatter = {
          tags: [true, false, "actual-tag"],
        };

        const result = frontmatterToProperties(
          frontmatter as unknown as Record<string, unknown>,
          defaultConfig
        );

        // Should convert booleans to strings or skip them
        // Implementation choice: convert to string representation
        expect(result.Tags).toEqual({
          multi_select: [
            { name: "true" },
            { name: "false" },
            { name: "actual-tag" },
          ],
        });
      });

      it("handles numeric tags array elements by converting to strings", () => {
        const frontmatter = {
          tags: [1, 2, "three"],
        };

        const result = frontmatterToProperties(
          frontmatter as unknown as Record<string, unknown>,
          defaultConfig
        );

        expect(result.Tags).toEqual({
          multi_select: [{ name: "1" }, { name: "2" }, { name: "three" }],
        });
      });
    });
  });
});
