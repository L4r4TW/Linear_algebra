FROM linear-algebra-compatibility-qa:latest
USER root
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client git && rm -rf /var/lib/apt/lists/*
WORKDIR /qa
COPY experimental-workspace/workspace/ ./application/
COPY experimental-workspace/compatibility/ ./compatibility/
COPY experimental-workspace/opl-importer/ ./importer/
COPY experimental-workspace/verification-pipeline/ ./pipeline/
COPY supabase/migrations/ /migrations/
COPY experimental-workspace/migration-tests/platform.sql /test-platform.sql
ENTRYPOINT ["node","pipeline/cli.mjs"]
RUN ln -s /qa/importer /importer
