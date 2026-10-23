import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Role } from "@/lib/auth";

/**
 * The help library the assistant answers app questions from (PROJECT_PLAN
 * §6.6, `getAppHelp`): one Markdown file per topic in `lib/ai/knowledge/`,
 * written by us — never outside sources. Front matter: title, audience
 * (all | it | admin), summary.
 */
export type HelpAudience = "all" | "it" | "admin";

export type HelpTopic = {
  id: string;
  title: string;
  audience: HelpAudience;
  summary: string;
  text: string;
};

const DIR = path.join(process.cwd(), "lib", "ai", "knowledge");
const AUDIENCES: HelpAudience[] = ["all", "it", "admin"];

/** One help file → a topic; throws on a malformed file (caught by the tests). */
export function parseHelpFile(id: string, source: string): HelpTopic {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`Help file ${id} has no front matter.`);
  const meta = Object.fromEntries(
    match[1].split(/\r?\n/).map((line) => {
      const at = line.indexOf(":");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
  const audience = meta.audience as HelpAudience;
  if (!meta.title || !meta.summary || !AUDIENCES.includes(audience)) {
    throw new Error(
      `Help file ${id} needs a title, a summary and an audience.`,
    );
  }
  return {
    id,
    title: meta.title,
    audience,
    summary: meta.summary,
    text: match[2].trim(),
  };
}

let cached: HelpTopic[] | null = null;

/** Every help topic, in file-name order (read once per server). */
export function helpTopics(): HelpTopic[] {
  cached ??= readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) =>
      parseHelpFile(
        f.replace(/\.md$/, ""),
        readFileSync(path.join(DIR, f), "utf8"),
      ),
    );
  return cached;
}

/**
 * Which topics a person may read: approvers and auditors the general ones,
 * the IT side also how requests are filled in, admins also Admin.
 */
export function helpAudiences(roles: readonly Role[]): HelpAudience[] {
  const audiences: HelpAudience[] = ["all"];
  if (
    roles.some((r) => r === "admin" || r === "requester" || r === "it_operator")
  ) {
    audiences.push("it");
  }
  if (roles.includes("admin")) audiences.push("admin");
  return audiences;
}

export function helpTopicsFor(roles: readonly Role[]): HelpTopic[] {
  const allowed = helpAudiences(roles);
  return helpTopics().filter((t) => allowed.includes(t.audience));
}
