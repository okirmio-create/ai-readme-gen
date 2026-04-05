import path from "node:path";
import type { ScanResult } from "./scanner.js";

export type Language =
  | "TypeScript" | "JavaScript" | "Go" | "Rust" | "Python"
  | "Ruby" | "Java" | "Kotlin" | "Swift" | "C" | "C++"
  | "C#" | "PHP" | "Unknown";

export type Framework =
  | "React" | "Next.js" | "Vue" | "Nuxt" | "Svelte" | "Astro"
  | "Angular" | "Express" | "Fastify" | "Koa" | "NestJS"
  | "Gin" | "Echo" | "Fiber" | "Axum" | "Actix"
  | "FastAPI" | "Django" | "Flask" | "Rails"
  | "Spring" | "Ktor" | "None";

export interface ExportedSymbol {
  name: string;
  kind: "function" | "class" | "const" | "type" | "interface";
  signature?: string;
  description?: string;
}

export interface EnvVar {
  name: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
}

export interface ProjectAnalysis {
  name: string;
  version: string;
  description: string;
  language: Language;
  additionalLanguages: Language[];
  framework: Framework;
  isCli: boolean;
  isLibrary: boolean;
  isApi: boolean;
  isFullstack: boolean;
  license: string;
  author: string;
  repository: string;
  homepage: string;
  keywords: string[];
  installCommand: string;
  buildCommand: string;
  testCommand: string;
  devCommand: string;
  startCommand: string;
  exports: ExportedSymbol[];
  envVars: EnvVar[];
  dependencies: string[];
  devDependencies: string[];
  hasTests: boolean;
  hasDocker: boolean;
  hasMakefile: boolean;
  hasCI: boolean;
  fileTree: string;
  engines: Record<string, string>;
  badges: BadgeInfo[];
  usageExamples: string[];
}

export interface BadgeInfo {
  label: string;
  message: string;
  color: string;
  url?: string;
  imageUrl: string;
}

export async function analyzeProject(scan: ScanResult): Promise<ProjectAnalysis> {
  const language = detectLanguage(scan);
  const additionalLanguages = detectAdditionalLanguages(scan, language);
  const framework = detectFramework(scan);

  const { name, version, description, license, author, repository, homepage, keywords } =
    extractManifestMeta(scan);

  const isCli = detectIsCli(scan);
  const isLibrary = detectIsLibrary(scan, isCli);
  const isApi = detectIsApi(scan, framework);
  const isFullstack = detectIsFullstack(scan, framework);

  const { installCommand, buildCommand, testCommand, devCommand, startCommand } =
    deriveCommands(scan, language);

  const exports = extractExports(scan);
  const envVars = extractEnvVars(scan);
  const dependencies = extractDependencies(scan);
  const devDependencies = extractDevDependencies(scan);
  const usageExamples = extractUsageExamples(scan, name, isCli);
  const badges = buildBadges({ name, version, license, scan, language, framework });
  const engines = extractEngines(scan);

  return {
    name,
    version,
    description,
    language,
    additionalLanguages,
    framework,
    isCli,
    isLibrary,
    isApi,
    isFullstack,
    license,
    author,
    repository,
    homepage,
    keywords,
    installCommand,
    buildCommand,
    testCommand,
    devCommand,
    startCommand,
    exports,
    envVars,
    dependencies,
    devDependencies,
    hasTests: scan.testFiles.length > 0,
    hasDocker: scan.hasDockerfile,
    hasMakefile: scan.hasMakefile,
    hasCI: scan.hasGitHub,
    fileTree: scan.fileTree,
    engines,
    badges,
    usageExamples,
  };
}

