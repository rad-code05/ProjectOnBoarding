import { tool } from "ai";
import * as z from "zod";
import { DATASETS, DATASET_KEYS } from "@/lib/reports/custom/datasets";
import {
  checkDefinition,
  definitionSchema,
  LIMITS,
} from "@/lib/reports/custom/definition";
import type { Json } from "@/lib/supabase/database.types";
import { runCustomReport } from "@/lib/reports/custom/store";
import { formatCell, partWords } from "@/lib/reports/custom/words";
import { defineTool } from "./types";

/** The data set catalogue, as the model reads it (F17a). */
export function catalogueText(): string {
  return DATASET_KEYS.map((key) => {
    const ds = DATASETS[key];
    const fields = ds.fields
      .map((f) => `${f.key} (${f.type}${f.about ? `: ${f.about}` : ""})`)
      .join("; ");
    return `- ${key} = ${ds.label}, one row per ${ds.row}. ${ds.about}${
      ds.holdings ? " Supports the 'holds' condition." : ""
    } Fields: ${fields}.`;
  }).join("\n");
}

const PREVIEW = 5;

/**
 * Builds — or changes — a custom report in the report language (F17a,
 * PROJECT_PLAN §6.6): the server checks the definition against the data set
 * catalogue, runs it with the asker's own access, saves it as their own
 * report (audited by the database) and returns counts, a short preview and
 * the link. Report readers only (admin, approver, auditor), like runReport.
 * Never SQL; never anyone else's report (RLS).
 */
export const saveCustomReport = defineTool({
  name: "saveCustomReport",
  roles: ["admin", "approver", "auditor"],
  kind: "own",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "Build a custom report the standard reports (runReport) can't give: any combination of the data sets below, conditions, grouping and up to",
        `${LIMITS.parts} parts. Also use it to change a report you built in this chat (pass its reportId).`,
        "Before calling: if anything is vague (relative dates, 'from <country>' = nationality or work country, 'and' between apps = holds all), read your understanding back in a short numbered list with real dates and ask; build straight away when it is clear.",
        "Dates are company-time calendar days (YYYY-MM-DD), inclusive; turn 'last month', '2 weeks ago' etc. into real dates from today's date. Nationalities and countries are ISO codes (BD, CH, AE). Use only the fields listed — if something isn't there, say the app doesn't hold it.",
        "Conditions: eq/ne (value), in/not_in (values), contains/not_contains, empty/not_empty, from/until (date), between (from, to), day_of_month (days: 'even' | 'odd' | [numbers]), weekday (1 = Monday … 7), month (1–12), year, gt/gte/lt/lte (numbers; durations in hours), holds (mode all|any|none, items [{item, role?}], People today only). Combine with {all: [...]}, {any: [...]}, {not: ...}.",
        "Each part: columns for a list, or groupBy (a field, or a date field by day|month|year|weekday) with measures (count; avg|min|max|sum of a number or duration; min|max of a date) and chart true for bars. sort by a shown column or a measure key ('count', 'avg_time_to_approve').",
        "If the result has problems, fix the definition and call again. The step line shows Open the report · CSV · PDF · Excel.",
        "Data sets:",
        catalogueText(),
      ].join("\n"),
      inputSchema: z.object({
        reportId: z
          .uuid()
          .optional()
          .describe("Only to change a report you already built in this chat."),
        definition: definitionSchema,
      }),
      execute: async ({ reportId, definition }) => {
        const problems = checkDefinition(definition);
        if (problems.length) return { error: "Fix the definition.", problems };

        let outcomes;
        try {
          outcomes = await runCustomReport(definition, ctx.timeZone, ctx.db);
        } catch {
          return { error: "The report could not be run just now." };
        }

        const row = {
          title: definition.title,
          definition: definition as unknown as NonNullable<Json>,
        };
        const saved = reportId
          ? await ctx.db
              .from("custom_reports")
              .update(row)
              .eq("id", reportId)
              .select("id")
              .maybeSingle()
          : await ctx.db
              .from("custom_reports")
              .insert(row)
              .select("id")
              .single();
        if (saved.error || !saved.data) {
          return {
            error: reportId
              ? "That report isn't one of yours, or no longer exists. Build a new one."
              : "The report could not be saved just now.",
          };
        }

        return {
          changed: Boolean(reportId),
          reportId: saved.data.id,
          title: definition.title,
          link: `/reports/custom/${saved.data.id}`,
          parts: outcomes.map(({ part, result }) => ({
            title: part.title,
            how: partWords(part),
            [part.groupBy.length ? "groups" : "rows"]: result.total,
            truncated: result.truncated,
            first: result.rows.slice(0, PREVIEW).map((r) =>
              result.columns
                .slice(0, 3)
                .map((c) => formatCell(r[c.key], c, ctx.timeZone))
                .join(" · "),
            ),
          })),
          source:
            "Custom report built from the data sets named in each part, with the asker's own access, as of now.",
        };
      },
    }),
});
