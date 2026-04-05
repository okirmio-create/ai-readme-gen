import fs from "fs-extra";
import path from "node:path";
import { glob } from "glob";
import yaml from "js-yaml";

export interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  bin?: Record<string, string> | string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  keywords?: string[];
  author?: string | { name: string; email?: string; url?: string };
  license?: string;
  repository?: string | { type: string; url: string };
  homepage?: string;
  engines?: Record<string, string>;
}

export interface GoMod {
  module: string;
  goVersion: string;
  requires: string[];
}

export interface CargoToml {
  name?: string;
  version?: string;
  description?: string;
  license?: string;
  authors?: string[];
  edition?: string;
  dependencies?: Record<string, unknown>;
}

export interface FileTree {
  path: string;
  type: "file" | "dir";
  children?: FileTree[];
}

export interface ScanResult {
  rootDir: string;
  packageJson?: PackageJson;
  goMod?: GoMod;
  cargoToml?: CargoToml;
  pyprojectToml?: Record<string, unknown>;
  requirementsTxt?: string[];
  composeYaml?: Record<string, unknown>;
  sourceFiles: string[];
  configFiles: string[];
  testFiles: string[];
  fileTree: string;
  rawFiles: Map<string, string>;
  gitignoreEntries: string[];
  hasDockerfile: boolean;
  hasMakefile: boolean;
  hasGitHub: boolean;
}

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".go", ".rs", ".py", ".rb", ".java", ".kt", ".swift",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".php",
]);

const CONFIG_FILES = [
  "tsconfig.json", "webpack.config.js", "vite.config.ts", "vite.config.js",
  "rollup.config.js", "babel.config.js", ".babelrc", "jest.config.js",
  "jest.config.ts", "vitest.config.ts", "eslint.config.js", ".eslintrc.js",
  ".eslintrc.json", ".prettierrc", "prettier.config.js", "tailwind.config.js",
  "tailwind.config.ts", "next.config.js", "next.config.ts", "nuxt.config.ts",
  "svelte.config.js", "astro.config.mjs", ".env.example", "docker-compose.yml",
  "docker-compose.yaml",
];

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt",
  "coverage", ".cache", "tmp", "temp", "__pycache__", ".pytest_cache",
  "target", ".cargo",
]);

export async function scanProject(rootDir: string): Promise<ScanResult> {
  const rawFiles = new Map<string, string>();

  const readFileOpt = async (filePath: string): Promise<string | undefined> => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      rawFiles.set(path.relative(rootDir, filePath), content);
      return content;
    } catch {
      return undefined;
    }
  };

  // Read manifest files in parallel
  const [
    pkgJsonRaw,
    goModRaw,
    cargoTomlRaw,
    pyprojectRaw,
    requirementsRaw,
    composeRaw,
    gitignoreRaw,
  ] = await Promise.all([
    readFileOpt(path.join(rootDir, "package.json")),
    readFileOpt(path.join(rootDir, "go.mod")),
    readFileOpt(path.join(rootDir, "Cargo.toml")),
    readFileOpt(path.join(rootDir, "pyproject.toml")),
    readFileOpt(path.join(rootDir, "requirements.txt")),
    readFileOpt(path.join(rootDir, "docker-compose.yml")).then(
      (v) => v ?? readFileOpt(path.join(rootDir, "docker-compose.yaml"))
    ),
    readFileOpt(path.join(rootDir, ".gitignore")),
  ]);

  const packageJson = pkgJsonRaw ? parseJson<PackageJson>(pkgJsonRaw) : undefined;
  const goMod = goModRaw ? parseGoMod(goModRaw) : undefined;
  const cargoToml = cargoTomlRaw ? parseCargoToml(cargoTomlRaw) : undefined;
  const pyprojectToml = pyprojectRaw ? parsePyproject(pyprojectRaw) : undefined;
  const requirementsTxt = requirementsRaw
    ? requirementsRaw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    : undefined;
  const composeYaml = composeRaw ? parseYamlSafe(composeRaw) : undefined;
  const gitignoreEntries = gitignoreRaw
    ? gitignoreRaw.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  // Scan filesystem
  const allFiles = await glob("**/*", {
    cwd: rootDir,
    nodir: true,
    ignore: [...IGNORE_DIRS].map((d) => `**/${d}/**`),
    dot: false,
  });

  const sourceFiles: string[] = [];
  const configFiles: string[] = [];
  const testFiles: string[] = [];

  for (const f of allFiles) {
    const ext = path.extname(f);
    const base = path.basename(f);
    const lower = f.toLowerCase();

    if (
      lower.includes(".test.") ||
      lower.includes(".spec.") ||
      lower.includes("__tests__") ||
      lower.includes("/test/") ||
      lower.includes("/tests/")
    ) {
      testFiles.push(f);
    } else if (SOURCE_EXTENSIONS.has(ext)) {
      sourceFiles.push(f);
    } else if (CONFIG_FILES.includes(base) || base.endsWith(".config.js") || base.endsWith(".config.ts")) {
      configFiles.push(f);
    }
  }

  // Read key source files (limit to avoid huge context)
  const filesToRead = [
    ...sourceFiles.slice(0, 20),
    ...configFiles.slice(0, 10),
  ];

  await Promise.all(
    filesToRead.map((f) => readFileOpt(path.join(rootDir, f)))
  );

  const hasDockerfile = fs.existsSync(path.join(rootDir, "Dockerfile"));
  const hasMakefile = fs.existsSync(path.join(rootDir, "Makefile"));
  const hasGitHub = fs.existsSync(path.join(rootDir, ".github"));

  const fileTree = buildFileTree(allFiles);

  return {
    rootDir,
    packageJson,
    goMod,
    cargoToml,
    pyprojectToml,
    requirementsTxt,
    composeYaml,
    sourceFiles,
    configFiles,
    testFiles,
    fileTree,
    rawFiles,
    gitignoreEntries,
    hasDockerfile,
    hasMakefile,
    hasGitHub,
  };
}

