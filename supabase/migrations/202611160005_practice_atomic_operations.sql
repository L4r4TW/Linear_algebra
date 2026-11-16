-- Backend-only atomic primitives. Caller identity/guest proof and PG responses must be validated by the backend.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE FUNCTION practice_private.claim_guest(guest_key uuid,account_key uuid,consent_key uuid,proof_key uuid) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE target practice_private.principals;old_claim practice_private.account_claims; BEGIN
 PERFORM 1 FROM practice_private.principals WHERE id IN(guest_key,account_key) ORDER BY id FOR UPDATE;
 SELECT * INTO target FROM practice_private.principals WHERE id=account_key AND kind='account' AND state='active';IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM practice_private.principals WHERE id=guest_key AND kind='anonymous' AND state='active') THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO old_claim FROM practice_private.account_claims WHERE anonymous_principal_id=guest_key;
 IF FOUND THEN IF old_claim.state='active' AND old_claim.account_principal_id=account_key THEN RETURN 'already-linked';ELSE RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501';END IF;END IF;
 IF NOT EXISTS(SELECT 1 FROM practice_private.events WHERE id=consent_key AND principal_id=guest_key AND actor_account_id=target.account_id AND kind='claim-consent') OR NOT EXISTS(SELECT 1 FROM practice_private.events WHERE id=proof_key AND principal_id=guest_key AND actor_account_id=target.account_id AND kind='anonymous-proof') THEN RAISE EXCEPTION 'Verified consent and possession events required' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM practice_private.submission_operations WHERE owner_id=guest_key AND state IN('queued','in-flight','uncertain')) THEN RAISE EXCEPTION 'Reconcile operation before claim' USING ERRCODE='55000';END IF;
 INSERT INTO practice_private.account_claims(anonymous_principal_id,account_principal_id,state,consent_event_id,proof_event_id) VALUES(guest_key,account_key,'active',consent_key,proof_key);
 UPDATE practice_private.credentials SET revoked_at=now() WHERE principal_id=guest_key AND revoked_at IS NULL;
 UPDATE practice_private.principals SET ownership_generation=ownership_generation+1 WHERE id=guest_key;
 INSERT INTO practice_private.events(principal_id,actor_account_id,kind,reason_code) VALUES(guest_key,target.account_id,'claim-completed','explicit-account-link');RETURN 'linked';END $$;
CREATE FUNCTION practice_private.save_draft(owner_key uuid,session_key uuid,branch text,expected_revision bigint,checked_baseline uuid,pairs jsonb) RETURNS bigint LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE s practice_private.sessions;d practice_private.drafts;n bigint; BEGIN
 PERFORM 1 FROM practice_private.principals WHERE id=owner_key AND state='active' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM practice_private.sessions WHERE id=session_key AND owner_id=owner_key FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='42501';END IF;
 IF s.last_attempt_id IS DISTINCT FROM checked_baseline THEN RAISE EXCEPTION 'Checked baseline conflict' USING ERRCODE='40001';END IF;
 SELECT * INTO d FROM practice_private.drafts WHERE session_id=session_key AND branch_key=branch FOR UPDATE;
 IF NOT FOUND THEN IF expected_revision IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Draft revision conflict' USING ERRCODE='40001';END IF;INSERT INTO practice_private.drafts(session_id,owner_id,branch_key,revision,base_attempt_id,answers) VALUES(session_key,owner_key,branch,1,checked_baseline,pairs) RETURNING * INTO d;n:=1;
 ELSE IF d.revision IS DISTINCT FROM expected_revision THEN RAISE EXCEPTION 'Draft revision conflict' USING ERRCODE='40001';END IF;UPDATE practice_private.drafts SET revision=revision+1,base_attempt_id=checked_baseline,answers=pairs WHERE id=d.id RETURNING revision INTO n;END IF;
 INSERT INTO practice_private.draft_revisions(draft_id,revision,answers) VALUES(d.id,n,pairs);RETURN n;END $$;
