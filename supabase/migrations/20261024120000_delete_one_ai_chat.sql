-- F15d-2e Previous chats: delete ONE of your own assistant chats (board
-- Phone · Assistant · Previous chats). Like delete_my_ai_chats(): own data
-- only, audited without the content (no title, no text). Someone else's
-- chat id simply deletes nothing.

create function public.delete_my_ai_chat(p_chat_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := private.current_user_id();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  delete from public.ai_chats where id = p_chat_id and user_id = v_user;
  if not found then
    return false;
  end if;
  perform private.write_audit('ai.chat_deleted', 'app_user', v_user, jsonb_build_object('chats', 1));
  return true;
end;
$$;
comment on function public.delete_my_ai_chat(uuid) is
  'Deletes one of the caller''s own assistant chats (messages with it); audited without content.';

revoke all on function public.delete_my_ai_chat(uuid) from public, anon;
grant execute on function public.delete_my_ai_chat(uuid) to authenticated;
