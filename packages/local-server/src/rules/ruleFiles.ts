import { readdir, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectOptions, ReadText, WriteText } from "../config/configRepository.js";

export type { ReadText, WriteText };

export type ReadDirectory = (directory: string) => Promise<string[]>;
export type RemovePath = (filePath: string) => Promise<void>;

export interface ProjectRuleFilesOptions extends ProjectOptions {
  readDirectory?: ReadDirectory;
}

export interface ProjectRuleFileOptions extends ProjectOptions {
  file: string;
  readText?: ReadText;
}

export interface WriteProjectRuleFileOptions extends ProjectOptions {
  file: string;
  text: string;
  writeText?: WriteText;
}

export interface DeleteProjectRuleFileOptions extends ProjectOptions {
  file: string;
  removePath?: RemovePath;
}

export interface ProjectRuleFileResult {
  file: string;
  text: string;
}

export interface DeleteProjectRuleFileResult {
  file: string;
}

function rulesDirectory(options: ProjectOptions): string {
  return path.resolve(options.root, "config/rules");
}

function resolveRuleFile(options: ProjectOptions, file: string): string {
  if (!/^[A-Za-z0-9_.-]+\.list$/.test(file)) {
    throw new Error(`Invalid rule file: ${file}`);
  }

  const directory = rulesDirectory(options);
  const resolved = path.resolve(directory, file);
  if (!resolved.startsWith(`${directory}${path.sep}`)) {
    throw new Error(`Invalid rule file: ${file}`);
  }
  return resolved;
}

export async function listProjectRuleFiles(options: ProjectRuleFilesOptions): Promise<string[]> {
  const readDirectory = options.readDirectory ?? ((directory: string) => readdir(directory));
  return (await readDirectory(rulesDirectory(options)))
    .filter((file) => /^[A-Za-z0-9_.-]+\.list$/.test(file))
    .sort();
}

export async function readProjectRuleFile(options: ProjectRuleFileOptions): Promise<ProjectRuleFileResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  return {
    file: options.file,
    text: await readText(resolveRuleFile(options, options.file)),
  };
}

export async function writeProjectRuleFile(
  options: WriteProjectRuleFileOptions,
): Promise<ProjectRuleFileResult> {
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFile(filePath, text, "utf8"));
  const text = options.text.replace(/\r\n?/g, "\n").replace(/\n?$/, "\n");
  await writeText(resolveRuleFile(options, options.file), text);
  return {
    file: options.file,
    text,
  };
}

export async function deleteProjectRuleFile(
  options: DeleteProjectRuleFileOptions,
): Promise<DeleteProjectRuleFileResult> {
  const removePath = options.removePath ?? ((filePath: string) => rm(filePath, { force: true }));
  await removePath(resolveRuleFile(options, options.file));
  return { file: options.file };
}
