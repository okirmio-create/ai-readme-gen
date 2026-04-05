# ai-readme-gen

[![npm version](https://img.shields.io/npm/v/ai-readme-gen)](https://www.npmjs.com/package/ai-readme-gen)
[![license](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

> Generate professional README.md and documentation for any project — using AI or smart heuristics without any API key.

## Features

- Works **without any API key** — uses template + heuristics by default
- Optional AI enhancement via `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- Detects: Node.js, Go, Rust, Python and more
- Generates: README, API docs, CONTRIBUTING guide, CHANGELOG
- Three styles: `minimal`, `standard`, `detailed`
- Extracts exports, env vars, scripts, badges automatically

## Installation

```bash
npm install -g ai-readme-gen
# or use directly with npx
npx ai-readme-gen .
```

## Usage

```bash
# Generate README for current directory
npx ai-readme-gen .

# Specify output file
npx ai-readme-gen ./my-project -o README.md

# Generate API docs
npx ai-readme-gen . --type api

# Generate CHANGELOG
npx ai-readme-gen . --type changelog

# Generate CONTRIBUTING guide
npx ai-readme-gen . --type contributing

# Minimal style (less sections)
npx ai-readme-gen . --style minimal

# Detailed style (includes full API surface)
npx ai-readme-gen . --style detailed

# Preview without writing file
npx ai-readme-gen . --dry-run

# Overwrite existing file
npx ai-readme-gen . --overwrite

# Disable AI even if API key is set
npx ai-readme-gen . --no-ai
```

## AI Enhancement

Set an environment variable to enable AI-enhanced descriptions:

```bash
# Using Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-... npx ai-readme-gen .

# Using OpenAI
OPENAI_API_KEY=sk-... npx ai-readme-gen .
```

Without an API key, the tool still generates high-quality documentation using:
- Detected tech stack and framework
- Extracted exports and function signatures
- Scripts from package.json / go.mod / Cargo.toml
- Env vars from `.env.example` and source scanning

## Supported Project Types

| Type | Detection |
|------|-----------|
| Node.js / TypeScript | `package.json` |
| Go | `go.mod` |
| Rust | `Cargo.toml` |
| Python | `pyproject.toml`, `requirements.txt` |
| Generic | Source file extensions |

## Configuration

No config file needed. All options are CLI flags.

| Flag | Default | Description |
|------|---------|-------------|
| `--type` | `readme` | Document type: `readme`, `api`, `contributing`, `changelog` |
| `--style` | `standard` | Style: `minimal`, `standard`, `detailed` |
| `-o, --output` | auto | Output file path |
| `--overwrite` | false | Overwrite existing file |
| `--dry-run` | false | Print to stdout instead of writing |
| `--no-ai` | false | Disable AI even if API key is present |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © 2024 Contributors
