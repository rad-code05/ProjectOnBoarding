import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { UIMessage } from "ai";
import type { Json } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AiStatus, ChatDeps } from "./chat-run";

/**
 * The real database and model behind runChat(): everything with the
 * person's own Supabase session, so RLS keeps chats private.
 */
export function chatStore(instructions: string): ChatDeps {
  const supabase = createServerSupabaseClient();
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  return {
    instructions,
    model: (modelId) => anthropic(modelId),

    status: async (): Promise<AiStatus> => {
      const { data, error } = await supabase.rpc("ai_status").single();
      if (error || !data)
        throw new Error("Could not read the assistant status.");
      return {
        reason: data.reason as AiStatus["reason"],
        model: data.model,
        modelId: data.model_id,
        resetsAt: data.resets_at,
      };
    },

    loadMessages: async (chatId) => {
      const chat = await supabase
        .from("ai_chats")
        .select("id")
        .eq("id", chatId)
        .maybeSingle();
      if (chat.error) throw new Error("Could not load the chat.");
      if (!chat.data) return null;
      const { data, error } = await supabase
        .from("ai_messages")
        .select("id, role, parts")
        .eq("chat_id", chatId)
        .order("created_at");
      if (error) throw new Error("Could not load the chat.");
      return data.map(
        (m) =>
          ({
            id: m.id,
            role: m.role,
            parts: m.parts,
          }) as UIMessage,
      );
    },

    createChat: async (chatId, title) => {
      const { error } = await supabase
        .from("ai_chats")
        .insert({ id: chatId, title });
      // Someone else's chat id: RLS hides it, the insert then clashes.
      if (error) throw new Error("Could not start the chat.");
    },

    saveMessages: async (chatId, messages, model) => {
      if (!messages.length) return;
      const { error } = await supabase.from("ai_messages").insert(
        messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            chat_id: chatId,
            role: m.role,
            parts: m.parts as unknown as Json[],
            model: m.role === "assistant" ? model : null,
          })),
      );
      if (error) throw new Error(`Could not save the chat: ${error.message}`);
    },

    recordUsage: async (model, inputTokens, outputTokens) => {
      const { error } = await supabase.rpc("record_ai_usage", {
        p_model: model,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
      });
      if (error)
        throw new Error(`Could not record the usage: ${error.message}`);
    },
  };
}
