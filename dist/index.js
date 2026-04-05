#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";
import chalk from "chalk";
import path4 from "path";
import fs3 from "fs-extra";

// src/scanner.ts
import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
import yaml from "js-yaml";
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".go",
  ".rs",
  ".py",
  ".rb",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".php"
]);
var CONFIG_FILES = [
  "tsconfig.json",
  "webpack.config.js",
  "vite.config.ts",
  "vite.config.js",
  "rollup.config.js",
  "babel.config.js",
  ".babelrc",
  "jest.config.js",
  "jest.config.ts",
  "vitest.config.ts",
  "eslint.config.js",
  ".eslintrc.js",
  ".eslintrc.json",
  ".prettierrc",
  "prettier.config.js",
  "tailwind.config.js",
  "tailwind.config.ts",
  "next.config.js",
  "next.config.ts",
  "nuxt.config.ts",
  "svelte.config.js",
  "astro.config.mjs",
  ".env.example",
  "docker-compose.yml",
  "docker-compose.yaml"
];
var IGNORE_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  "tmp",
  "temp",
  "__pycache__",
  ".pytest_cache",
  "target",
  ".cargo"
]);
async function scanProject(rootDir) {
  const rawFiles = /* @__PURE__ */ new Map();
  const readFileOpt = async (filePath) => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      rawFiles.set(path.relative(rootDir, filePath), content);
      return content;
    } catch {
      return void 0;
    }
  };
  const [
    pkgJsonRaw,
    goModRaw,
    cargoTomlRaw,
    pyprojectRaw,
    requirementsRaw,
    composeRaw,
    gitignoreRaw
  ] = await Promise.all([
    readFileOpt(path.join(rootDir, "package.json")),
    readFileOpt(path.join(rootDir, "go.mod")),
    readFileOpt(path.join(rootDir, "Cargo.toml")),
    readFileOpt(path.join(rootDir, "pyproject.toml")),
    readFileOpt(path.join(rootDir, "requirements.txt")),
    readFileOpt(path.join(rootDir, "docker-compose.yml")).then(
      (v) => v ?? readFileOpt(path.join(rootDir, "docker-compose.yaml"))
    ),
    readFileOpt(path.join(rootDir, ".gitignore"))
  ]);
  const packageJson = pkgJsonRaw ? parseJson(pkgJsonRaw) : void 0;
  const goMod = goModRaw ? parseGoMod(goModRaw) : void 0;
  const cargoToml = cargoTomlRaw ? parseCargoToml(cargoTomlRaw) : void 0;
  const pyprojectToml = pyprojectRaw ? parsePyproject(pyprojectRaw) : void 0;
  const requirementsTxt = requirementsRaw ? requirementsRaw.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")) : void 0;
  const composeYaml = composeRaw ? parseYamlSafe(composeRaw) : void 0;
  const gitignoreEntries = gitignoreRaw ? gitignoreRaw.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  const allFiles = await glob("**/*", {
    cwd: rootDir,
    nodir: true,
    ignore: [...IGNORE_DIRS].map((d) => `**/${d}/**`),
    dot: false
  });
  const sourceFiles = [];
  const configFiles = [];
  const testFiles = [];
  for (const f of allFiles) {
    const ext = path.extname(f);
    const base = path.basename(f);
    const lower = f.toLowerCase();
    if (lower.includes(".test.") || lower.includes(".spec.") || lower.includes("__tests__") || lower.includes("/test/") || lower.includes("/tests/")) {
      testFiles.push(f);
    } else if (SOURCE_EXTENSIONS.has(ext)) {
      sourceFiles.push(f);
    } else if (CONFIG_FILES.includes(base) || base.endsWith(".config.js") || base.endsWith(".config.ts")) {
      configFiles.push(f);
    }
  }
  const filesToRead = [
    ...sourceFiles.slice(0, 20),
    ...configFiles.slice(0, 10)
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
    hasGitHub
  };
}
function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return void 0;
  }
}
function parseGoMod(raw) {
  const lines = raw.split("\n");
  const moduleLine = lines.find((l) => l.startsWith("module "));
  const goLine = lines.find((l) => l.startsWith("go "));
  const requires = lines.filter((l) => l.trim().startsWith("require ") || l.includes(" v") && l.trim().startsWith("	")).map((l) => l.trim().replace(/^require\s+/, "")).filter(Boolean);
  return {
    module: moduleLine ? moduleLine.replace("module ", "").trim() : "",
    goVersion: goLine ? goLine.replace("go ", "").trim() : "",
    requires
  };
}
function parseCargoToml(raw) {
  const result = {};
  let inPackage = false;
  let inDeps = false;
  const deps = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "[package]") {
      inPackage = true;
      inDeps = false;
      continue;
    }
    if (trimmed === "[dependencies]") {
      inDeps = true;
      inPackage = false;
      continue;
    }
    if (trimmed.startsWith("[")) {
      inPackage = false;
      inDeps = false;
      continue;
    }
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
function parsePyproject(raw) {
  const result = {};
  let inProject = false;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "[project]" || trimmed === "[tool.poetry]") {
      inProject = true;
      continue;
    }
    if (trimmed.startsWith("[") && trimmed !== "[project]") {
      inProject = false;
      continue;
    }
    if (inProject) {
      const kvMatch = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/);
      if (kvMatch) result[kvMatch[1]] = kvMatch[2];
    }
  }
  return result;
}
function parseYamlSafe(raw) {
  try {
    return yaml.load(raw);
  } catch {
    return void 0;
  }
}
function buildFileTree(files) {
  const DISPLAY_LIMIT = 50;
  const shown = files.slice(0, DISPLAY_LIMIT);
  const dirs = /* @__PURE__ */ new Set();
  for (const f of shown) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  const all = [...dirs, ...shown].sort();
  const lines = [];
  for (const entry of all) {
    const depth = entry.split("/").length - 1;
    const isDir = dirs.has(entry);
    const name = path.basename(entry) + (isDir ? "/" : "");
    lines.push("  ".repeat(depth) + (depth > 0 ? "\u251C\u2500\u2500 " : "") + name);
  }
  if (files.length > DISPLAY_LIMIT) {
    lines.push(`... and ${files.length - DISPLAY_LIMIT} more files`);
  }
  return lines.join("\n");
}

