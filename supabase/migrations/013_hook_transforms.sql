CREATE TABLE hook_transforms (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hook_id   uuid        NOT NULL REFERENCES hooks(id),
  target_platform  text        NOT NULL,
  transformed_text text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hook_transforms_lookup_idx ON hook_transforms (source_hook_id, target_platform);

ALTER TABLE hook_transforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alpha_all_access_hook_transforms"
  ON hook_transforms FOR ALL USING (true) WITH CHECK (true);
