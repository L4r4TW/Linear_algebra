FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS node
FROM postgres@sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
WORKDIR /operator
COPY experimental-workspace/accounts/package.json experimental-workspace/accounts/package-lock.json ./
RUN node /usr/local/lib/node_modules/npm/bin/npm-cli.js ci --omit=dev --ignore-scripts
COPY experimental-workspace/accounts/crypto.mjs ./crypto.mjs
COPY experimental-workspace/deployment/backup.mjs ./backup.mjs
COPY experimental-workspace/deployment/restore-probe.mjs ./restore-probe.mjs
ENTRYPOINT ["node"]
CMD ["backup.mjs","create","accounts"]
