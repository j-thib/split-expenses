-- ============================================================================
-- Nickl schema
--
-- Apply with: psql "$SUPABASE_DB_URL" -f supabase/schema.sql
-- (or paste into the Supabase SQL editor)
--
-- Idempotent: safe to re-run. Tables use `if not exists`; functions and
-- policies are dropped + recreated.
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  joined_at    timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  description text not null,
  amount      numeric not null,
  paid_by     uuid not null references auth.users (id),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create table if not exists public.expense_splits (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  user_id      uuid not null references auth.users (id),
  share_amount numeric not null
);

-- ----------------------------------------------------------------------------
-- Indexes (FKs aren't auto-indexed by Postgres; these matter for our queries)
-- ----------------------------------------------------------------------------

create index if not exists groups_invite_code_idx       on public.groups (invite_code);
create index if not exists group_members_user_id_idx    on public.group_members (user_id);
create index if not exists group_members_group_id_idx   on public.group_members (group_id);
create index if not exists expenses_group_id_idx        on public.expenses (group_id);
create index if not exists expense_splits_expense_id_idx on public.expense_splits (expense_id);
create index if not exists expense_splits_user_id_idx   on public.expense_splits (user_id);

-- ----------------------------------------------------------------------------
-- Membership check: SECURITY DEFINER to break the RLS-recursion that would
-- otherwise happen if a SELECT policy on group_members referenced itself.
-- ----------------------------------------------------------------------------

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = gid
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;
alter table public.expenses        enable row level security;
alter table public.expense_splits  enable row level security;

-- groups ---------------------------------------------------------------------
drop policy if exists groups_select_members  on public.groups;
drop policy if exists groups_insert_self     on public.groups;
drop policy if exists groups_update_creator  on public.groups;
drop policy if exists groups_delete_creator  on public.groups;

-- SELECT also allows `created_by = auth.uid()` so that `INSERT ... RETURNING`
-- works for the create-group flow: at the moment the row is returned, the
-- creator hasn't been inserted into group_members yet, so an is_group_member
-- check would fail and the whole INSERT would be rejected.
create policy groups_select_members on public.groups
  for select using (
    public.is_group_member(id) or created_by = auth.uid()
  );

create policy groups_insert_self on public.groups
  for insert with check (created_by = auth.uid());

create policy groups_update_creator on public.groups
  for update using (created_by = auth.uid())
             with check (created_by = auth.uid());

create policy groups_delete_creator on public.groups
  for delete using (created_by = auth.uid());

-- group_members --------------------------------------------------------------
-- Note: INSERT is intentionally narrow. Self-join via invite code goes
-- through public.join_group_by_invite (SECURITY DEFINER), which bypasses RLS.
drop policy if exists group_members_select_in_group  on public.group_members;
drop policy if exists group_members_insert_creator   on public.group_members;
drop policy if exists group_members_update_self      on public.group_members;
drop policy if exists group_members_delete_self      on public.group_members;

create policy group_members_select_in_group on public.group_members
  for select using (public.is_group_member(group_id));

create policy group_members_insert_creator on public.group_members
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

create policy group_members_update_self on public.group_members
  for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy group_members_delete_self on public.group_members
  for delete using (user_id = auth.uid());

-- expenses -------------------------------------------------------------------
drop policy if exists expenses_select_in_group  on public.expenses;
drop policy if exists expenses_insert_in_group  on public.expenses;
drop policy if exists expenses_update_creator   on public.expenses;
drop policy if exists expenses_delete_creator   on public.expenses;

create policy expenses_select_in_group on public.expenses
  for select using (public.is_group_member(group_id));

create policy expenses_insert_in_group on public.expenses
  for insert with check (
    public.is_group_member(group_id)
    and created_by = auth.uid()
  );

create policy expenses_update_creator on public.expenses
  for update
    using (created_by = auth.uid() and public.is_group_member(group_id))
    with check (created_by = auth.uid() and public.is_group_member(group_id));

create policy expenses_delete_creator on public.expenses
  for delete using (created_by = auth.uid());

-- expense_splits -------------------------------------------------------------
drop policy if exists expense_splits_select_in_group  on public.expense_splits;
drop policy if exists expense_splits_insert_in_group  on public.expense_splits;
drop policy if exists expense_splits_update_in_group  on public.expense_splits;
drop policy if exists expense_splits_delete_in_group  on public.expense_splits;

create policy expense_splits_select_in_group on public.expense_splits
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

create policy expense_splits_insert_in_group on public.expense_splits
  for insert with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

create policy expense_splits_update_in_group on public.expense_splits
  for update
    using (
      exists (
        select 1 from public.expenses e
        where e.id = expense_id and public.is_group_member(e.group_id)
      )
    )
    with check (
      exists (
        select 1 from public.expenses e
        where e.id = expense_id and public.is_group_member(e.group_id)
      )
    );

create policy expense_splits_delete_in_group on public.expense_splits
  for delete using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

-- ----------------------------------------------------------------------------
-- Join-by-invite RPC.
-- Non-members cannot SELECT a group via RLS, so the join flow must go
-- through this SECURITY DEFINER function which performs the lookup and the
-- group_members insert as the table owner.
-- ----------------------------------------------------------------------------

create or replace function public.join_group_by_invite(
  invite text,
  member_display_name text default null
)
returns public.groups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_group  public.groups;
  uid           uuid := auth.uid();
  effective_name text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into target_group from public.groups where invite_code = invite;
  if not found then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;

  effective_name := coalesce(
    nullif(trim(member_display_name), ''),
    (select email from auth.users where id = uid),
    'Member'
  );

  insert into public.group_members (group_id, user_id, display_name)
  values (target_group.id, uid, effective_name)
  on conflict (group_id, user_id) do nothing;

  return target_group;
end;
$$;

revoke all on function public.join_group_by_invite(text, text) from public;
grant execute on function public.join_group_by_invite(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Leave-group RPC.
-- Needed as SECURITY DEFINER because the last-remaining member of a group
-- may not be its creator, so the groups_delete_creator RLS policy would
-- block them from cleaning up the orphan group. This function deletes the
-- caller's membership, then drops the group iff no members remain.
-- ----------------------------------------------------------------------------

create or replace function public.leave_group(target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  remaining int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from public.group_members
  where group_id = target_group_id and user_id = uid;

  if not found then
    raise exception 'not a member of this group' using errcode = 'P0002';
  end if;

  select count(*) into remaining
  from public.group_members
  where group_id = target_group_id;

  if remaining = 0 then
    delete from public.groups where id = target_group_id;
  end if;
end;
$$;

revoke all on function public.leave_group(uuid) from public;
grant execute on function public.leave_group(uuid) to authenticated;
