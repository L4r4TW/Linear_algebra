-- Parameterized query contracts for model_lab only; not callable public APIs.
\set ON_ERROR_STOP on
SET search_path=model_lab,pg_catalog;
PREPARE catalog_browse(uuid,text,text,uuid,integer) AS
 SELECT exercise_id,title,description FROM published_catalog WHERE release_id=$1 AND locale=$2 AND(title_sort,exercise_id)>($3,$4)
 ORDER BY title_sort,exercise_id LIMIT least(greatest($5,1),100);
PREPARE catalog_search(uuid,text,text,real,uuid,integer) AS
 WITH hits AS(SELECT exercise_id,title,ts_rank_cd(ARRAY[0.1,0.3,0.4,0.5]::real[],document,prefix_query($3)) AS rank FROM published_catalog WHERE release_id=$1 AND locale=$2 AND document @@ prefix_query($3))
 SELECT exercise_id,title,rank FROM hits WHERE $4 IS NULL OR rank<$4 OR(rank=$4 AND exercise_id>$5)
 ORDER BY rank DESC,exercise_id LIMIT least(greatest($6,1),100);
PREPARE topic_exercises(uuid,uuid,text,uuid[],text,uuid,integer) AS
 SELECT d.exercise_id,d.title FROM published_catalog d WHERE d.release_id=$2 AND d.locale=$3 AND(d.title_sort,d.exercise_id)>($5,$6)
 AND EXISTS(SELECT 1 FROM topic_assignments a WHERE a.release_id=$1 AND a.node_id=ANY($4) AND a.locale=$3 AND a.exercise_id=d.exercise_id AND a.source_version_id=(SELECT m.source_version_id FROM activation_members m WHERE m.release_id=d.release_id AND m.exercise_id=d.exercise_id))
 ORDER BY d.title_sort,d.exercise_id LIMIT least(greatest($7,1),100);
PREPARE recent_sessions(uuid,timestamptz,uuid,integer) AS
 SELECT id,exercise_id,binding,updated_at FROM sessions WHERE owner_id IN(SELECT owner_id FROM owned_principals($1)) AND($2 IS NULL OR(updated_at,id)<($2,$3))
 ORDER BY updated_at DESC,id DESC LIMIT least(greatest($4,1),100);
PREPARE session_history(uuid,uuid,bigint,integer) AS
 SELECT a.id,a.ordinal,a.provenance,a.binding,a.feedback_visibility,CASE WHEN a.feedback_visibility='shown' THEN a.score ELSE NULL END AS visible_score,a.answers
 FROM attempts a JOIN sessions s ON s.id=a.session_id AND s.owner_id=a.owner_id
 WHERE a.session_id=$2 AND s.owner_id IN(SELECT owner_id FROM owned_principals($1)) AND($3 IS NULL OR a.ordinal<$3)
 ORDER BY a.ordinal DESC LIMIT least(greatest($4,1),100);
PREPARE current_progress(uuid,uuid) AS
 SELECT count(*) FILTER(WHERE a.feedback_visibility='shown') AS visible_attempts,count(*) FILTER(WHERE a.feedback_visibility='suppressed') AS withheld_attempts,
 count(DISTINCT(a.exercise_id,a.source_version_id)) FILTER(WHERE a.feedback_visibility='shown' AND a.score=1) AS fully_correct_versions
 FROM attempts a JOIN activation_members m ON m.exercise_id=a.exercise_id AND m.source_version_id=a.source_version_id AND m.release_id=$2
 JOIN deployment_heads h ON h.release_id=m.release_id AND h.active JOIN activation_releases r ON r.id=h.release_id AND r.scope=h.scope AND r.state='published'
 WHERE a.owner_id IN(SELECT owner_id FROM owned_principals($1)) AND a.provenance='server-pg' AND a.binding='pinned';
-- Execute each prepared shape with synthetic parameters; stdout is discarded by the runner.
EXECUTE catalog_browse(gid(1),'en','','00000000-0000-0000-0000-000000000000',20);
EXECUTE catalog_search(gid(1),'en','scalar pro',NULL,NULL,20);
EXECUTE topic_exercises(gid(1),gid(1),'en',ARRAY[gid(21),gid(22)],'','00000000-0000-0000-0000-000000000000',20);
EXECUTE recent_sessions(gid(1),NULL,NULL,20);
EXECUTE session_history(gid(1),gid(1),NULL,20);
EXECUTE current_progress(gid(1),gid(1));
SELECT expect_true('Six parameterized query contracts parse and execute',true);
