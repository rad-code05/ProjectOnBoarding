"use server";

import type { UIMessage } from "ai";
import * as z from "zod";
import { getCurrentUser } from "@/lib/auth";
import { withoutThinking } from "@/lib/ai/chat-run";
import type { ChatSummary } from "@/lib/ai/chat-ui";
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

/**
 * Previous chats (F15d-2e, board Phone · Assistant · Previous chats): the
 * person's own chats, newest last message first. RLS: own chats only.
 */
export async function listAssistantChats(): Promise<ChatSummary[]> {
  const { roles } = await getCurrentUser();
  if (!roles.length) return [];
  const { data, error } = await createServerSupabaseClient()
    .from("ai_chats")
    .select("id, title, updated_at, ai_messages(count)")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return [];
  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title || "Untitled chat",
    updatedAt: c.updated_at,
    messages: c.ai_messages[0]?.count ?? 0,
  }));
}

/** Deletes one of the person's own chats (audited without content). */
export async function deleteAssistantChat(chatId: string): Promise<boolean> {
  await getCurrentUser();
  const id = z.uuid().safeParse(chatId);
  if (!id.success) return false;
  const { data, error } = await createServerSupabaseClient().rpc(
    "delete_my_ai_chat",
    { p_chat_id: id.data },
  );
  return !error && data === true;
}
