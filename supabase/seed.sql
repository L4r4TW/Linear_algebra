insert into public.units (slug, title, position)
values
  ('vectors-and-spaces', 'Vectors and spaces', 1),
  ('matrix-transformations', 'Matrix transformations', 2),
  ('alternate-coordinate-systems', 'Alternate coordinate systems', 3)
on conflict (slug) do update
set
  title = excluded.title,
  position = excluded.position;

with theme_seed(unit_slug, slug, title, position) as (
  values
    ('vectors-and-spaces', 'vectors', 'Vectors', 1),
    (
      'vectors-and-spaces',
      'linear-combinations-and-spaces',
      'Linear combinations and spaces',
      2
    ),
    (
      'vectors-and-spaces',
      'linear-dependence-and-independence',
      'Linear dependence and independence',
      3
    ),
    (
      'vectors-and-spaces',
      'subspaces-and-basis',
      'Subspaces and the basis for a subspace',
      4
    ),
    (
      'vectors-and-spaces',
      'vector-dot-and-cross-products',
      'Vector dot and cross products',
      5
    ),
    (
      'vectors-and-spaces',
      'matrices-for-solving-systems-by-elimination',
      'Matrices for solving systems by elimination',
      6
    ),
    (
      'vectors-and-spaces',
      'null-space-and-column-space',
      'Null space and column space',
      7
    )
)
insert into public.themes (unit_id, slug, title, position)
select
  units.id,
  theme_seed.slug,
  theme_seed.title,
  theme_seed.position
from theme_seed
join public.units on units.slug = theme_seed.unit_slug
on conflict (slug) do update
set
  title = excluded.title,
  position = excluded.position,
  unit_id = excluded.unit_id;

-- Keep seed idempotent for MVP development.
delete from public.exercises
using public.themes
where public.exercises.theme_id = public.themes.id
  and public.themes.slug in (
    'vectors',
    'linear-combinations-and-spaces',
    'linear-dependence-and-independence',
    'subspaces-and-basis',
    'vector-dot-and-cross-products',
    'matrices-for-solving-systems-by-elimination',
    'null-space-and-column-space'
  );

with exercise_seed(theme_slug, type, prompt, solution, difficulty) as (
  values
    (
      'vectors',
      'vector_add',
      '{"question":"Compute (2,-1,5) + (4,3,-2)."}'::jsonb,
      '{"result":[6,2,3]}'::jsonb,
      1
    ),
    (
      'vectors',
      'vector_subtract',
      '{"question":"Compute (7,0,-3) - (2,5,1)."}'::jsonb,
      '{"result":[5,-5,-4]}'::jsonb,
      1
    ),
    (
      'vectors',
      'scalar_mult',
      '{"question":"Compute 3*(1,-2,4)."}'::jsonb,
      '{"result":[3,-6,12]}'::jsonb,
      1
    ),
    (
      'linear-combinations-and-spaces',
      'linear_combination',
      '{"question":"Express (5,1) as a*(1,1)+b*(1,-1)."}'::jsonb,
      '{"result":{"a":3,"b":2}}'::jsonb,
      3
    ),
    (
      'linear-combinations-and-spaces',
      'span_check',
      '{"question":"Is (2,3) in span{(1,0),(0,1)}?"}'::jsonb,
      '{"result":true}'::jsonb,
      1
    ),
    (
      'linear-combinations-and-spaces',
      'span_membership',
      '{"question":"Is (1,1,1) in span{(1,1,0),(0,0,1)}?"}'::jsonb,
      '{"result":true}'::jsonb,
      2
    ),
    (
      'linear-dependence-and-independence',
      'independence_check',
      '{"question":"Are (1,2) and (2,4) linearly independent?"}'::jsonb,
      '{"result":false}'::jsonb,
      2
    ),
    (
      'linear-dependence-and-independence',
      'independence_check',
      '{"question":"Are (1,0,0), (0,1,0), (0,0,1) linearly independent?"}'::jsonb,
      '{"result":true}'::jsonb,
      1
    ),
    (
      'linear-dependence-and-independence',
      'dependence_relation',
      '{"question":"Find c where (2,4,6) = c*(1,2,3)."}'::jsonb,
      '{"result":2}'::jsonb,
      1
    ),
    (
      'subspaces-and-basis',
      'subspace_check',
      '{"question":"Is the set {(x,y): x+y=1} a subspace of R2?"}'::jsonb,
      '{"result":false}'::jsonb,
      2
    ),
    (
      'subspaces-and-basis',
      'basis_size',
      '{"question":"How many vectors are in a basis of R3?"}'::jsonb,
      '{"result":3}'::jsonb,
      1
    ),
    (
      'subspaces-and-basis',
      'basis_check',
      '{"question":"Do (1,0) and (0,1) form a basis of R2?"}'::jsonb,
      '{"result":true}'::jsonb,
      1
    ),
    (
      'vector-dot-and-cross-products',
      'dot_product',
      '{"question":"Compute v dot w for v=(1,2,3), w=(4,-1,2)."}'::jsonb,
      '{"result":8}'::jsonb,
      2
    ),
    (
      'vector-dot-and-cross-products',
      'vector_norm',
      '{"question":"Find ||v|| for v=(3,4)."}'::jsonb,
      '{"result":5}'::jsonb,
      1
    ),
    (
      'vector-dot-and-cross-products',
      'projection',
      '{"question":"Project v=(3,4) onto u=(1,0)."}'::jsonb,
      '{"result":[3,0]}'::jsonb,
      2
    ),
    (
      'matrices-for-solving-systems-by-elimination',
      'matrix_add',
      '{"question":"Compute [[1,2],[3,4]] + [[4,3],[2,1]]."}'::jsonb,
      '{"result":[[5,5],[5,5]]}'::jsonb,
      1
    ),
    (
      'matrices-for-solving-systems-by-elimination',
      'matrix_mult',
      '{"question":"Compute [[1,2],[0,1]] * [[3,1],[2,4]]."}'::jsonb,
      '{"result":[[7,9],[2,4]]}'::jsonb,
      2
    ),
    (
      'matrices-for-solving-systems-by-elimination',
      'rref_system',
      '{"question":"Solve x+y=3, x-y=1."}'::jsonb,
      '{"result":{"x":2,"y":1}}'::jsonb,
      2
    ),
    (
      'null-space-and-column-space',
      'null_space_dim',
      '{"question":"What is dim(null(A)) if A is 3x3 full rank?"}'::jsonb,
      '{"result":0}'::jsonb,
      2
    ),
    (
      'null-space-and-column-space',
      'column_space_dim',
      '{"question":"What is dim(col(A)) if rank(A)=2?"}'::jsonb,
      '{"result":2}'::jsonb,
      2
    )
)
insert into public.exercises (theme_id, type, prompt, solution, difficulty)
select
  themes.id,
  exercise_seed.type,
  exercise_seed.prompt,
  exercise_seed.solution,
  exercise_seed.difficulty
from exercise_seed
join public.themes on themes.slug = exercise_seed.theme_slug;