function detectLanguage(scan: ScanResult): Language {
  if (scan.packageJson) {
    const hasTsConfig = scan.configFiles.some((f) => f.includes("tsconfig"));
    const hasTsSrc = scan.sourceFiles.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    return hasTsConfig || hasTsSrc ? "TypeScript" : "JavaScript";
  }
  if (scan.goMod) return "Go";
  if (scan.cargoToml) return "Rust";
  if (scan.pyprojectToml || scan.requirementsTxt) return "Python";

  const extCounts = new Map<string, number>();
  for (const f of scan.sourceFiles) {
    const ext = path.extname(f);
    extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
  }

  const sorted = [...extCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topExt = sorted[0]?.[0];
  const extMap: Record<string, Language> = {
    ".ts": "TypeScript", ".tsx": "TypeScript",
    ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript",
    ".go": "Go", ".rs": "Rust", ".py": "Python",
    ".rb": "Ruby", ".java": "Java", ".kt": "Kotlin",
    ".swift": "Swift", ".c": "C", ".cpp": "C++",
    ".cs": "C#", ".php": "PHP",
  };
  return topExt ? (extMap[topExt] ?? "Unknown") : "Unknown";
}

function detectAdditionalLanguages(scan: ScanResult, primary: Language): Language[] {
  const extMap: Record<string, Language> = {
    ".ts": "TypeScript", ".tsx": "TypeScript",
    ".js": "JavaScript", ".jsx": "JavaScript",
    ".go": "Go", ".rs": "Rust", ".py": "Python",
    ".rb": "Ruby", ".java": "Java", ".kt": "Kotlin",
  };
  const found = new Set<Language>();
  for (const f of scan.sourceFiles) {
    const lang = extMap[path.extname(f)];
    if (lang && lang !== primary) found.add(lang);
  }
  return [...found].slice(0, 3);
}

function detectFramework(scan: ScanResult): Framework {
  const deps = {
    ...(scan.packageJson?.dependencies ?? {}),
    ...(scan.packageJson?.devDependencies ?? {}),
  };

  if ("next" in deps) return "Next.js";
  if ("nuxt" in deps) return "Nuxt";
  if ("@sveltejs/kit" in deps || "svelte" in deps) return "Svelte";
  if ("astro" in deps) return "Astro";
  if ("@nestjs/core" in deps) return "NestJS";
  if ("@angular/core" in deps) return "Angular";
  if ("fastify" in deps) return "Fastify";
  if ("koa" in deps) return "Koa";
  if ("express" in deps) return "Express";
  if ("react" in deps) return "React";
  if ("vue" in deps) return "Vue";

  if (scan.goMod) {
    const requires = scan.goMod.requires.join(" ");
    if (requires.includes("gin-gonic/gin")) return "Gin";
    if (requires.includes("labstack/echo")) return "Echo";
    if (requires.includes("gofiber/fiber")) return "Fiber";
  }

  if (scan.cargoToml) {
    const deps2 = scan.cargoToml.dependencies ?? {};
    if ("axum" in deps2) return "Axum";
    if ("actix-web" in deps2) return "Actix";
  }

  if (scan.requirementsTxt || scan.pyprojectToml) {
    const allDeps = [
      ...(scan.requirementsTxt ?? []),
      ...Object.keys((scan.pyprojectToml ?? {}) as Record<string, unknown>),
    ].join(" ").toLowerCase();
    if (allDeps.includes("fastapi")) return "FastAPI";
    if (allDeps.includes("django")) return "Django";
    if (allDeps.includes("flask")) return "Flask";
  }

  return "None";
}

function detectIsCli(scan: ScanResult): boolean {
  if (scan.packageJson?.bin) return true;
  const srcContent = [...scan.rawFiles.values()].join(" ");
  return (
    srcContent.includes("commander") ||
    srcContent.includes("yargs") ||
    srcContent.includes("meow") ||
    srcContent.includes("process.argv") ||
    srcContent.includes("click") ||
    srcContent.includes("argparse")
  );
}

function detectIsLibrary(scan: ScanResult, isCli: boolean): boolean {
  if (isCli) return false;
  if (scan.packageJson?.main && !scan.packageJson.bin) return true;
  if (scan.cargoToml) {
    const raw = scan.rawFiles.get("Cargo.toml") ?? "";
    return raw.includes('[lib]');
  }
  return false;
}

function detectIsApi(scan: ScanResult, framework: Framework): boolean {
  const apiFrameworks: Framework[] = ["Express", "Fastify", "Koa", "NestJS", "Gin", "Echo", "Fiber", "Axum", "Actix", "FastAPI", "Django", "Flask"];
  if (apiFrameworks.includes(framework)) return true;
  const srcContent = [...scan.rawFiles.values()].join(" ");
  return srcContent.includes("router") && (srcContent.includes("GET") || srcContent.includes("POST"));
}

function detectIsFullstack(scan: ScanResult, framework: Framework): boolean {
  const fullstackFrameworks: Framework[] = ["Next.js", "Nuxt", "Svelte", "Astro"];
  return fullstackFrameworks.includes(framework);
}

function extractManifestMeta(scan: ScanResult) {
  const pkg = scan.packageJson;
  const cargo = scan.cargoToml;
  const go = scan.goMod;
  const py = scan.pyprojectToml as Record<string, string> | undefined;

  const name =
    pkg?.name ?? cargo?.name ?? go?.module?.split("/").pop() ?? py?.name ??
    path.basename(scan.rootDir);

  const version = pkg?.version ?? cargo?.version ?? py?.version ?? "1.0.0";

  const description =
    pkg?.description ?? cargo?.description ?? py?.description ??
    `A ${name} project`;

  const license =
    pkg?.license ?? cargo?.license ?? py?.license ?? "MIT";

  const author =
    typeof pkg?.author === "string"
      ? pkg.author
      : pkg?.author?.name ?? cargo?.authors?.[0] ?? py?.authors ?? "";

  const repository =
    typeof pkg?.repository === "string"
      ? pkg.repository
      : pkg?.repository?.url ?? "";

  const homepage = pkg?.homepage ?? repository ?? "";
  const keywords = pkg?.keywords ?? [];

  return { name, version, description, license, author, repository, homepage, keywords };
}

function deriveCommands(scan: ScanResult, language: Language) {
  const scripts = scan.packageJson?.scripts ?? {};
  const pm = detectPackageManager(scan);

  if (scan.packageJson) {
    return {
      installCommand: `${pm} install`,
      buildCommand: scripts.build ? `${pm} run build` : "",
      testCommand: scripts.test ? `${pm} test` : "",
      devCommand: scripts.dev ? `${pm} run dev` : scripts.start ? `${pm} start` : "",
      startCommand: scripts.start ? `${pm} start` : scripts.dev ? `${pm} run dev` : "",
    };
  }

  if (language === "Go") {
    return {
      installCommand: "go mod download",
      buildCommand: "go build ./...",
      testCommand: "go test ./...",
      devCommand: "go run .",
      startCommand: "go run .",
    };
  }

  if (language === "Rust") {
    return {
      installCommand: "cargo build",
      buildCommand: "cargo build --release",
      testCommand: "cargo test",
      devCommand: "cargo run",
      startCommand: "cargo run --release",
    };
  }

  if (language === "Python") {
    const hasPip = !!scan.requirementsTxt;
    return {
      installCommand: hasPip ? "pip install -r requirements.txt" : "pip install -e .",
      buildCommand: "python -m build",
      testCommand: "pytest",
      devCommand: "python -m uvicorn main:app --reload",
      startCommand: "python main.py",
    };
  }

  return {
    installCommand: "",
    buildCommand: "",
    testCommand: "",
    devCommand: "",
    startCommand: "",
  };
}

function detectPackageManager(scan: ScanResult): string {
  if (scan.rawFiles.has("pnpm-lock.yaml")) return "pnpm";
  if (scan.rawFiles.has("yarn.lock")) return "yarn";
  return "npm";
}

function extractExports(scan: ScanResult): ExportedSymbol[] {
  const symbols: ExportedSymbol[] = [];
  const seen = new Set<string>();

  for (const [filePath, content] of scan.rawFiles) {
    const ext = path.extname(filePath);
    if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) continue;

    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();

      // export function / export async function
      const fnMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)/);
      if (fnMatch) {
        const name = fnMatch[1];
        if (!seen.has(name)) {
          seen.add(name);
          symbols.push({ name, kind: "function", signature: trimmed.replace(/\s*\{.*$/, "").trim() });
        }
      }

      // export class
      const classMatch = trimmed.match(/^export\s+(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        const name = classMatch[1];
        if (!seen.has(name)) {
          seen.add(name);
          symbols.push({ name, kind: "class", signature: trimmed.replace(/\s*\{.*$/, "").trim() });
        }
      }

      // export const/let
      const constMatch = trimmed.match(/^export\s+const\s+(\w+)/);
      if (constMatch) {
        const name = constMatch[1];
        if (!seen.has(name)) {
          seen.add(name);
          symbols.push({ name, kind: "const" });
        }
      }

      // export type / interface
      const typeMatch = trimmed.match(/^export\s+(type|interface)\s+(\w+)/);
      if (typeMatch) {
        const name = typeMatch[2];
        const kind = typeMatch[1] as "type" | "interface";
        if (!seen.has(name)) {
          seen.add(name);
          symbols.push({ name, kind });
        }
      }
    }

    if (symbols.length >= 30) break;
  }

  return symbols;
}

