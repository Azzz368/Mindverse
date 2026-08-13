CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mindverse_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mindverse_users_email_unique
ON mindverse_users (lower(email));

CREATE TABLE IF NOT EXISTS mindverse_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES mindverse_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mindverse_sessions_user_expiry
ON mindverse_sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS mindverse_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES mindverse_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mindverse_workspace_members (
  workspace_id uuid NOT NULL REFERENCES mindverse_workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES mindverse_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS mindverse_workspace_members_user
ON mindverse_workspace_members (user_id, workspace_id);

CREATE TABLE IF NOT EXISTS mindverse_workflows (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES mindverse_workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES mindverse_users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  snapshot_storage_key text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS mindverse_workflows_workspace_updated
ON mindverse_workflows (workspace_id, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS mindverse_skills (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES mindverse_workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES mindverse_users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  storage_key text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS mindverse_skills_workspace_updated
ON mindverse_skills (workspace_id, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS mindverse_voice_assets (
  workspace_id uuid NOT NULL REFERENCES mindverse_workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  voice_id text NOT NULL,
  display_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (provider, voice_id)
);

CREATE INDEX IF NOT EXISTS mindverse_voice_assets_workspace_updated
ON mindverse_voice_assets (workspace_id, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS mindverse_registration_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO rag_schema_migrations (version)
VALUES ('003_auth_workspaces')
ON CONFLICT (version) DO NOTHING;
