import { describe, expect, it } from "vitest";
import { parseRepoInput, verifyRepository } from "@/lib/github";

describe("parseRepoInput", () => {
  it("accepts common forms", () => {
    expect(parseRepoInput("https://github.com/vercel/next.js")).toEqual({ owner: "vercel", name: "next.js" });
    expect(parseRepoInput("github.com/vercel/next.js/")).toEqual({ owner: "vercel", name: "next.js" });
    expect(parseRepoInput("vercel/next.js")).toEqual({ owner: "vercel", name: "next.js" });
    expect(parseRepoInput("https://github.com/a/b.git")).toEqual({ owner: "a", name: "b" });
  });
  it("rejects everything else", () => {
    for (const bad of ["https://gitlab.com/a/b", "https://github.com/a", "https://github.com/a/b/issues", "https://github.com:8080/a/b", "https://user@github.com/a/b", "", "a/.."]) {
      expect(parseRepoInput(bad)).toBeNull();
    }
  });
});

const NOW = new Date("2026-11-24T00:00:00Z");

function fakeGitHub(repo: Record<string, unknown> | null, files: Record<string, string>) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const path = url.replace("https://api.github.com", "");
    if (/^\/repos\/[^/]+\/[^/]+$/.test(path)) {
      return repo ? new Response(JSON.stringify(repo), { status: 200 }) : new Response("", { status: 404 });
    }
    const match = /^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/.exec(path);
    if (match) {
      const key = `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}/${match[3]}`;
      return key in files ? new Response(files[key], { status: 200 }) : new Response("", { status: 404 });
    }
    return new Response("", { status: 500 });
  }) as typeof fetch;
}

const baseRepo = {
  id: 42,
  name: "Widget",
  owner: { login: "Octo" },
  private: false,
  archived: false,
  disabled: false,
  fork: false,
  pushed_at: "2026-11-20T00:00:00Z",
  stargazers_count: 99,
  description: "A widget",
  language: "Rust",
};

describe("verifyRepository", () => {
  it("passes an active public repo with funding and uses GitHub's casing", async () => {
    const res = await verifyRepository("octo/widget", {
      now: NOW,
      fetchImpl: fakeGitHub(baseRepo, { "Octo/Widget/.github/FUNDING.yml": "github: octo" }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repo.owner).toBe("Octo");
      expect(res.repo.name).toBe("Widget");
      expect(res.repo.githubRepoId).toBe("42");
      expect(res.repo.fundingLinks[0].url).toBe("https://github.com/sponsors/octo");
    }
  });

  it("falls back to the owner's .github repo for FUNDING.yml", async () => {
    const res = await verifyRepository("octo/widget", {
      now: NOW,
      fetchImpl: fakeGitHub(baseRepo, { "Octo/.github/FUNDING.yml": "ko_fi: octo" }),
    });
    expect(res.ok && res.repo.fundingLinks[0].platform).toBe("ko_fi");
  });

  it.each([
    [{ ...baseRepo, archived: true }, "archived"],
    [{ ...baseRepo, fork: true }, "Forks"],
    [{ ...baseRepo, pushed_at: "2026-08-01T00:00:00Z" }, "60 days"],
    [null, "doesn't exist"],
  ])("rejects %#", async (repo, message) => {
    const res = await verifyRepository("octo/widget", {
      now: NOW,
      fetchImpl: fakeGitHub(repo, { "Octo/Widget/.github/FUNDING.yml": "github: octo" }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain(message);
  });

  it("rejects repos without funding links", async () => {
    const res = await verifyRepository("octo/widget", { now: NOW, fetchImpl: fakeGitHub(baseRepo, {}) });
    expect(!res.ok && res.reason).toContain("funding");
  });

  it("reports rate limits clearly", async () => {
    const fetchImpl = (async () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } })) as typeof fetch;
    const res = await verifyRepository("octo/widget", { now: NOW, fetchImpl });
    expect(!res.ok && res.reason).toContain("rate-limiting");
  });
});

describe("credential fallback", () => {
  it("retries without credentials when GitHub rejects them", async () => {
    process.env.GITHUB_ID = "id";
    process.env.GITHUB_SECRET = "secret";
    const inner = fakeGitHub(baseRepo, { "Octo/Widget/.github/FUNDING.yml": "github: octo" });
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers.Authorization) return new Response("", { status: 404 });
      return inner(input, init);
    }) as typeof fetch;
    const res = await verifyRepository("octo/widget", { now: NOW, fetchImpl });
    delete process.env.GITHUB_ID;
    delete process.env.GITHUB_SECRET;
    expect(res.ok).toBe(true);
  });
});
