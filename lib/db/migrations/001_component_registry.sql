-- Create component registry tables

CREATE TABLE IF NOT EXISTS library_registry (
  id SERIAL PRIMARY KEY,
  organization TEXT NOT NULL UNIQUE,
  library_name TEXT NOT NULL,
  figma_file_id TEXT NOT NULL,
  manifest JSONB NOT NULL,
  enabled_axes TEXT[] NOT NULL DEFAULT ARRAY['a1', 'a2', 'a3', 'a4', 'a5'],
  custom_rules JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS component_mapping (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES library_registry(id) ON DELETE CASCADE,
  figma_component_id TEXT NOT NULL,
  figma_component_name TEXT NOT NULL,
  manifest_component_id TEXT NOT NULL,
  family TEXT NOT NULL,
  tier INTEGER NOT NULL,
  shape TEXT NOT NULL,
  axes JSONB,
  max_axes JSONB,
  variants JSONB[] DEFAULT ARRAY[]::JSONB[],
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extracted_tokens (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES library_registry(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tokens JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_history (
  id SERIAL PRIMARY KEY,
  organization TEXT NOT NULL,
  figma_file_id TEXT NOT NULL,
  total_components INTEGER NOT NULL,
  total_variants INTEGER NOT NULL,
  unmapped_components TEXT[] DEFAULT ARRAY[]::TEXT[],
  errors TEXT[] DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_registry_org ON library_registry(organization);
CREATE INDEX IF NOT EXISTS idx_component_mapping_org_id ON component_mapping(organization_id);
CREATE INDEX IF NOT EXISTS idx_component_mapping_figma_id ON component_mapping(figma_component_id);
CREATE INDEX IF NOT EXISTS idx_extracted_tokens_org_id ON extracted_tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_import_history_org ON import_history(organization);
