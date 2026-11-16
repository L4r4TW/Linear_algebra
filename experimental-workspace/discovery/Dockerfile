FROM node:22-bookworm-slim
USER root
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /home-app
COPY experimental-workspace/discovery/ ./
USER node
EXPOSE 3005
CMD ["node","server.mjs"]
