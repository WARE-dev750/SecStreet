import { describe, it, expect } from "vitest";
import { classifyLicense, detectLicenseFromText, recommend, parseGitHubUrl, analyzeRepo, type FetchLike } from "@secstreet/analyzer";

describe("license detection", () => {
  it("classifies MIT as permissive", () => {
    const info = classifyLicense("MIT");
    expect(info.verdict).toBe("permissive");
    expect(info.copyable).toBe(true);
  });
  it("classifies GPL-3.0 as copyleft", () => {
    const info = classifyLicense("GPL-3.0");
    expect(info.verdict).toBe("copyleft");
    expect(info.copyable).toBe(false);
  });
  it("classifies an unknown license as unknown and not copyable", () => {
    const info = classifyLicense("SomeCustomLicense-1.0");
    expect(info.verdict).toBe("unknown");
    expect(info.copyable).toBe(false);
  });
  it("detects MIT from license text", () => {
    const text = "MIT License\n\nPermission is hereby granted, free of charge, to any person...";
    expect(detectLicenseFromText(text).spdx).toBe("MIT");
  });
  it("detects Apache-2.0 from license text", () => {
    const text = "Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/";
    expect(detectLicenseFromText(text).spdx).toBe("Apache-2.0");
  });
  it("detects GPL-3.0 from license text", () => {
    const text = "GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007";
    expect(detectLicenseFromText(text).spdx).toBe("GPL-3.0");
  });
  it("detects AGPL-3.0 before GPL-3.0", () => {
    const text = "GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3, 19 November 2007";
    expect(detectLicenseFromText(text).spdx).toBe("AGPL-3.0");
  });
  it("detects LGPL-3.0 before GPL-3.0", () => {
    const text = "GNU LESSER GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007";
    expect(detectLicenseFromText(text).spdx).toBe("LGPL-3.0");
  });
  it("detects BSD-3-Clause from text", () => {
    const text = "Redistribution and use in source and binary forms... Neither the name of the copyright holder...";
    expect(detectLicenseFromText(text).spdx).toBe("BSD-3-Clause");
  });
});

describe("recommendation", () => {
  it("says copy for a permissive license", () => {
    const r = recommend(classifyLicense("MIT"), false);
    expect(r.action).toBe("copy");
  });
  it("says wrap for a copyleft license with binary releases", () => {
    const r = recommend(classifyLicense("GPL-3.0"), true);
    expect(r.action).toBe("wrap");
  });
  it("says avoid for a copyleft license without releases", () => {
    const r = recommend(classifyLicense("GPL-3.0"), false);
    expect(r.action).toBe("avoid");
  });
  it("says review for an unknown license", () => {
    const r = recommend(classifyLicense("Something-1.0"), true);
    expect(r.action).toBe("review");
  });
});

describe("parseGitHubUrl", () => {
  it("accepts canonical GitHub URLs", () => {
    expect(parseGitHubUrl("https://github.com/impacket/impacket")).toEqual({ owner: "impacket", repo: "impacket" });
  });
  it("accepts URLs with .git suffix", () => {
    expect(parseGitHubUrl("https://github.com/impacket/impacket.git")).toEqual({ owner: "impacket", repo: "impacket" });
  });
  it("rejects non-GitHub URLs", () => {
    expect(parseGitHubUrl("https://gitlab.com/foo/bar")).toBeNull();
  });
});

describe("analyzeRepo", () => {
  it("classifies an MIT repo end to end", async () => {
    const fakeFetch: FetchLike = async (url) => {
      if (url.endsWith("/languages")) return jsonResp({ JavaScript: 1000 });
      if (url.includes("/releases")) return jsonResp([]);
      return jsonResp({
        full_name: "example/mit-repo",
        description: "an mit repo",
        stargazers_count: 100,
        updated_at: "2026-01-01T00:00:00Z",
        language: "JavaScript",
        license: { spdx_id: "MIT" },
        default_branch: "main",
      });
    };
    const r = await analyzeRepo("https://github.com/example/mit-repo", fakeFetch);
    expect(r.license.spdx).toBe("MIT");
    expect(r.recommendation.action).toBe("copy");
    expect(r.primaryLanguage).toBe("JavaScript");
  });

  it("classifies a GPL repo with releases as wrap", async () => {
    const fakeFetch: FetchLike = async (url) => {
      if (url.endsWith("/languages")) return jsonResp({ Go: 5000 });
      if (url.includes("/releases")) return jsonResp([{ assets: [{ name: "tool-linux-amd64" }] }]);
      return jsonResp({
        full_name: "example/gpl-tool",
        description: "a gpl tool",
        stargazers_count: 5000,
        updated_at: "2026-01-01T00:00:00Z",
        language: "Go",
        license: { spdx_id: "GPL-3.0" },
        default_branch: "main",
      });
    };
    const r = await analyzeRepo("https://github.com/example/gpl-tool", fakeFetch);
    expect(r.license.spdx).toBe("GPL-3.0");
    expect(r.recommendation.action).toBe("wrap");
    expect(r.hasBinaryReleases).toBe(true);
  });

  it("falls back to fetching LICENSE when metadata has no spdx", async () => {
    const fakeFetch: FetchLike = async (url) => {
      if (url.includes("raw.githubusercontent.com") && url.endsWith("/LICENSE")) {
        return textResp("Apache License\nVersion 2.0, January 2004");
      }
      if (url.endsWith("/languages")) return jsonResp({ Python: 100 });
      if (url.includes("/releases")) return jsonResp([]);
      return jsonResp({
        full_name: "example/unknown",
        description: null,
        stargazers_count: 1,
        updated_at: null,
        language: "Python",
        license: { spdx_id: null },
        default_branch: "main",
      });
    };
    const r = await analyzeRepo("https://github.com/example/unknown", fakeFetch);
    expect(r.license.spdx).toBe("Apache-2.0");
    expect(r.recommendation.action).toBe("copy");
  });
});

function jsonResp(obj: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(obj)),
    json: () => Promise.resolve(obj),
  });
}

function textResp(t: string) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(t),
    json: () => Promise.reject(new Error("not json")),
  });
}
