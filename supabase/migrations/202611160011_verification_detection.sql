BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE TABLE catalog.capability_manifests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_version_id uuid NOT NULL REFERENCES catalog.source_versions ON DELETE RESTRICT,
 detector_version text NOT NULL,digest catalog.digest256 NOT NULL,manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_version_id,detector_version,digest));
CREATE TRIGGER capability_manifest_immutable BEFORE UPDATE OR DELETE ON catalog.capability_manifests FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
ALTER TABLE catalog.capability_manifests ENABLE ROW LEVEL SECURITY;ALTER TABLE catalog.capability_manifests FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY backend_only ON catalog.capability_manifests TO service_role,%I USING(true) WITH CHECK(true)',current_user);END $$;
REVOKE ALL ON catalog.capability_manifests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON catalog.capability_manifests TO service_role;
COMMIT;
