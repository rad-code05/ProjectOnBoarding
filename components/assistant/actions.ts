"use server";

import type { UIMessage } from "ai";
import * as z from "zod";
import { getCurrentUser } from "@/lib/auth";
import { withoutThinking } from "@/lib/ai/chat-run";
import { loadChatMessages } from "@/lib/ai/chat-store";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The chat the panel was showing on this device, so a page reload or the
 * next page keeps the conversation. Own chats only (RLS); a chat that was
 * deleted (60 days, or Delete my chats) comes back empty.
 */
export async function loadAssistantChat(chatId: string): Promise<UIMessage[]> {
  const { roles } = await getCurrentUser();
  const id = z.uuid().safeParse(chatId);
  if (!roles.length || !id.success) return [];
  try {
    const messages = await loadChatMessages(
      createServerSupabaseClient(),
      id.data,
    );
    return messages ? withoutThinking(messages) : [];
  } catch {
    return [];
  }
}
