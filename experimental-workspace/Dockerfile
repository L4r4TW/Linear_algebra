FROM node:22-bookworm-slim
WORKDIR /workspace
RUN chown node:node /workspace
COPY --chown=node:node workspace/ ./
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]
