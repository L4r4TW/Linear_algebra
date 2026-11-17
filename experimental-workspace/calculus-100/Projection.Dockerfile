FROM linear-algebra-calculus-tools:latest
COPY supabase/migrations/ /migrations/
COPY experimental-workspace/calculus-100/projection-check.mjs /qa/calculus/projection-check.mjs
