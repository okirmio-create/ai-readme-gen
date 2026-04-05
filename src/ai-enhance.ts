import type { ProjectAnalysis } from "./analyzer.js";
import type { DocType } from "./index.js";

const MAX_CONTENT_CHARS = 12_000;

export async function aiEnhance(
  content: string,
  analysis: ProjectAnalysis,
  docType: DocType
): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    return enhanceWithAnthropic(content, analysis, docType);
  }
  if (process.env.OPENAI_API_KEY) {
    return enhanceWithOpenAI(content, analysis, docType);
  }
  return content;
}

async function enhanceWithAnthropic(
  content: string,
  analysis: ProjectAnalysis,
  docType: DocType
): Promise<string> {
  const prompt = buildPrompt(content, analysis, docType);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "unknown error");
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty response from Anthropic API");

  return extractMarkdown(text);
}

async function enhanceWithOpenAI(
  content: string,
  analysis: ProjectAnalysis,
  docType: DocType
): Promise<string> {
  const prompt = buildPrompt(content, analysis, docType);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "unknown error");
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices[0]?.message?.content;
  if (!text) throw new Error("Empty response from OpenAI API");

  return extractMarkdown(text);
}

function buildPrompt(
  draftContent: string,
  analysis: ProjectAnalysis,
  docType: DocType
): string {
  const docTypeLabel: Record<DocType, string> = {
    readme: "README",
    api: "API documentation",
    contributing: "CONTRIBUTING guide",
    changelog: "CHANGELOG",
  };

  const projectContext = [
    `Project: ${analysis.name} v${analysis.version}`,
    `Language: ${analysis.language}`,
    analysis.framework !== "None" ? `Framework: ${analysis.framework}` : "",
    `Type: ${[
      analysis.isCli && "CLI tool",
      analysis.isLibrary && "library",
      analysis.isApi && "API",
      analysis.isFullstack && "fullstack app",
    ]
      .filter(Boolean)
      .join(", ") || "application"}`,
    analysis.dependencies.length > 0
      ? `Dependencies: ${analysis.dependencies.slice(0, 8).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const truncatedDraft =
    draftContent.length > MAX_CONTENT_CHARS
      ? draftContent.slice(0, MAX_CONTENT_CHARS) + "\n\n[... truncated ...]"
      : draftContent;

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

function extractMarkdown(text: string): string {
  // Strip potential code fences wrapping the response
  const fenceMatch = text.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim() + "\n";
  return text.trim() + "\n";
}
