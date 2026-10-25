import "server-only";
import * as z from "zod";
import {
  createServerSupabaseClient,
  type ServerSupabase,
} from "@/lib/supabase/server";
import {
  checkDefinition,
  definitionSchema,
  type Definition,
  type Part,
} from "./definition";
import { runPart, type PartResult } from "./engine";
import { loadDatasets } from "./load";

/**
 * Saved custom reports (F17a): the maker's own rows (RLS), the definition
 * checked again on every read — a report saved under an older catalogue
 * that no longer fits is shown as "can't be run", never guessed at.
 */

export type CustomReportSummary = {
  id: string;
  title: string;
  parts: number;
  updatedAt: string;
};

/** Your custom reports, newest first (Reports page). */
export async function listMyCustomReports(
  supabase: ServerSupabase = createServerSupabaseClient(),
): Promise<CustomReportSummary[]> {
  const { data, error } = await supabase
    .from("custom_reports")
    .select("id, title, definition, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error)
    throw new Error(`Could not load your custom reports: ${error.message}`);
  return (data ?? []).map((r) => {
    const parts = (r.definition as { parts?: unknown } | null)?.parts;
    return {
      id: r.id,
      title: r.title,
      parts: Array.isArray(parts) ? parts.length : 0,
      updatedAt: r.updated_at,
    };
  });
}

export type CustomReport = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Null when the saved definition no longer fits the language. */
  definition: Definition | null;
  problems: string[];
};

/** One of your custom reports, or null (not found, or not yours — RLS). */
export async function loadCustomReport(
  id: string,
  supabase: ServerSupabase = createServerSupabaseClient(),
): Promise<CustomReport | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase
    .from("custom_reports")
    .select("id, title, definition, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw new Error(`Could not load the custom report: ${error.message}`);
  if (!data) return null;
  const parsed = definitionSchema.safeParse(data.definition);
  const problems = parsed.success
    ? checkDefinition(parsed.data)
    : ["The saved report doesn't fit the report language any more."];
  return {
    id: data.id,
    title: data.title,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    definition: parsed.success && problems.length === 0 ? parsed.data : null,
    problems,
  };
}

export type PartOutcome = { part: Part; result: PartResult };

/**
 * Runs a checked definition: reads each data set it uses once, with the
 * reader's own access, then applies every part (company-time days).
 */
export async function runCustomReport(
  definition: Definition,
  timeZone: string,
  supabase: ServerSupabase = createServerSupabaseClient(),
): Promise<PartOutcome[]> {
  const data = await loadDatasets(
    definition.parts.map((p) => p.dataset),
    supabase,
  );
  return definition.parts.map((part) => ({
    part,
    result: runPart(part, data.get(part.dataset) ?? [], timeZone),
  }));
}
