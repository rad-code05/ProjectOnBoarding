import * as z from "zod";

/** One model as Admin → AI settings shows it. */
export type AdminAiModel = {
  id: number;
  name: string;
  modelId: string;
  note: string | null;
  priceIn: number;
  priceOut: number;
  active: boolean;
};

export type AiSettingsView = {
  enabled: boolean;
  model: number;
  budget: number;
  hourly: number;
  models: AdminAiModel[];
  usage: { spent: number; answers: number; people: number };
  /** "1 Nov" — when the monthly budget starts again (company time). */
  resetsOn: string;
  /** "Raju Bholani · 22 Oct 2026", or null before anyone saved. */
  lastChanged: string | null;
};

/** What Save sends — the database checks the same limits again. */
export const aiSettingsInput = z.object({
  enabled: z.boolean(),
  model: z.number().int().positive().max(32767),
  budget: z.number().min(0).max(100_000),
  hourly: z.number().int().min(1).max(1000),
});
export type AiSettingsInput = z.infer<typeof aiSettingsInput>;

const price = z
  .number({ error: "Give both prices (USD per 1M tokens)." })
  .min(0, "Prices are USD per 1M tokens, 0–1000.")
  .max(1000, "Prices are USD per 1M tokens, 0–1000.");

/** Add / edit a model (board: Admin · Add / edit a model). */
export const aiModelInput = z.object({
  id: z.number().int().positive().max(32767).nullish(),
  name: z
    .string()
    .trim()
    .min(1, "Give the model a name people will see.")
    .max(80, "A name has up to 80 characters."),
  modelId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9.-]{1,79}$/,
      "Copy the model ID exactly as in Anthropic's model list: lower case, letters, digits, dashes and dots.",
    ),
  note: z
    .string()
    .trim()
    .max(200, "A note has up to 200 characters.")
    .nullish(),
  priceIn: price,
  priceOut: price,
});
export type AiModelInput = z.input<typeof aiModelInput>;

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

/** "$11.40 of $50 · 23%" (budget 0 = everything is over budget). */
export function usageLine(spent: number, budget: number): string {
  const share =
    budget > 0 ? Math.min(999, Math.round((spent / budget) * 100)) : 100;
  return `${usd(spent)} of ${usd(budget)} · ${share}%`;
}

/** "214 questions by 3 people". */
export function usageCount(answers: number, people: number): string {
  const q = answers === 1 ? "1 question" : `${answers} questions`;
  const p = people === 1 ? "1 person" : `${people} people`;
  return answers === 0 ? "No questions yet this month" : `${q} by ${p}`;
}