// src/analyzer.ts
import path2 from "path";
async function analyzeProject(scan) {
  const language = detectLanguage(scan);
  const additionalLanguages = detectAdditionalLanguages(scan, language);
  const framework = detectFramework(scan);
  const { name, version, description, license, author, repository, homepage, keywords } = extractManifestMeta(scan);
  const isCli = detectIsCli(scan);
  const isLibrary = detectIsLibrary(scan, isCli);
  const isApi = detectIsApi(scan, framework);
  const isFullstack = detectIsFullstack(scan, framework);
  const { installCommand, buildCommand, testCommand, devCommand, startCommand } = deriveCommands(scan, language);
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
    usageExamples
  };
}
function detectLanguage(scan) {
  if (scan.packageJson) {
    const hasTsConfig = scan.configFiles.some((f) => f.includes("tsconfig"));
    const hasTsSrc = scan.sourceFiles.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    return hasTsConfig || hasTsSrc ? "TypeScript" : "JavaScript";
  }
  if (scan.goMod) return "Go";
  if (scan.cargoToml) return "Rust";
  if (scan.pyprojectToml || scan.requirementsTxt) return "Python";
  const extCounts = /* @__PURE__ */ new Map();
  for (const f of scan.sourceFiles) {
    const ext = path2.extname(f);
    extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
  }
  const sorted = [...extCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topExt = sorted[0]?.[0];
  const extMap = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".go": "Go",
    ".rs": "Rust",
    ".py": "Python",
    ".rb": "Ruby",
    ".java": "Java",
    ".kt": "Kotlin",
    ".swift": "Swift",
    ".c": "C",
    ".cpp": "C++",
    ".cs": "C#",
    ".php": "PHP"
  };
  return topExt ? extMap[topExt] ?? "Unknown" : "Unknown";
}
function detectAdditionalLanguages(scan, primary) {
  const extMap = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".go": "Go",
    ".rs": "Rust",
    ".py": "Python",
    ".rb": "Ruby",
    ".java": "Java",
    ".kt": "Kotlin"
  };
  const found = /* @__PURE__ */ new Set();
  for (const f of scan.sourceFiles) {
    const lang = extMap[path2.extname(f)];
    if (lang && lang !== primary) found.add(lang);
  }
  return [...found].slice(0, 3);
}
function detectFramework(scan) {
  const deps = {
    ...scan.packageJson?.dependencies ?? {},
    ...scan.packageJson?.devDependencies ?? {}
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
      ...scan.requirementsTxt ?? [],
      ...Object.keys(scan.pyprojectToml ?? {})
    ].join(" ").toLowerCase();
    if (allDeps.includes("fastapi")) return "FastAPI";
    if (allDeps.includes("django")) return "Django";
    if (allDeps.includes("flask")) return "Flask";
  }
  return "None";
}
function detectIsCli(scan) {
  if (scan.packageJson?.bin) return true;
  const srcContent = [...scan.rawFiles.values()].join(" ");
  return srcContent.includes("commander") || srcContent.includes("yargs") || srcContent.includes("meow") || srcContent.includes("process.argv") || srcContent.includes("click") || srcContent.includes("argparse");
}
function detectIsLibrary(scan, isCli) {
  if (isCli) return false;
  if (scan.packageJson?.main && !scan.packageJson.bin) return true;
  if (scan.cargoToml) {
    const raw = scan.rawFiles.get("Cargo.toml") ?? "";
    return raw.includes("[lib]");
  }
  return false;
}
function detectIsApi(scan, framework) {
  const apiFrameworks = ["Express", "Fastify", "Koa", "NestJS", "Gin", "Echo", "Fiber", "Axum", "Actix", "FastAPI", "Django", "Flask"];
  if (apiFrameworks.includes(framework)) return true;
  const srcContent = [...scan.rawFiles.values()].join(" ");
  return srcContent.includes("router") && (srcContent.includes("GET") || srcContent.includes("POST"));
}
function detectIsFullstack(scan, framework) {
  const fullstackFrameworks = ["Next.js", "Nuxt", "Svelte", "Astro"];
  return fullstackFrameworks.includes(framework);
}
function extractManifestMeta(scan) {
  const pkg = scan.packageJson;
  const cargo = scan.cargoToml;
  const go = scan.goMod;
  const py = scan.pyprojectToml;
  const name = pkg?.name ?? cargo?.name ?? go?.module?.split("/").pop() ?? py?.name ?? path2.basename(scan.rootDir);
  const version = pkg?.version ?? cargo?.version ?? py?.version ?? "1.0.0";
  const description = pkg?.description ?? cargo?.description ?? py?.description ?? `A ${name} project`;
  const license = pkg?.license ?? cargo?.license ?? py?.license ?? "MIT";
  const author = typeof pkg?.author === "string" ? pkg.author : pkg?.author?.name ?? cargo?.authors?.[0] ?? py?.authors ?? "";
  const repository = typeof pkg?.repository === "string" ? pkg.repository : pkg?.repository?.url ?? "";
  const homepage = pkg?.homepage ?? repository ?? "";
  const keywords = pkg?.keywords ?? [];
  return { name, version, description, license, author, repository, homepage, keywords };
}
function deriveCommands(scan, language) {
  const scripts = scan.packageJson?.scripts ?? {};
  const pm = detectPackageManager(scan);
  if (scan.packageJson) {
    return {
      installCommand: `${pm} install`,
      buildCommand: scripts.build ? `${pm} run build` : "",
      testCommand: scripts.test ? `${pm} test` : "",
      devCommand: scripts.dev ? `${pm} run dev` : scripts.start ? `${pm} start` : "",
      startCommand: scripts.start ? `${pm} start` : scripts.dev ? `${pm} run dev` : ""
    };
  }
  if (language === "Go") {
    return {
      installCommand: "go mod download",
      buildCommand: "go build ./...",
      testCommand: "go test ./...",
      devCommand: "go run .",
      startCommand: "go run ."
    };
  }
  if (language === "Rust") {
    return {
      installCommand: "cargo build",
      buildCommand: "cargo build --release",
      testCommand: "cargo test",
      devCommand: "cargo run",
      startCommand: "cargo run --release"
    };
  }
  if (language === "Python") {
    const hasPip = !!scan.requirementsTxt;
    return {
      installCommand: hasPip ? "pip install -r requirements.txt" : "pip install -e .",
      buildCommand: "python -m build",
      testCommand: "pytest",
      devCommand: "python -m uvicorn main:app --reload",
      startCommand: "python main.py"
    };
  }
  return {
    installCommand: "",
    buildCommand: "",
    testCommand: "",
    devCommand: "",
    startCommand: ""
  };
}
function detectPackageManager(scan) {
  if (scan.rawFiles.has("pnpm-lock.yaml")) return "pnpm";
  if (scan.rawFiles.has("yarn.lock")) return "yarn";
  return "npm";
}
function extractExports(scan) {
  const symbols = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [filePath, content] of scan.rawFiles) {
    const ext = path2.extname(filePath);
    if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) continue;
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      const fnMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)/);
      if (fnMatch) {
        const name = fnMatch[1];
        if (!seen.has(name)) {
          seen.add(name);
          symbols.push({ name, kind: "function", signature: trimmed.replace(/\s*\{.*$/, "").trim() });
        }
      }
      const classMatch = trimmed.match(/^export\s+(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        const name = classMatch[1];
        if (!seen.has(name)) {
          seen.add(name);
          symbols.push({ name, kind: "class", signature: trimmed.replace(/\s*\{.*$/, "").trim() });
        }
      }
      const constMatch = trimmed.match(/^export\s+const\s+(\w+)/);
      if (constMatch) {
        const name = constMatch[1];
        if (!seen.has(name)) {
          seen.add(name);
          symbols.push({ name, kind: "const" });
        }
      }
      const typeMatch = trimmed.match(/^export\s+(type|interface)\s+(\w+)/);
      if (typeMatch) {
        const name = typeMatch[2];
        const kind = typeMatch[1];
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
function extractEnvVars(scan) {
  const vars = /* @__PURE__ */ new Map();
  const envExample = scan.rawFiles.get(".env.example") ?? scan.rawFiles.get(".env.sample");
  if (envExample) {
    for (const line of envExample.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const name = trimmed.slice(0, eqIdx).trim();
      const defaultValue = trimmed.slice(eqIdx + 1).trim() || void 0;
      vars.set(name, { name, required: !defaultValue, defaultValue });
    }
  }
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
function extractDependencies(scan) {
  if (scan.packageJson?.dependencies) {
    return Object.keys(scan.packageJson.dependencies);
  }
  if (scan.goMod?.requires) return scan.goMod.requires.slice(0, 15);
  if (scan.cargoToml?.dependencies) return Object.keys(scan.cargoToml.dependencies);
  if (scan.requirementsTxt) return scan.requirementsTxt.slice(0, 15);
  return [];
}
function extractDevDependencies(scan) {
  if (scan.packageJson?.devDependencies) {
    return Object.keys(scan.packageJson.devDependencies);
  }
  return [];
}
function extractUsageExamples(scan, name, isCli) {
  const examples = [];
  if (isCli) {
    const binName = typeof scan.packageJson?.bin === "string" ? name : Object.keys(scan.packageJson?.bin ?? {})[0] ?? name;
    examples.push(`npx ${binName} --help`);
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
function buildBadges(params) {
  const { name, license, scan, language } = params;
  const badges = [];
  if (scan.packageJson) {
    badges.push({
      label: "npm",
      message: "version",
      color: "blue",
      imageUrl: `https://img.shields.io/npm/v/${name}`,
      url: `https://www.npmjs.com/package/${name}`
    });
    badges.push({
      label: "npm downloads",
      message: "downloads",
      color: "green",
      imageUrl: `https://img.shields.io/npm/dm/${name}`,
      url: `https://www.npmjs.com/package/${name}`
    });
  }
  if (license) {
    badges.push({
      label: "license",
      message: license,
      color: "yellow",
      imageUrl: `https://img.shields.io/badge/license-${encodeURIComponent(license)}-yellow`
    });
  }
  if (scan.hasGitHub) {
    badges.push({
      label: "build",
      message: "passing",
      color: "brightgreen",
      imageUrl: "https://img.shields.io/github/actions/workflow/status/owner/repo/ci.yml"
    });
  }
  const langColors = {
    TypeScript: "blue",
    JavaScript: "yellow",
    Go: "cyan",
    Rust: "orange",
    Python: "blue"
  };
  const langColor = langColors[language] ?? "grey";
  badges.push({
    label: "language",
    message: language,
    color: langColor,
    imageUrl: `https://img.shields.io/badge/language-${encodeURIComponent(language)}-${langColor}`
  });
  return badges;
}
function extractEngines(scan) {
  return scan.packageJson?.engines ?? {};
}

// src/generator.ts
import Handlebars from "handlebars";
import path3 from "path";
import { fileURLToPath } from "url";
import fs2 from "fs-extra";
var __dirname = path3.dirname(fileURLToPath(import.meta.url));
Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("ne", (a, b) => a !== b);
Handlebars.registerHelper("and", (a, b) => Boolean(a) && Boolean(b));
Handlebars.registerHelper("or", (a, b) => Boolean(a) || Boolean(b));
Handlebars.registerHelper("not", (a) => !a);
Handlebars.registerHelper("hasItems", (arr) => Array.isArray(arr) && arr.length > 0);
Handlebars.registerHelper(
  "join",
  (arr, sep) => Array.isArray(arr) ? arr.join(typeof sep === "string" ? sep : ", ") : ""
);
Handlebars.registerHelper("upper", (s) => typeof s === "string" ? s.toUpperCase() : s);
Handlebars.registerHelper("trim", (s) => typeof s === "string" ? s.trim() : s);
Handlebars.registerHelper("year", () => (/* @__PURE__ */ new Date()).getFullYear());
Handlebars.registerHelper("date", () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
var templateCache = /* @__PURE__ */ new Map();
function loadTemplate(templateName) {
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName);
  }
  const templatesDir = path3.join(__dirname, "..", "templates");
  const filePath = path3.join(templatesDir, templateName);
  let source;
  if (fs2.existsSync(filePath)) {
    source = fs2.readFileSync(filePath, "utf-8");
  } else {
    source = getFallbackTemplate(templateName);
  }
  const compiled = Handlebars.compile(source);
  templateCache.set(templateName, compiled);
  return compiled;
}
function generateDoc(analysis, type, style) {
  const templateMap = {
    readme: "readme.md.hbs",
    api: "api.md.hbs",
    contributing: "contributing.md.hbs",
    changelog: "changelog.md.hbs"
  };
  const templateName = templateMap[type];
  const template = loadTemplate(templateName);
  return template({ ...analysis, style, docType: type }).trim() + "\n";
}
function getFallbackTemplate(name) {
  const templates = {
    "readme.md.hbs": FALLBACK_README,
    "api.md.hbs": FALLBACK_API,
    "contributing.md.hbs": FALLBACK_CONTRIBUTING,
    "changelog.md.hbs": FALLBACK_CHANGELOG
  };
  return templates[name] ?? `# ${name}

No template found.
`;
}
var FALLBACK_README = `# {{name}}

{{#if (hasItems badges)}}
{{#each badges}}[![{{label}}]({{imageUrl}})]({{#if url}}{{url}}{{else}}#{{/if}}) {{/each}}
{{/if}}

> {{description}}

{{#if (ne style "minimal")}}
## Features

- Built with **{{language}}**{{#if (ne framework "None")}} and **{{framework}}**{{/if}}
{{#if isCli}}- Command-line interface{{/if}}
{{#if isLibrary}}- Library / SDK{{/if}}
{{#if isApi}}- REST API{{/if}}
{{#if hasTests}}- Test suite included{{/if}}
{{#if hasDocker}}- Docker support{{/if}}
{{/if}}

## Installation

{{#if installCommand}}
\`\`\`bash
{{installCommand}}
\`\`\`
{{/if}}

{{#if (hasItems usageExamples)}}
## Usage

{{#each usageExamples}}
\`\`\`bash
{{this}}
\`\`\`

{{/each}}
{{else}}
## Usage

\`\`\`{{#if (eq language "TypeScript")}}typescript{{else if (eq language "JavaScript")}}javascript{{else if (eq language "Python")}}python{{else if (eq language "Go")}}go{{else if (eq language "Rust")}}rust{{else}}bash{{/if}}
// TODO: Add usage examples
\`\`\`
{{/if}}

{{#if (and (eq style "detailed") (hasItems exports))}}
## API

{{#each exports}}
### \`{{name}}\`

{{#if signature}}
\`\`\`typescript
{{signature}}
\`\`\`
{{/if}}

{{/each}}
{{/if}}

{{#if buildCommand}}
## Development

\`\`\`bash
# Install dependencies
{{installCommand}}

{{#if devCommand}}# Start development server
{{devCommand}}
{{/if}}
# Build
{{buildCommand}}

{{#if testCommand}}# Run tests
{{testCommand}}
{{/if}}
\`\`\`
{{/if}}

{{#if (hasItems envVars)}}
## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
{{#each envVars}}| \`{{name}}\` | {{#if required}}Yes{{else}}No{{/if}} | {{#if defaultValue}}\`{{defaultValue}}\`{{else}}\u2014{{/if}} | {{#if description}}{{description}}{{else}}\u2014{{/if}} |
{{/each}}
{{/if}}

{{#if (ne style "minimal")}}
## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create your feature branch: \`git checkout -b feature/my-feature\`
3. Commit your changes: \`git commit -m 'feat: add my feature'\`
4. Push to the branch: \`git push origin feature/my-feature\`
5. Open a Pull Request
{{/if}}

## License

{{license}} \xA9 {{year}} {{#if author}}{{author}}{{else}}Contributors{{/if}}
`;
var FALLBACK_API = `# API Reference \u2014 {{name}}

> {{description}}

{{#if (hasItems exports)}}
{{#each exports}}
## \`{{name}}\`

**Kind:** \`{{kind}}\`

{{#if signature}}
\`\`\`typescript
{{signature}}
\`\`\`
{{/if}}

---

{{/each}}
{{else}}
No exported symbols detected. Add JSDoc comments to your exports for richer documentation.
{{/if}}
`;
var FALLBACK_CONTRIBUTING = `# Contributing to {{name}}

Thank you for your interest in contributing!

## Getting Started

1. Fork and clone the repository
2. Install dependencies: \`{{installCommand}}\`
3. Create a branch: \`git checkout -b feature/your-feature\`

## Development

\`\`\`bash
{{installCommand}}
{{#if devCommand}}{{devCommand}}{{/if}}
\`\`\`

## Tests

\`\`\`bash
{{testCommand}}
\`\`\`

## Submitting Changes

- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed
- Open a Pull Request with a clear description

## Code of Conduct

Be respectful and constructive. See [Contributor Covenant](https://www.contributor-covenant.org/).
`;
var FALLBACK_CHANGELOG = `# Changelog

All notable changes to **{{name}}** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [{{version}}] \u2014 {{date}}

### Added

- Initial release

---

<!-- Template for future entries:

## [X.Y.Z] \u2014 YYYY-MM-DD

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security

-->
`;

// src/ai-enhance.ts
var MAX_CONTENT_CHARS = 12e3;
async function aiEnhance(content, analysis, docType) {
  if (process.env.ANTHROPIC_API_KEY) {
    return enhanceWithAnthropic(content, analysis, docType);
  }
  if (process.env.OPENAI_API_KEY) {
    return enhanceWithOpenAI(content, analysis, docType);
  }
  return content;
}
async function enhanceWithAnthropic(content, analysis, docType) {
  const prompt = buildPrompt(content, analysis, docType);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "unknown error");
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }
  const data = await response.json();
  const text = data.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty response from Anthropic API");
  return extractMarkdown(text);
}
async function enhanceWithOpenAI(content, analysis, docType) {
  const prompt = buildPrompt(content, analysis, docType);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "unknown error");
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }
  const data = await response.json();
  const text = data.choices[0]?.message?.content;
  if (!text) throw new Error("Empty response from OpenAI API");
  return extractMarkdown(text);
}
function buildPrompt(draftContent, analysis, docType) {
  const docTypeLabel = {
    readme: "README",
    api: "API documentation",
    contributing: "CONTRIBUTING guide",
    changelog: "CHANGELOG"
  };
  const projectContext = [
    `Project: ${analysis.name} v${analysis.version}`,
    `Language: ${analysis.language}`,
    analysis.framework !== "None" ? `Framework: ${analysis.framework}` : "",
    `Type: ${[
      analysis.isCli && "CLI tool",
      analysis.isLibrary && "library",
      analysis.isApi && "API",
      analysis.isFullstack && "fullstack app"
    ].filter(Boolean).join(", ") || "application"}`,
    analysis.dependencies.length > 0 ? `Dependencies: ${analysis.dependencies.slice(0, 8).join(", ")}` : ""
  ].filter(Boolean).join("\n");
  const truncatedDraft = draftContent.length > MAX_CONTENT_CHARS ? draftContent.slice(0, MAX_CONTENT_CHARS) + "\n\n[... truncated ...]" : draftContent;
  return `You are a technical writer. Improve the following auto-generated ${docTypeLabel[docType]} for a software project.

Project context:
${projectContext}

Rules:
- Keep all existing sections and structure
- Improve descriptions to be more precise and helpful
- Fill in any placeholder comments with realistic content based on the project context
- Keep the same markdown format
- Do NOT add fictional features or make things up
- Return ONLY the improved markdown, no preamble

Draft ${docTypeLabel[docType]}:

${truncatedDraft}`;
}
function extractMarkdown(text) {
  const fenceMatch = text.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim() + "\n";
  return text.trim() + "\n";
}

// src/index.ts
var program = new Command();
program.name("ai-readme-gen").description("Generate professional documentation for any project using AI or smart heuristics").version("1.0.0").argument("[directory]", "Project directory to scan", ".").option("-o, --output <file>", "Output file path (default: auto-detected)").option("--type <type>", "Document type: readme, api, contributing, changelog", "readme").option("--style <style>", "Documentation style: minimal, standard, detailed", "standard").option("--no-ai", "Disable AI enhancement even if API key is available").option("--overwrite", "Overwrite existing file without prompting").option("--dry-run", "Print generated content to stdout without writing a file").action(async (directory, flags) => {
  console.log(chalk.bold("\n  ai-readme-gen\n"));
  const targetDir = path4.resolve(directory);
  if (!fs3.existsSync(targetDir)) {
    console.error(chalk.red(`  Error: Directory "${targetDir}" does not exist.
`));
    process.exit(1);
  }
  const docType = flags.type ?? "readme";
  const style = flags.style ?? "standard";
  const useAi = flags.ai !== false;
  const dryRun = Boolean(flags.dryRun);
  const overwrite = Boolean(flags.overwrite);
  const defaultOutputs = {
    readme: "README.md",
    api: "API.md",
    contributing: "CONTRIBUTING.md",
    changelog: "CHANGELOG.md"
  };
  const outputFile = flags.output ? path4.resolve(flags.output) : path4.join(targetDir, defaultOutputs[docType]);
  if (!dryRun && !overwrite && fs3.existsSync(outputFile)) {
    console.error(chalk.yellow(`  Warning: "${outputFile}" already exists. Use --overwrite to replace it.
`));
    process.exit(1);
  }
  try {
    console.log(chalk.dim(`  Scanning ${targetDir}...`));
    const scanResult = await scanProject(targetDir);
    console.log(chalk.dim("  Analyzing project structure..."));
    const analysis = await analyzeProject(scanResult);
    console.log(chalk.dim("  Generating documentation..."));
    let content = generateDoc(analysis, docType, style);
    if (useAi && (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)) {
      console.log(chalk.dim("  Enhancing with AI..."));
      content = await aiEnhance(content, analysis, docType);
    }
    if (dryRun) {
      console.log("\n" + content + "\n");
      return;
    }
    await fs3.ensureDir(path4.dirname(outputFile));
    await fs3.writeFile(outputFile, content, "utf-8");
    const rel = path4.relative(process.cwd(), outputFile);
    console.log(chalk.green(`
  Generated: ${rel}
`));
    if (!useAi && !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      console.log(
        chalk.dim("  Tip: Set ANTHROPIC_API_KEY or OPENAI_API_KEY for AI-enhanced output.\n")
      );
    }
  } catch (err) {
    console.error(chalk.red("\n  Failed to generate documentation:"), err);
    process.exit(1);
  }
});
program.parse();
//# sourceMappingURL=index.js.map