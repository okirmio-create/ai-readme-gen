type DocType = "readme" | "api" | "contributing" | "changelog";
type DocStyle = "minimal" | "standard" | "detailed";
interface GenerateOptions {
    output: string;
    type: DocType;
    style: DocStyle;
    aiEnhance: boolean;
    overwrite: boolean;
    dryRun: boolean;
}

export type { DocStyle, DocType, GenerateOptions };
