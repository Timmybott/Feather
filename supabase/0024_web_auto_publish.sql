-- Feather cloud — Web Deployments: auto re-publish on deploy (M65).
--
-- Run this ONCE in the Supabase SQL editor AFTER 0001–0023
-- (Dashboard → SQL Editor → New query → paste → Run). Idempotent.
--
-- When on, Feather re-publishes the project's web deployment automatically after
-- each successful deploy (off by default, so publishing stays manual unless the
-- team opts in).

alter table public.projects
  add column if not exists web_auto_publish boolean not null default false;
