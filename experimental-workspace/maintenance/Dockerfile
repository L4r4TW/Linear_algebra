FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
WORKDIR /repo/experimental-workspace/maintenance
COPY experimental-workspace/maintenance/package.json experimental-workspace/maintenance/package-lock.json ./
RUN npm ci --ignore-scripts
COPY experimental-workspace/maintenance/ ./
COPY experimental-workspace/accounts/ ../accounts/
COPY experimental-workspace/discovery/ ../discovery/
COPY experimental-workspace/practice-400/ ../practice-400/
ENV QUALITY_ARTIFACTS=/artifacts
CMD ["node", "quality.mjs"]
