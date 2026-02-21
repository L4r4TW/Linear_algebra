#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

required_files=(
  "$ROOT_DIR/supabase/migrations/20260221_admin_exercise_panel.sql"
  "$ROOT_DIR/supabase/migrations/20260221_admin_structure_rls.sql"
  "$ROOT_DIR/src/app/admin/exercises/page.tsx"
  "$ROOT_DIR/src/app/admin/exercises/actions.ts"
  "$ROOT_DIR/src/components/admin/exercise-editor.tsx"
  "$ROOT_DIR/src/app/admin/structure/page.tsx"
  "$ROOT_DIR/src/app/admin/structure/actions.ts"
  "$ROOT_DIR/src/components/admin/structure-manager.tsx"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file"
    exit 1
  fi
done

cd "$ROOT_DIR"
npm run lint

echo "Admin smoke test passed"
