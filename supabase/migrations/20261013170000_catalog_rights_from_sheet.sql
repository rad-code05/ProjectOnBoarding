-- Catalog: each application's permissions renamed to the roles the tools
-- really use (Raju's "Laine-User-Rights" sheet, 2026-10-13). Only role names
-- come from the sheet — never people. Raju's choices: Firebase, Trello and
-- Google Cloud keep the old options and add the sheet's; Sophos Central,
-- Hexnode (MDM), Excalidraw, Cursor and Confluence stay as they are; GoDaddy
-- without "Signature CTO". Google Cloud roles leave out the project name
-- (write it in the row's notes, e.g. "Cloud Run Admin on laine-ai-dev").
--
-- Rows already recorded keep their old permission: request items and the
-- access inventory store the name as text, and offboarding removals accept a
-- permission that is no longer offered.
update public.catalog_apps a
set permissions = v.permissions
from (values
  ('Adobe',            '{Member,Admin}'::text[]),
  ('Clay',             '{Editor,Admin}'),
  ('Deel',             '{"Group Admin"}'),
  ('Figma',            '{View,Dev,Full}'),
  ('Firebase',         '{Viewer,Editor,Admin,Owner}'),
  ('GitHub',           '{Maintain,Admin}'),
  ('GoDaddy',          '{Collaborator,Owner}'),
  ('Google Cloud',     '{Viewer,Editor,Admin,Owner,"Secret Manager Secret Accessor","Secret Manager Admin","Cloud Run Admin","Vertex AI User","Project Creator","Organization Administrator","Organization Policy Administrator","Organization Role Administrator","Organization Role Viewer","Access Policy Admin","Security Center Admin","Security Center Admin Viewer","Security Center Management Admin","Gemini for Google Cloud Settings Admin"}'),
  ('Google Workspace', '{User,"Super Admin"}'),
  ('Graphite',         '{Maintain,Admin}'),
  ('HostedScan',       '{Admin}'),
  ('HubSpot',          '{"Core user",Developer,"Super Admin"}'),
  ('LangFuse',         '{Member,Admin,Owner}'),
  ('Mixpanel',         '{"Billing Admin",Admin,Owner}'),
  ('Monday.com',       '{Guest,Member,Admin}'),
  ('Office 365',       '{User,"SharePoint Admin",Admin}'),
  ('resend.com',       '{Member,Admin}'),
  ('SecureFrame',      '{User,Admin,"Super Admin"}'),
  ('Sentry',           '{Member,Manager,Owner}'),
  ('Siteground',       '{Collaborator,Owner}'),
  ('Slack',            '{"Regular Member","Workspace Owner","Primary Workspace Owner"}'),
  ('Stripe',           '{Administrator,"Super Administrator"}'),
  ('Supabase',         '{Developer,Administrator,Owner}'),
  ('Trello',           '{Guest,Member,Admin,Owner}'),
  ('Vouch',            '{"Group Admin",Admin,Owner}')
) as v (name, permissions)
where a.name = v.name;

-- Every name above must exist, so a typo fails the migration instead of
-- silently skipping an application.
do $$
declare
  v_missing integer;
begin
  select 25 - count(*) into v_missing
  from public.catalog_apps
  where name in ('Adobe', 'Clay', 'Deel', 'Figma', 'Firebase', 'GitHub', 'GoDaddy', 'Google Cloud',
    'Google Workspace', 'Graphite', 'HostedScan', 'HubSpot', 'LangFuse', 'Mixpanel', 'Monday.com',
    'Office 365', 'resend.com', 'SecureFrame', 'Sentry', 'Siteground', 'Slack', 'Stripe', 'Supabase',
    'Trello', 'Vouch');
  if v_missing <> 0 then
    raise exception 'catalog rights: % application name(s) not found', v_missing;
  end if;
end;
$$;
