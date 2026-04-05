import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import fs from "fs-extra";
import { scanProject } from "./scanner.js";
import { analyzeProject } from "./analyzer.js";
import { generateDoc } from "./generator.js";
import { aiEnhance } from "./ai-enhance.js";

export type DocType = "readme" | "api" | "contributing" | "changelog";
export type DocStyle = "minimal" | "standard" | "detailed";

export interface GenerateOptions {
  output: string;
  type: DocType;
  style: DocStyle;
  aiEnhance: boolean;
  overwrite: boolean;
  dryRun: boolean;
}

const program = new Command();

program
  .name("ai-readme-gen")
  .description("Generate professional documentation for any project using AI or smart heuristics")
  .version("1.0.0")
  .argument("[directory]", "Project directory to scan", ".")
  .option("-o, --output <file>", "Output file path (default: auto-detected)")
  .option("--type <type>", "Document type: readme, api, contributing, changelog", "readme")
  .option("--style <style>", "Documentation style: minimal, standard, detailed", "standard")
  .option("--no-ai", "Disable AI enhancement even if API key is available")
  .option("--overwrite", "Overwrite existing file without prompting")
  .option("--dry-run", "Print generated content to stdout without writing a file")
  .action(async (directory: string, flags: Record<string, string | boolean>) => {
    console.log(chalk.bold("\n  ai-readme-gen\n"));

    const targetDir = path.resolve(directory);

    if (!fs.existsSync(targetDir)) {
      console.error(chalk.red(`  Error: Directory "${targetDir}" does not exist.\n`));
      process.exit(1);
    }

    const docType = (flags.type as DocType) ?? "readme";
    const style = (flags.style as DocStyle) ?? "standard";
    const useAi = flags.ai !== false;
    const dryRun = Boolean(flags.dryRun);
    const overwrite = Boolean(flags.overwrite);

    const defaultOutputs: Record<DocType, string> = {
      readme: "README.md",
      api: "API.md",
      contributing: "CONTRIBUTING.md",
      changelog: "CHANGELOG.md",
    };

    const outputFile = flags.output
      ? path.resolve(flags.output as string)
      : path.join(targetDir, defaultOutputs[docType]);

    if (!dryRun && !overwrite && fs.existsSync(outputFile)) {
      console.error(chalk.yellow(`  Warning: "${outputFile}" already exists. Use --overwrite to replace it.\n`));
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

      await fs.ensureDir(path.dirname(outputFile));
      await fs.writeFile(outputFile, content, "utf-8");

      const rel = path.relative(process.cwd(), outputFile);
      console.log(chalk.green(`\n  Generated: ${rel}\n`));

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
