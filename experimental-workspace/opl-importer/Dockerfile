FROM postgres@sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca
COPY --from=linear-algebra-experimental-workspace:latest /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends git libatomic1 libstdc++6 && rm -rf /var/lib/apt/lists/*
WORKDIR /importer
COPY experimental-workspace/opl-importer/ ./
COPY supabase/migrations/ /migrations/
ENTRYPOINT ["node", "cli.mjs"]
COPY experimental-workspace/migration-tests/platform.sql /test-platform.sql