CREATE FUNCTION practice_private.begin_submission(owner_key uuid,session_key uuid,request_key text,expected_generation bigint,pairs jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE s practice_private.sessions;o practice_private.submission_operations;fingerprint text; BEGIN
 IF NOT practice_private.valid_pairs(pairs) THEN RAISE EXCEPTION 'Ordered answer pairs required' USING ERRCODE='23514';END IF;
 fingerprint:=encode(sha256(convert_to(pairs::text,'UTF8')),'hex');
 PERFORM 1 FROM practice_private.principals WHERE id=owner_key AND state='active' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM catalog.deployment_heads WHERE scope='local-practice' FOR UPDATE;
 SELECT * INTO s FROM practice_private.sessions WHERE id=session_key AND owner_id=owner_key FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM practice_private.submission_operations WHERE session_id=session_key AND idempotency_key=request_key;
 IF FOUND THEN IF o.request_digest<>fingerprint THEN RAISE EXCEPTION 'Idempotency payload conflict' USING ERRCODE='40001';END IF;RETURN o.id;END IF;
 IF s.generation IS DISTINCT FROM expected_generation THEN RAISE EXCEPTION 'Session generation conflict' USING ERRCODE='40001';END IF;
 IF s.binding<>'pinned' OR NOT catalog.is_playable(s.exercise_id,s.source_version_id,'local-practice') THEN RAISE EXCEPTION 'Exercise unavailable' USING ERRCODE='55000';END IF;
 INSERT INTO practice_private.submission_operations(session_id,owner_id,idempotency_key,request_digest,base_generation,state) VALUES(session_key,owner_key,request_key,fingerprint,expected_generation,'in-flight') RETURNING id INTO o.id;RETURN o.id;END $$;
CREATE FUNCTION practice_private.finish_submission(owner_key uuid,operation_key uuid,pairs jsonb,pg_score numeric,visibility text,new_session_token bytea,new_problem_token bytea,pg_feedback jsonb DEFAULT '{"message":"","summary":""}'::jsonb,pg_fields jsonb DEFAULT '[]'::jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE o practice_private.submission_operations;s practice_private.sessions;result uuid;next_ordinal bigint;BEGIN
 IF visibility NOT IN('shown','suppressed') OR pg_score IS NULL OR pg_score<0 OR pg_score>1 OR new_session_token IS NULL OR new_problem_token IS NULL THEN RAISE EXCEPTION 'Validated PG state required' USING ERRCODE='23514';END IF;
 PERFORM 1 FROM practice_private.principals WHERE id=owner_key AND state='active' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM catalog.deployment_heads WHERE scope='local-practice' FOR UPDATE;
 SELECT * INTO o FROM practice_private.submission_operations WHERE id=operation_key AND owner_id=owner_key;IF NOT FOUND THEN RAISE EXCEPTION 'Operation unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM practice_private.sessions WHERE id=o.session_id AND owner_id=owner_key FOR UPDATE;
 SELECT * INTO o FROM practice_private.submission_operations WHERE id=operation_key FOR UPDATE;
 IF o.request_digest<>encode(sha256(convert_to(pairs::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Idempotency payload conflict' USING ERRCODE='40001';END IF;
 IF o.state='accepted' THEN SELECT id INTO result FROM practice_private.attempts WHERE operation_id=o.id;IF NOT FOUND THEN RAISE EXCEPTION 'Accepted attempt unavailable' USING ERRCODE='55000';END IF;RETURN result;END IF;
 IF o.state NOT IN('in-flight','uncertain') OR s.generation<>o.base_generation THEN RAISE EXCEPTION 'Operation generation conflict' USING ERRCODE='40001';END IF;
 SELECT coalesce(max(ordinal),0)+1 INTO next_ordinal FROM practice_private.attempts WHERE session_id=s.id;
 UPDATE practice_private.submission_operations SET state='accepted' WHERE id=o.id;
 INSERT INTO practice_private.attempts(session_id,owner_id,binding,exercise_id,source_version_id,environment_id,operation_id,ordinal,provenance,feedback_visibility,score,answers,feedback,field_feedback) VALUES(s.id,owner_key,s.binding,s.exercise_id,s.source_version_id,s.environment_id,o.id,next_ordinal,'server-pg',visibility,pg_score,pairs,pg_feedback,pg_fields) RETURNING id INTO result;
 UPDATE practice_private.renderer_state SET session_token=new_session_token,problem_token=new_problem_token,generation=generation+1 WHERE session_id=s.id AND generation=s.generation;IF NOT FOUND THEN RAISE EXCEPTION 'Renderer generation conflict' USING ERRCODE='40001';END IF;
 UPDATE practice_private.sessions SET last_attempt_id=result,generation=generation+1,updated_at=now() WHERE id=s.id;
 -- A produced result remains privately saved if publication changed; the next renderer action still checks the live gate.
 RETURN result;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catalog,practice_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA catalog,practice_private TO service_role;
-- Restore only the narrow helpers needed by the NOLOGIN API reader after the blanket revoke.
GRANT EXECUTE ON FUNCTION practice_private.owned_principals(),catalog.is_playable(uuid,uuid,text) TO practice_api_reader;
COMMIT;
