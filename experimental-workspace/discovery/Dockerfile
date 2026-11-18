FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
USER root
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /home-app
COPY experimental-workspace/discovery/ ./
COPY experimental-workspace/practice-400/collections.json experimental-workspace/practice-400/study-model.mjs /practice-400/
USER node
EXPOSE 3005
CMD ["node","server.mjs"]