function extractEnvVars(scan: ScanResult): EnvVar[] {
  const vars = new Map<string, EnvVar>();

  // Read from .env.example if present
  const envExample = scan.rawFiles.get(".env.example") ?? scan.rawFiles.get(".env.sample");
  if (envExample) {
    for (const line of envExample.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const name = trimmed.slice(0, eqIdx).trim();
      const defaultValue = trimmed.slice(eqIdx + 1).trim() || undefined;
      vars.set(name, { name, required: !defaultValue, defaultValue });
    }
  }

  // Scan source for process.env references
  for (const [, content] of scan.rawFiles) {
    const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
    for (const match of matches) {
      const name = match[1];
      if (!vars.has(name)) {
        vars.set(name, { name, required: true });
      }
    }
  }

  return [...vars.values()].slice(0, 20);
}

function extractDependencies(scan: ScanResult): string[] {
  if (scan.packageJson?.dependencies) {
    return Object.keys(scan.packageJson.dependencies);
  }
  if (scan.goMod?.requires) return scan.goMod.requires.slice(0, 15);
  if (scan.cargoToml?.dependencies) return Object.keys(scan.cargoToml.dependencies);
  if (scan.requirementsTxt) return scan.requirementsTxt.slice(0, 15);
  return [];
}

function extractDevDependencies(scan: ScanResult): string[] {
  if (scan.packageJson?.devDependencies) {
    return Object.keys(scan.packageJson.devDependencies);
  }
  return [];
}