function parseJson<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function parseGoMod(raw: string): GoMod {
  const lines = raw.split("\n");
  const moduleLine = lines.find((l) => l.startsWith("module "));
  const goLine = lines.find((l) => l.startsWith("go "));
  const requires = lines
    .filter((l) => l.trim().startsWith("require ") || (l.includes(" v") && l.trim().startsWith("\t")))
    .map((l) => l.trim().replace(/^require\s+/, ""))
    .filter(Boolean);

  return {
    module: moduleLine ? moduleLine.replace("module ", "").trim() : "",
    goVersion: goLine ? goLine.replace("go ", "").trim() : "",
    requires,
  };
}

function parseCargoToml(raw: string): CargoToml {
  // Simple TOML parser for [package] section
  const result: CargoToml = {};
  let inPackage = false;
  let inDeps = false;
  const deps: Record<string, unknown> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "[package]") { inPackage = true; inDeps = false; continue; }
    if (trimmed === "[dependencies]") { inDeps = true; inPackage = false; continue; }
    if (trimmed.startsWith("[")) { inPackage = false; inDeps = false; continue; }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/);
    if (!kvMatch) continue;
    const [, key, value] = kvMatch;

    if (inPackage) {
      if (key === "name") result.name = value;
      if (key === "version") result.version = value;
      if (key === "description") result.description = value;
      if (key === "license") result.license = value;
      if (key === "edition") result.edition = value;
    }
    if (inDeps) {
      deps[key] = value;
    }
  }

  result.dependencies = deps;
  return result;
}

function parsePyproject(raw: string): Record<string, unknown> {
  // Extract key fields from pyproject.toml via simple line parsing
  const result: Record<string, unknown> = {};
  let inProject = false;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "[project]" || trimmed === "[tool.poetry]") { inProject = true; continue; }
    if (trimmed.startsWith("[") && trimmed !== "[project]") { inProject = false; continue; }

    if (inProject) {
      const kvMatch = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/);
      if (kvMatch) result[kvMatch[1]] = kvMatch[2];
    }
  }

  return result;
}

function parseYamlSafe(raw: string): Record<string, unknown> | undefined {
  try {
    return yaml.load(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function buildFileTree(files: string[]): string {
  const DISPLAY_LIMIT = 50;
  const shown = files.slice(0, DISPLAY_LIMIT);
  const dirs = new Set<string>();

  for (const f of shown) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }

  const all = [...dirs, ...shown].sort();
  const lines: string[] = [];

  for (const entry of all) {
    const depth = entry.split("/").length - 1;
    const isDir = dirs.has(entry);
    const name = path.basename(entry) + (isDir ? "/" : "");
    lines.push("  ".repeat(depth) + (depth > 0 ? "├── " : "") + name);
  }

  if (files.length > DISPLAY_LIMIT) {
    lines.push(`... and ${files.length - DISPLAY_LIMIT} more files`);
  }

  return lines.join("\n");
}
