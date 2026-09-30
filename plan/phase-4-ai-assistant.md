# Phase 4 — Laine robot assistant

**Status:** Not started · **Goal:** Raju can fill requests and onboard people in batch by chatting; every AI value is a suggestion until a human accepts it.

**Depends on:** Phase 3 (or at least Phase 2). Decisions D7 (provider, data policy) and D8 (batch format).
**Read first:** `PROJECT_PLAN.md` §6 · `design/main-page.md` (robot + panel) · `design/request-variants.md` (batch) · `design/profile-admin.md` (field suggestions)
**Verify with Context7:** AI SDK (`/websites/ai-sdk_dev`: `streamText`, `tool`, `inputSchema`, `needsApproval`, `useChat`, `addToolApprovalResponse`, response helpers for the pinned version), provider package, CSV/XLSX parser, rate-limiting approach.

## Steps

- [ ] **4.1 Chat backend** — `/api/chat` Route Handler: `requireRole('it_operator')`, model from env var, system prompt, streaming, per-user rate limit and monthly spend cap, request/response logging without personal data.
- [ ] **4.2 Robot launcher & panel** — `RobotAvatar`, `AssistantLauncher` (badge, greeting), `AssistantPanel` (modes, messages, composer, guardrail line), closed by default, state remembered per user/device.
- [ ] **4.3 Field suggestions** — `proposeFieldValues` tool returns proposals only; UI shows `SuggestedField` + `AiSuggestionBanner`; accept/reject/edit; accepted values audited with `source = ai`; "what's missing?" answers.
- [ ] **4.4 Batch onboarding** — file upload (agreed format), server-side parsing, `proposeBatchRows`, `BatchGrid` with per-row checks (missing, invalid, duplicate), `createDraftRequests` tool with `needsApproval: true`.
- [ ] **4.5 Field & catalog suggestions** — `suggestFormField` / catalog suggestion tools (`needsApproval`), landing in Admin for Raju to confirm.
- [ ] **4.6 Safety tests** — assert no tool can approve/sign/submit/close/change roles; prompt-injection fixtures in uploaded files; data-minimisation check of what is sent to the model.

## Exit criteria
Onboarding one person by chat and a 10-row batch both produce correct drafts only after human acceptance; safety tests green.

## Session log
- (none yet)
