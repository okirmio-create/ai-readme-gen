import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { scanProject } from "../src/scanner.js";
import { analyzeProject } from "../src/analyzer.js";
import { generateDoc } from "../src/generator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SELF_DIR = path.join(__dirname, "..");
const PKG = JSON.parse(fs.readFileSync(path.join(SELF_DIR, "package.json"), "utf-8")) as { name: string; version: string };

// ── scanner ────────────────────────────────────────────────────────────────

describe("scanProject", () => {
  it("scans own project directory without error", async () => {
    const result = await scanProject(SELF_DIR);
    expect(result.rootDir).toBe(SELF_DIR);
    expect(result.packageJson).toBeDefined();
    expect(result.packageJson?.name).toBe(PKG.name);
  });

  it("detects source files", async () => {
    const result = await scanProject(SELF_DIR);
    expect(result.sourceFiles.length).toBeGreaterThan(0);
    const hasTsFiles = result.sourceFiles.some((f) => f.endsWith(".ts"));
    expect(hasTsFiles).toBe(true);
  });

  it("detects config files", async () => {
    const result = await scanProject(SELF_DIR);
    const hasTs = result.configFiles.some((f) => f.includes("tsconfig"));
    expect(hasTs).toBe(true);
  });

  it("builds a file tree string", async () => {
    const result = await scanProject(SELF_DIR);
    expect(typeof result.fileTree).toBe("string");
    expect(result.fileTree.length).toBeGreaterThan(0);
  });
});

// ── analyzer ───────────────────────────────────────────────────────────────

describe("analyzeProject", () => {
  it("detects TypeScript language", async () => {
    const scan = await scanProject(SELF_DIR);
    const analysis = await analyzeProject(scan);
    expect(analysis.language).toBe("TypeScript");
  });

  it("extracts name and version from package.json", async () => {
    const scan = await scanProject(SELF_DIR);
    const analysis = await analyzeProject(scan);
    expect(analysis.name).toBe(PKG.name);
    expect(analysis.version).toBe(PKG.version);
  });

  it("detects CLI (has bin field)", async () => {
    const scan = await scanProject(SELF_DIR);
    const analysis = await analyzeProject(scan);
    expect(analysis.isCli).toBe(true);
  });

  it("extracts dependencies", async () => {
    const scan = await scanProject(SELF_DIR);
    const analysis = await analyzeProject(scan);
    expect(analysis.dependencies).toContain("commander");
    expect(analysis.dependencies).toContain("chalk");
  });

  it("includes install command", async () => {
    const scan = await scanProject(SELF_DIR);
    const analysis = await analyzeProject(scan);
    expect(analysis.installCommand).toContain("install");
  });

  it("extracts exported symbols", async () => {
    const scan = await scanProject(SELF_DIR);
    const analysis = await analyzeProject(scan);
    // scanner.ts exports scanProject
    const hasExport = analysis.exports.some((e) => e.name === "scanProject");
    expect(hasExport).toBe(true);
  });
});

// ── generator ──────────────────────────────────────────────────────────────

describe("generateDoc", () => {
  let analysis: Awaited<ReturnType<typeof analyzeProject>>;

  beforeAll(async () => {
    const scan = await scanProject(SELF_DIR);
    analysis = await analyzeProject(scan);
  });

  it("generates a non-empty README", () => {
    const doc = generateDoc(analysis, "readme", "standard");
    expect(doc.length).toBeGreaterThan(100);
    expect(doc).toContain(`# ${PKG.name}`);
  });

  it("generated README contains installation section", () => {
    const doc = generateDoc(analysis, "readme", "standard");
    expect(doc).toContain("## Installation");
  });

  it("generates API docs", () => {
    const doc = generateDoc(analysis, "api", "standard");
    expect(doc).toContain("# API Reference");
  });

  it("generates CONTRIBUTING guide", () => {
    const doc = generateDoc(analysis, "contributing", "standard");
    expect(doc).toContain("# Contributing");
  });

  it("generates CHANGELOG", () => {
    const doc = generateDoc(analysis, "changelog", "standard");
    expect(doc).toContain("# Changelog");
    expect(doc).toContain("1.0.0");
  });

  it("minimal style skips Features section", () => {
    const doc = generateDoc(analysis, "readme", "minimal");
    expect(doc).not.toContain("## Features");
  });

  it("detailed style includes API section when exports exist", () => {
    const doc = generateDoc(analysis, "readme", "detailed");
    if (analysis.exports.length > 0) {
      expect(doc).toContain("## API");
    }
  });
});
