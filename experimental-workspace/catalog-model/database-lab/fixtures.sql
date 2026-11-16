\set ON_ERROR_STOP on
SET search_path=model_lab,pg_catalog;
CREATE FUNCTION gid(n bigint) RETURNS uuid LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT md5('synthetic-design-lab-'||n::text)::uuid $$;
INSERT INTO repositories VALUES(gid(1),'synthetic-opl');
INSERT INTO snapshots VALUES(gid(1),gid(1),'sha1',repeat('a',40)),(gid(2),gid(1),'sha1',repeat('b',40));
INSERT INTO exercises SELECT gid(i),'opl',timestamptz '2026-01-01 UTC' FROM generate_series(1,100000) i;
INSERT INTO aliases VALUES('synthetic','exercise-one',gid(1));
INSERT INTO source_versions SELECT gid(i),gid(i),gid(1),'OpenProblemLibrary/Synthetic/problem-'||i||'.pg',repeat('a',64) FROM generate_series(1,100000) i;
INSERT INTO source_versions VALUES(gid(100001),gid(1),gid(2),'OpenProblemLibrary/Synthetic/revised.pg',repeat('b',64));
INSERT INTO taxonomy_releases VALUES(gid(1),'draft');
INSERT INTO topics VALUES(gid(1),'subject'),(gid(2),'subject'),(gid(3),'subject'),(gid(11),'chapter'),(gid(12),'chapter'),(gid(13),'chapter'),(gid(21),'section'),(gid(22),'section'),(gid(23),'section');
INSERT INTO topic_memberships(release_id,node_id,kind,parent_id,locale,label,slug,position) VALUES
(gid(1),gid(1),'subject',NULL,'en','Linear Algebra','linear-algebra',10),(gid(1),gid(2),'subject',NULL,'en','Geometry','geometry',20),
(gid(1),gid(11),'chapter',gid(1),'en','Vectors','vectors',10),(gid(1),gid(12),'chapter',gid(2),'en','Vector geometry','vectors',10),
(gid(1),gid(21),'section',gid(11),'en','Dot products','dot-products',10),(gid(1),gid(22),'section',gid(12),'en','Dot products','dot-products',10);
INSERT INTO topic_assignments(release_id,node_id,locale,source_version_id,exercise_id,snapshot_id,is_primary) SELECT gid(1),gid(21),'en',gid(i),gid(i),gid(1),true FROM generate_series(1,100000) i;
INSERT INTO topic_assignments(release_id,node_id,locale,source_version_id,exercise_id,snapshot_id,is_primary) VALUES(gid(1),gid(22),'en',gid(1),gid(1),gid(1),false);
INSERT INTO environments VALUES(gid(1),gid(1),repeat('b',64)),(gid(2),gid(2),repeat('c',64));
INSERT INTO profiles VALUES(gid(1),'synthetic-profile',repeat('d',64));
INSERT INTO requirement_sets SELECT gid(i),gid(i),repeat('e',64) FROM generate_series(1,100000) i;
INSERT INTO assessments SELECT gid(i),gid(i),gid(1),gid(1),gid(1),gid(i),repeat('f',64),'verified' FROM generate_series(1,100000) i;
INSERT INTO assessments VALUES(gid(100001),gid(1),gid(1),gid(1),gid(1),gid(1),repeat('f',64),'failed');
INSERT INTO activation_releases VALUES(gid(1),'synthetic-local',gid(1),gid(1),'published');
INSERT INTO activation_members(release_id,exercise_id,source_version_id,source_snapshot_id,environment_id,profile_id,requirement_set_id,assessment_id) SELECT gid(1),gid(i),gid(i),gid(1),gid(1),gid(1),gid(i),gid(i) FROM generate_series(1,100000) i;
INSERT INTO deployment_heads VALUES('synthetic-local',gid(1),0,true);
INSERT INTO accounts VALUES(gid(1)),(gid(2));
INSERT INTO principals VALUES(gid(11),'anonymous',NULL,'active'),(gid(12),'anonymous',NULL,'active'),(gid(21),'account',gid(1),'active'),(gid(22),'account',gid(2),'active');
INSERT INTO account_claims(anonymous_principal_id,account_principal_id,state) VALUES(gid(11),gid(21),'active');
INSERT INTO practice_sets VALUES(gid(1),gid(21),gid(1));
INSERT INTO sessions(id,owner_id,exercise_id,binding,source_version_id,environment_id,snapshot_id,updated_at) VALUES
(gid(1),gid(21),gid(1),'pinned',gid(1),gid(1),gid(1),'2026-01-02 UTC'),(gid(2),gid(22),gid(1),'pinned',gid(1),gid(1),gid(1),'2026-01-02 UTC'),
(gid(3),gid(21),gid(1),'legacy-unbound',NULL,NULL,NULL,'2026-01-02 UTC'),(gid(4),gid(11),gid(1),'pinned',gid(1),gid(1),gid(1),'2026-01-02 UTC');
INSERT INTO sessions(id,owner_id,exercise_id,binding,source_version_id,environment_id,snapshot_id,updated_at)
SELECT gid(1000+i),CASE WHEN i%100=0 THEN gid(21) ELSE gid(22) END,gid(1),'pinned',gid(1),gid(1),gid(1),timestamptz '2026-01-01 UTC'+i*interval '1 second' FROM generate_series(1,20000) i;
INSERT INTO practice_items VALUES(gid(1),gid(21),1,gid(1),gid(1),gid(1),gid(1),gid(1)),(gid(1),gid(21),2,gid(2),gid(2),gid(1),gid(1),NULL);
INSERT INTO renderer_state VALUES(gid(1),7,NULL,NULL,0);
INSERT INTO submission_operations VALUES(gid(1),gid(1),gid(21),'synthetic-operation-one',repeat('a',64),0,'accepted'),(gid(2),gid(1),gid(21),'synthetic-operation-two',repeat('b',64),1,'accepted');
INSERT INTO attempts(id,session_id,owner_id,binding,exercise_id,source_version_id,environment_id,operation_id,ordinal,provenance,feedback_visibility,score,answers) VALUES
(gid(1),gid(1),gid(21),'pinned',gid(1),gid(1),gid(1),gid(1),1,'server-pg','shown',0.5,'[["AnSwEr0001"," first "],["AnSwEr0001","second"]]'),
(gid(2),gid(1),gid(21),'pinned',gid(1),gid(1),gid(1),gid(2),2,'server-pg','suppressed',1,'[]'),
(gid(3),gid(3),gid(21),'legacy-unbound',gid(1),NULL,NULL,NULL,1,'legacy-client','shown',1,'[]');
UPDATE sessions SET last_attempt_id=gid(2) WHERE id=gid(1);
INSERT INTO drafts VALUES(gid(1),gid(1),gid(21),'synthetic-tab-a',0,gid(2),'[]');
INSERT INTO bookmarks VALUES(gid(21),gid(1),now()),(gid(11),gid(1),now());
INSERT INTO search_documents(release_id,exercise_id,source_version_id,locale,title,title_sort,description,reviewed_terms,topic_text)
SELECT gid(1),gid(i),gid(i),'en',CASE WHEN i=1 THEN 'Dot products' ELSE 'Synthetic exercise '||lpad(i::text,6,'0') END,CASE WHEN i=1 THEN 'dot products' ELSE 'synthetic exercise '||lpad(i::text,6,'0') END,'Synthetic metadata only',CASE WHEN i=1 THEN 'scalar product vector operations calibrationneedle' WHEN i=2 THEN 'matrix addition calibrationneedle' ELSE 'practice' END,'Mathematics / Synthetic chapter / Synthetic section' FROM generate_series(1,100000) i;
CREATE FUNCTION owned_principals(account_key uuid) RETURNS TABLE(owner_id uuid) LANGUAGE sql STABLE AS $$
 SELECT p.id FROM principals p WHERE p.kind='account' AND p.account_id=account_key AND p.state='active'
 UNION
 SELECT a.id FROM principals p JOIN account_claims c ON c.account_principal_id=p.id AND c.state='active' JOIN principals a ON a.id=c.anonymous_principal_id AND a.state='active' WHERE p.kind='account' AND p.account_id=account_key AND p.state='active' $$;
CREATE FUNCTION prefix_query(value text) RETURNS tsquery LANGUAGE plpgsql IMMUTABLE STRICT AS $$ DECLARE tokens text[]; expression text; BEGIN
 IF length(value)>160 THEN RAISE EXCEPTION 'Bounded query required' USING ERRCODE='22023'; END IF;
 SELECT array_agg(t) INTO tokens FROM regexp_split_to_table(lower(normalize(value,NFKC)),'[^[:alnum:]]+') t WHERE t<>'';
 IF coalesce(cardinality(tokens),0)=0 THEN RETURN NULL; END IF;
 IF cardinality(tokens)>12 THEN RAISE EXCEPTION 'Too many query terms' USING ERRCODE='22023'; END IF;
 SELECT string_agg(quote_literal(t)||':*',' & ') INTO expression FROM unnest(tokens) t;
 RETURN to_tsquery('simple',expression); END $$;
REVOKE EXECUTE ON FUNCTION owned_principals(uuid) FROM PUBLIC;
ANALYZE;
