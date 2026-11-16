set -eu
mkdir /tmp/verification-renderer-git /tmp/verification-pg-git
git -C /tmp/verification-renderer-git init -q
git -C /tmp/verification-renderer-git remote add origin https://github.com/openwebwork/renderer.git
git -C /tmp/verification-renderer-git -c http.version=HTTP/1.1 fetch -q --depth 1 origin 1134ffbbf5e656148e579f424f70bcd9f1d15936
pg_revision=$(git -C /tmp/verification-renderer-git rev-parse FETCH_HEAD:lib/PG)
git -C /tmp/verification-pg-git init -q
git -C /tmp/verification-pg-git remote add origin https://github.com/openwebwork/pg.git
git -C /tmp/verification-pg-git -c http.version=HTTP/1.1 fetch -q --depth 1 origin "$pg_revision"
git -C /tmp/verification-pg-git read-tree FETCH_HEAD
clean=false
if git --git-dir=/tmp/verification-pg-git/.git --work-tree=/usr/app/lib/PG diff --quiet FETCH_HEAD; then clean=true; fi
installed=$(cd /usr/app/lib/PG && find . -type f -not -path './.git/*' -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d ' ' -f 1)
printf '{"rendererRevision":"1134ffbbf5e656148e579f424f70bcd9f1d15936","pgRevision":"%s","pgTrackedClean":%s,"installedPgDigest":"%s"}\n' "$pg_revision" "$clean" "$installed" > /usr/app/verification-build.json
rm -rf /tmp/verification-renderer-git /tmp/verification-pg-git
