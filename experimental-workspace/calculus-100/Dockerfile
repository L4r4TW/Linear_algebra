FROM linear-algebra-verification:latest
WORKDIR /qa
COPY experimental-workspace/workspace/ ./application/
COPY experimental-workspace/compatibility/ ./compatibility/
COPY experimental-workspace/opl-importer/ ./importer/
COPY experimental-workspace/verification-pipeline/ ./pipeline/
COPY experimental-workspace/compatibility/catalog.json ./pipeline/reference-fixtures.json
COPY experimental-workspace/calculus-100/ ./calculus/
ENTRYPOINT ["node"]
CMD ["calculus/audit.mjs"]
