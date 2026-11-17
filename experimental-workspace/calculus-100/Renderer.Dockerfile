# Candidate build; existing renderer containers and volumes are unchanged.
# Base supplies the pinned legacy Perl/OS toolchain; that OS still needs a separate release upgrade.
FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS node
FROM linear-algebra-experimental-renderer:latest AS sources
WORKDIR /tmp/calculus-source
RUN git init -q renderer && git -C renderer remote add origin https://github.com/openwebwork/renderer.git \
 && git -C renderer -c http.version=HTTP/1.1 fetch --depth 1 origin 1134ffbbf5e656148e579f424f70bcd9f1d15936 \
 && test "$(git -C renderer rev-parse FETCH_HEAD:lib/PG)" = 4b3e564cf4e5a36807ca5a341734f8d604e8b77d \
 && mkdir /fresh && git -C renderer archive FETCH_HEAD | tar -x -C /fresh \
 && git init -q pg && git -C pg remote add origin https://github.com/openwebwork/pg.git \
 && git -C pg -c http.version=HTTP/1.1 fetch --depth 1 origin 4b3e564cf4e5a36807ca5a341734f8d604e8b77d \
 && git -C pg archive FETCH_HEAD | tar -x -C /fresh/lib/PG \
 && cd /fresh && sha256sum public/package-lock.json lib/PG/htdocs/package-lock.json > calculus-source-locks.sha256
FROM linear-algebra-experimental-renderer:latest
USER root
# This deletes only an image-build directory before copying pristine source. No live container/volume is touched.
RUN test "$(pwd)" = /usr/app && rm -rf /usr/app && mkdir /usr/app
COPY --from=node /usr/local/ /usr/local/
COPY --from=sources /fresh/ /usr/app/
WORKDIR /usr/app
RUN cp render_app.conf.dist render_app.conf && cp conf/pg_config.yml lib/PG/conf/pg_config.yml \
 && cd public && npm ci && cd ../lib/PG/htdocs && npm ci && cd /usr/app && sha256sum -c calculus-source-locks.sha256
COPY experimental-workspace/verification-pipeline/attest-renderer.sh /tmp/attest-renderer.sh
COPY experimental-workspace/calculus-100/Renderer.Dockerfile /tmp/calculus-renderer-recipe
RUN sh /tmp/attest-renderer.sh \
 && node -e 'const fs=require("fs"),crypto=require("crypto");const p="/usr/app/verification-build.json";const a=JSON.parse(fs.readFileSync(p));if(!a.pgTrackedClean||!a.rendererSourceClean)throw Error("PRISTINE_SOURCE_REQUIRED");a.candidateBuild={recipeSha256:crypto.createHash("sha256").update(fs.readFileSync("/tmp/calculus-renderer-recipe")).digest("hex"),npmInstallCommand:"ci",node:process.version,base:"legacy-pinned-Perl-OS-toolchain",releaseOsUpgradeRequired:true};fs.writeFileSync(p,JSON.stringify(a)+"\n");fs.copyFileSync(p,"/usr/app/public/verification-build.json")'