function extractUsageExamples(scan: ScanResult, name: string, isCli: boolean): string[] {
  const examples: string[] = [];

  if (isCli) {
    const binName = typeof scan.packageJson?.bin === "string"
      ? name
      : Object.keys(scan.packageJson?.bin ?? {})[0] ?? name;
    examples.push(`npx ${binName} --help`);

    // Try to extract usage from README or source
    for (const [filePath, content] of scan.rawFiles) {
      if (filePath.toLowerCase() === "readme.md") {
        const codeBlocks = [...content.matchAll(/```(?:bash|sh)\n([\s\S]*?)```/g)];
        for (const block of codeBlocks.slice(0, 2)) {
          const lines = block[1].trim().split("\n").slice(0, 3).join("\n");
          if (lines) examples.push(lines);
        }
        break;
      }
    }
  }

  return examples;
}

function buildBadges(params: {
  name: string;
  version: string;
  license: string;
  scan: ScanResult;
  language: Language;
  framework: Framework;
}): BadgeInfo[] {
  const { name, license, scan, language } = params;
  const badges: BadgeInfo[] = [];

  if (scan.packageJson) {
    badges.push({
      label: "npm",
      message: "version",
      color: "blue",
      imageUrl: `https://img.shields.io/npm/v/${name}`,
      url: `https://www.npmjs.com/package/${name}`,
    });
    badges.push({
      label: "npm downloads",
      message: "downloads",
      color: "green",
      imageUrl: `https://img.shields.io/npm/dm/${name}`,
      url: `https://www.npmjs.com/package/${name}`,
    });
  }

  if (license) {
    badges.push({
      label: "license",
      message: license,
      color: "yellow",
      imageUrl: `https://img.shields.io/badge/license-${encodeURIComponent(license)}-yellow`,
    });
  }

  if (scan.hasGitHub) {
    badges.push({
      label: "build",
      message: "passing",
      color: "brightgreen",
      imageUrl: "https://img.shields.io/github/actions/workflow/status/owner/repo/ci.yml",
    });
  }

  const langColors: Partial<Record<Language, string>> = {
    TypeScript: "blue",
    JavaScript: "yellow",
    Go: "cyan",
    Rust: "orange",
    Python: "blue",
  };
  const langColor = langColors[language] ?? "grey";
  badges.push({
    label: "language",
    message: language,
    color: langColor,
    imageUrl: `https://img.shields.io/badge/language-${encodeURIComponent(language)}-${langColor}`,
  });

  return badges;
}

function extractEngines(scan: ScanResult): Record<string, string> {
  return scan.packageJson?.engines ?? {};
}
