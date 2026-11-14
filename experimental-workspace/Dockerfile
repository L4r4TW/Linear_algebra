FROM node:22-bookworm-slim
WORKDIR /workspace
RUN mkdir -p /data/sessions && chown node:node /workspace /data/sessions && chmod 700 /data/sessions
USER node
COPY --chown=node:node workspace/package.json workspace/package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node workspace/ ./
EXPOSE 3000
CMD ["npm", "run", "dev"]
