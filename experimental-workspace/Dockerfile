FROM node:22-bookworm-slim
WORKDIR /workspace
RUN mkdir -p /data/sessions && chown node:node /workspace /data/sessions && chmod 700 /data/sessions
COPY --chown=node:node workspace/ ./
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]
