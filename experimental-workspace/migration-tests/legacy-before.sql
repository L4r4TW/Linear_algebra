-- Simulate the hosted platform's legacy browser table grants (not supplied by plain PostgreSQL).
GRANT SELECT,INSERT,UPDATE ON public.profiles TO authenticated;
INSERT INTO auth.users VALUES('11111111-1111-4111-8111-111111111111','synthetic-a@example.invalid');
INSERT INTO public.profiles(id,username,role) VALUES('11111111-1111-4111-8111-111111111111','synthetic-student','student');
INSERT INTO public.attempts(user_id,exercise_id,is_correct,answer) SELECT '11111111-1111-4111-8111-111111111111',id,true,'{"raw":"synthetic-only"}' FROM public.exercises LIMIT 1;
DO $$ DECLARE t text;fingerprint text;BEGIN FOREACH t IN ARRAY ARRAY['profiles','units','themes','subthemes','exercises','attempts'] LOOP EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,''[]'')) FROM public.%I x',t) INTO fingerprint;INSERT INTO migration_test.legacy_fingerprints VALUES(t,fingerprint);END LOOP;END $$;
