FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
WORKDIR /service
COPY experimental-workspace/accounts/package.json experimental-workspace/accounts/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY experimental-workspace/accounts/ ./accounts/
COPY experimental-workspace/workspace/ ./application/
COPY experimental-workspace/practice-400/collections.json ./practice-400/collections.json
WORKDIR /service/accounts
CMD ["node","auth-probe.mjs"]
