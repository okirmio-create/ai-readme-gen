import Handlebars from "handlebars";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import type { ProjectAnalysis, DocType, DocStyle } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Register helpers
Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);
Handlebars.registerHelper("ne", (a: unknown, b: unknown) => a !== b);
Handlebars.registerHelper("and", (a: unknown, b: unknown) => Boolean(a) && Boolean(b));
Handlebars.registerHelper("or", (a: unknown, b: unknown) => Boolean(a) || Boolean(b));
Handlebars.registerHelper("not", (a: unknown) => !a);
Handlebars.registerHelper("hasItems", (arr: unknown[]) => Array.isArray(arr) && arr.length > 0);
Handlebars.registerHelper("join", (arr: string[], sep: string) =>
  Array.isArray(arr) ? arr.join(typeof sep === "string" ? sep : ", ") : ""
);
Handlebars.registerHelper("upper", (s: string) => (typeof s === "string" ? s.toUpperCase() : s));
Handlebars.registerHelper("trim", (s: string) => (typeof s === "string" ? s.trim() : s));
Handlebars.registerHelper("year", () => new Date().getFullYear());
Handlebars.registerHelper("date", () => new Date().toISOString().slice(0, 10));

const templateCache = new Map<string, HandlebarsTemplateDelegate>();

function loadTemplate(templateName: string): HandlebarsTemplateDelegate {
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName)!;
  }

  // Try project templates dir first (dist-adjacent), then inline fallback
  const templatesDir = path.join(__dirname, "..", "templates");
  const filePath = path.join(templatesDir, templateName);

  let source: string;
  if (fs.existsSync(filePath)) {
    source = fs.readFileSync(filePath, "utf-8");
  } else {
    source = getFallbackTemplate(templateName);
  }

  const compiled = Handlebars.compile(source);
  templateCache.set(templateName, compiled);
  return compiled;
}

export function generateDoc(
  analysis: ProjectAnalysis,
  type: DocType,
  style: DocStyle
): string {
  const templateMap: Record<DocType, string> = {
    readme: "readme.md.hbs",
    api: "api.md.hbs",
    contributing: "contributing.md.hbs",
    changelog: "changelog.md.hbs",
  };

  const templateName = templateMap[type];
  const template = loadTemplate(templateName);

  return template({ ...analysis, style, docType: type }).trim() + "\n";
}

// Fallback inline templates when templates/ directory is not present
function getFallbackTemplate(name: string): string {
  const templates: Record<string, string> = {
    "readme.md.hbs": FALLBACK_README,
    "api.md.hbs": FALLBACK_API,
    "contributing.md.hbs": FALLBACK_CONTRIBUTING,
    "changelog.md.hbs": FALLBACK_CHANGELOG,
  };
  return templates[name] ?? `# ${name}\n\nNo template found.\n`;
}

const FALLBACK_README = `# {{name}}

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
{{#each envVars}}| \`{{name}}\` | {{#if required}}Yes{{else}}No{{/if}} | {{#if defaultValue}}\`{{defaultValue}}\`{{else}}—{{/if}} | {{#if description}}{{description}}{{else}}—{{/if}} |
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

{{license}} © {{year}} {{#if author}}{{author}}{{else}}Contributors{{/if}}
`;

const FALLBACK_API = `# API Reference — {{name}}

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

const FALLBACK_CONTRIBUTING = `# Contributing to {{name}}

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

const FALLBACK_CHANGELOG = `# Changelog

All notable changes to **{{name}}** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [{{version}}] — {{date}}

### Added

- Initial release

---

<!-- Template for future entries:

## [X.Y.Z] — YYYY-MM-DD

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security

-->
`;
