// GitHub-style search across teams, users and projects. Reads are public
// (supabase/0019), so this works without an account.

import { supabase } from "../../src/lib/supabase";
import type { CloudProject, Team, UserProfile } from "../../src/lib/cloud";

const TEAM_COLUMNS = "id, name, owner_id, location, website, logo_url, description, created_at";
const PROJECT_COLUMNS =
  "id, team_id, name, description, logo_url, panel_id, server_identifier, target_dir, build_command, post_deploy, auto_backup, created_by, created_at";
const PROFILE_COLUMNS =
  "id, username, display_name, location, website, avatar_url, bio, created_at";

export async function searchTeams(q: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from("teams")
    .select(TEAM_COLUMNS)
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as Team[];
}

export async function searchProjects(q: string): Promise<CloudProject[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as CloudProject[];
}

export async function searchUsers(q: string): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as UserProfile[];
}
