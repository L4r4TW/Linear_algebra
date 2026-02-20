insert into public.topics (slug, title)
values
  ('vectors', 'Vectors'),
  ('matrices', 'Matrices')
on conflict (slug) do update
set title = excluded.title;

-- Keep seed idempotent for MVP development.
delete from public.exercises
where topic_id in (
  select id from public.topics where slug in ('vectors', 'matrices')
);

with vectors_topic as (
  select id from public.topics where slug = 'vectors'
),
vectors_exercises as (
  select * from (values
    ('dot_product', '{"question":"Compute v·w for v=(1,2,3), w=(4,-1,2)."}'::jsonb, '{"result":8}'::jsonb, 2),
    ('vector_norm', '{"question":"Find ||v|| for v=(3,4)."}'::jsonb, '{"result":5}'::jsonb, 1),
    ('vector_add', '{"question":"Compute (2,-1,5) + (4,3,-2)."}'::jsonb, '{"result":[6,2,3]}'::jsonb, 1),
    ('vector_subtract', '{"question":"Compute (7,0,-3) - (2,5,1)."}'::jsonb, '{"result":[5,-5,-4]}'::jsonb, 1),
    ('scalar_mult', '{"question":"Compute 3*(1,-2,4)."}'::jsonb, '{"result":[3,-6,12]}'::jsonb, 1),
    ('unit_vector', '{"question":"Find a unit vector in direction of (6,8)."}'::jsonb, '{"result":[0.6,0.8]}'::jsonb, 2),
    ('angle_between', '{"question":"Find cos(theta) between (1,0,1) and (1,1,0)."}'::jsonb, '{"result":0.5}'::jsonb, 3),
    ('projection', '{"question":"Project v=(3,4) onto u=(1,0)."}'::jsonb, '{"result":[3,0]}'::jsonb, 2),
    ('linear_combination', '{"question":"Express (5,1) as a*(1,1)+b*(1,-1)."}'::jsonb, '{"result":{"a":3,"b":2}}'::jsonb, 3),
    ('independence_check', '{"question":"Are (1,2) and (2,4) linearly independent?"}'::jsonb, '{"result":false}'::jsonb, 2)
  ) as t(type, prompt, solution, difficulty)
)
insert into public.exercises (topic_id, type, prompt, solution, difficulty)
select vectors_topic.id, vectors_exercises.type, vectors_exercises.prompt, vectors_exercises.solution, vectors_exercises.difficulty
from vectors_topic
cross join vectors_exercises;

with matrices_topic as (
  select id from public.topics where slug = 'matrices'
),
matrices_exercises as (
  select * from (values
    ('matrix_add', '{"question":"Compute [[1,2],[3,4]] + [[4,3],[2,1]]."}'::jsonb, '{"result":[[5,5],[5,5]]}'::jsonb, 1),
    ('matrix_subtract', '{"question":"Compute [[5,1],[0,2]] - [[2,3],[4,1]]."}'::jsonb, '{"result":[[3,-2],[-4,1]]}'::jsonb, 1),
    ('matrix_mult', '{"question":"Compute [[1,2],[0,1]] * [[3,1],[2,4]]."}'::jsonb, '{"result":[[7,9],[2,4]]}'::jsonb, 2),
    ('matrix_vector_mult', '{"question":"Compute [[2,0],[1,3]] * [4,-1]."}'::jsonb, '{"result":[8,1]}'::jsonb, 2),
    ('det_2x2', '{"question":"Find det([[4,7],[2,6]])."}'::jsonb, '{"result":10}'::jsonb, 2),
    ('inverse_2x2', '{"question":"Find inverse of [[1,2],[3,4]]."}'::jsonb, '{"result":[[-2,1],[1.5,-0.5]]}'::jsonb, 3),
    ('transpose', '{"question":"Find transpose of [[1,2,3],[4,5,6]]."}'::jsonb, '{"result":[[1,4],[2,5],[3,6]]}'::jsonb, 1),
    ('trace', '{"question":"Find trace of [[2,1,0],[0,3,4],[5,0,1]]."}'::jsonb, '{"result":6}'::jsonb, 2),
    ('rank_basic', '{"question":"Find rank of [[1,2],[2,4]]."}'::jsonb, '{"result":1}'::jsonb, 3),
    ('identity_check', '{"question":"Is [[1,0],[0,1]] the identity matrix?"}'::jsonb, '{"result":true}'::jsonb, 1)
  ) as t(type, prompt, solution, difficulty)
)
insert into public.exercises (topic_id, type, prompt, solution, difficulty)
select matrices_topic.id, matrices_exercises.type, matrices_exercises.prompt, matrices_exercises.solution, matrices_exercises.difficulty
from matrices_topic
cross join matrices_exercises;
