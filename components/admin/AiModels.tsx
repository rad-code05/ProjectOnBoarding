"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  saveAiModel,
  setAiModelActive,
  testAiModel,
} from "@/app/(app)/admin/actions";
import {
  Button,
  CheckIcon,
  InlineError,
  Sheet,
  TextField,
} from "@/components/ui";
import type { AdminAiModel } from "@/lib/admin/ai-shared";

/**
 * Admin → AI settings → the models (F15e-2, board Phone · Admin · AI
 * settings): every model with Edit and Retire (the one in use can't be
 * retired), retired ones with Restore, and Add a model. Retire instead of
 * delete: the chat history keeps which model answered.
 */
export function AiModels({
  models,
  inUse,
}: {
  models: AdminAiModel[];
  inUse: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminAiModel | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const setActive = (m: AdminAiModel, active: boolean) =>
    start(async () => {
      setError(null);
      const result = await setAiModelActive(m.id, active);
      if (!result.ok) return setError(result.message);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-3">
      <h3 className="text-xs font-semibold text-graphite">All models</h3>
      <ul className="flex flex-col gap-1.5">
        {models.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-sand px-3 py-2"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">{m.name}</span>
              <span className="text-xs text-graphite">
                {m.active ? m.modelId : "Retired"}
                {m.id === inUse && " · in use"}
              </span>
            </span>
            {m.active ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  aria-label={`Edit ${m.name}`}
                  className="h-9 cursor-pointer rounded-pill border border-field-border bg-paper px-3 text-[13px] font-semibold"
                >
                  Edit
                </button>
                {m.id !== inUse && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setActive(m, false)}
                    aria-label={`Retire ${m.name}`}
                    className="h-9 cursor-pointer rounded-pill border border-field-border bg-paper px-3 text-[13px] font-semibold"
                  >
                    Retire
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setActive(m, true)}
                aria-label={`Restore ${m.name}`}
                className="h-9 cursor-pointer rounded-pill border border-field-border bg-paper px-3 text-[13px] font-semibold"
              >
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <InlineError live>{error}</InlineError>}
      <Button
        variant="secondary"
        aria-haspopup="dialog"
        onClick={() => setEditing("new")}
        className="self-start"
      >
        Add a model
      </Button>
      <p className="text-xs leading-normal text-graphite">
        Add a model when Anthropic releases one — no change to the app. Every
        model has Edit and Retire (the one in use can&apos;t be retired). Retire
        instead of delete: the chat history keeps which model answered. Every
        change is audited.
      </p>
      {editing && (
        <AiModelSheet
          model={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Add / edit a model (board: Phone · Admin · Add / edit a model). */
export function AiModelSheet({
  model,
  onClose,
  onSaved,
}: {
  model: AdminAiModel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(model?.name ?? "");
  const [modelId, setModelId] = useState(model?.modelId ?? "");
  const [note, setNote] = useState(model?.note ?? "");
  const [priceIn, setPriceIn] = useState(model ? String(model.priceIn) : "");
  const [priceOut, setPriceOut] = useState(model ? String(model.priceOut) : "");
  const [test, setTest] = useState<
    { ok: true } | { ok: false; message: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();

  const runTest = () =>
    startTest(async () => {
      setTest(null);
      setTest(await testAiModel({ modelId, id: model?.id ?? null }));
    });

  const save = () =>
    startSave(async () => {
      setError(null);
      const result = await saveAiModel({
        id: model?.id ?? null,
        name,
        modelId,
        note: note || null,
        priceIn: priceIn === "" ? Number.NaN : Number(priceIn),
        priceOut: priceOut === "" ? Number.NaN : Number(priceOut),
      });
      if (!result.ok) return setError(result.message);
      onSaved();
    });

  return (
    <Sheet
      eyebrow="AI settings"
      title={model ? "Edit a model" : "Add a model"}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 md:flex-row-reverse">
          <Button loading={saving} onClick={save}>
            {model ? "Save model" : "Add model"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <TextField
          label="Name shown to people"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        <TextField
          label="Model ID (from Anthropic)"
          hint="Exactly as in Anthropic's model list — lower case, letters, digits, dashes and dots."
          value={modelId}
          onChange={(e) => {
            setModelId(e.target.value);
            setTest(null);
          }}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={80}
        />
        <TextField
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Price in · USD / 1M tokens"
            type="number"
            inputMode="decimal"
            min={0}
            max={1000}
            step="0.0001"
            value={priceIn}
            onChange={(e) => setPriceIn(e.target.value)}
          />
          <TextField
            label="Price out · USD / 1M tokens"
            type="number"
            inputMode="decimal"
            min={0}
            max={1000}
            step="0.0001"
            value={priceOut}
            onChange={(e) => setPriceOut(e.target.value)}
          />
        </div>
        <p className="text-xs leading-normal text-graphite">
          The prices count the monthly budget — copy them from Anthropic&apos;s
          price list.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            loading={testing}
            disabled={!modelId.trim()}
            onClick={runTest}
            className="self-start"
          >
            Test the model
          </Button>
          <div role="status" aria-live="polite" className="text-[13px]">
            {test?.ok && (
              <span className="flex items-center gap-1.5 font-semibold">
                <CheckIcon size={16} />
                Anthropic answered — the ID works
              </span>
            )}
            {test && !test.ok && (
              <span className="font-semibold text-signal">{test.message}</span>
            )}
          </div>
        </div>
        {error && <InlineError live>{error}</InlineError>}
      </div>
    </Sheet>
  );
}
