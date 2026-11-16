set -eu
mkdir /tmp/verification-renderer-git /tmp/verification-pg-git
git -C /tmp/verification-renderer-git init -q
git -C /tmp/verification-renderer-git remote add origin https://github.com/openwebwork/renderer.git
git -C /tmp/verification-renderer-git -c http.version=HTTP/1.1 fetch -q --depth 1 origin 1134ffbbf5e656148e579f424f70bcd9f1d15936
git -C /tmp/verification-renderer-git read-tree FETCH_HEAD
pg_revision=$(git -C /tmp/verification-renderer-git rev-parse FETCH_HEAD:lib/PG)
recipe=$(git -C /tmp/verification-renderer-git show FETCH_HEAD:Dockerfile | sha256sum | cut -d ' ' -f 1)
recipe_matches=false
if [ "$recipe" = "$(sha256sum /usr/app/Dockerfile | cut -d ' ' -f 1)" ]; then recipe_matches=true; fi
npm_recipe=false
if git -C /tmp/verification-renderer-git show FETCH_HEAD:Dockerfile | grep -Eq 'npm (install|ci)'; then npm_recipe=true; fi
renderer_clean=false
if git -c core.filemode=false --git-dir=/tmp/verification-renderer-git/.git --work-tree=/usr/app diff --ignore-submodules=all --quiet FETCH_HEAD -- . ':(exclude)public/package-lock.json'; then renderer_clean=true; fi
git -C /tmp/verification-pg-git init -q
git -C /tmp/verification-pg-git remote add origin https://github.com/openwebwork/pg.git
git -C /tmp/verification-pg-git -c http.version=HTTP/1.1 fetch -q --depth 1 origin "$pg_revision"
git -C /tmp/verification-pg-git read-tree FETCH_HEAD
clean=false
if git -c core.filemode=false --git-dir=/tmp/verification-pg-git/.git --work-tree=/usr/app/lib/PG diff --quiet FETCH_HEAD; then clean=true; fi
runtime_clean=false
if git -c core.filemode=false --git-dir=/tmp/verification-pg-git/.git --work-tree=/usr/app/lib/PG diff --quiet FETCH_HEAD -- . ':(exclude)htdocs/package-lock.json'; then runtime_clean=true; fi
installed=$(cd /usr/app/lib/PG && find . -type f -not -path './.git/*' -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d ' ' -f 1)
packages=$(dpkg-query -W | sha256sum | cut -d ' ' -f 1)
printf '{"rendererRevision":"1134ffbbf5e656148e579f424f70bcd9f1d15936","pgRevision":"%s","pgTrackedClean":%s,"runtimeSourceClean":%s,"rendererSourceClean":%s,"recipeMatches":%s,"npmInstallRecipe":%s,"buildExceptions":["lib/PG/htdocs/package-lock.json","public/package-lock.json"],"installedPgDigest":"%s","packageDigest":"%s"}\n' "$pg_revision" "$clean" "$runtime_clean" "$renderer_clean" "$recipe_matches" "$npm_recipe" "$installed" "$packages" > /usr/app/verification-build.json
cp /usr/app/verification-build.json /usr/app/public/verification-build.json
rm -rf /tmp/verification-renderer-git /tmp/verification-pg-git
