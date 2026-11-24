import { describe, expect, it } from "vitest";
import { parseFundingYaml } from "@/lib/funding";

describe("parseFundingYaml", () => {
  it("maps known platforms and custom links", () => {
    const links = parseFundingYaml(`
github: [octo, "hub"]
open_collective: my-project
ko_fi: someone
thanks_dev: u/gh/octo
tidelift: npm/@scope/pkg
custom: ["https://example.com/donate", "paypal.me/someone"]
`);
    expect(links.map((l) => l.url)).toEqual([
      "https://github.com/sponsors/octo",
      "https://github.com/sponsors/hub",
      "https://opencollective.com/my-project",
      "https://ko-fi.com/someone",
      "https://thanks.dev/u/gh/octo",
      "https://tidelift.com/funding/github/npm/%40scope/pkg",
      "https://example.com/donate",
      "https://paypal.me/someone",
    ]);
  });

  it("skips junk, unsafe values and the GitHub template comments", () => {
    const links = parseFundingYaml(`
# These are supported funding model platforms
github: # Replace with up to 4 GitHub Sponsors-enabled usernames
patreon: "../evil"
ko_fi: "a b"
custom: ["javascript:alert(1)", "ftp://x.com", "notaurl"]
unknown_platform: hi
`);
    expect(links).toEqual([]);
  });

  it("handles invalid YAML and non-objects", () => {
    expect(parseFundingYaml("github: [")).toEqual([]);
    expect(parseFundingYaml("- a\n- b")).toEqual([]);
    expect(parseFundingYaml("")).toEqual([]);
  });
});
