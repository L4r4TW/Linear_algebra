FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /qa
RUN npm install --no-save --package-lock=false playwright@1.65.1 parse5@8.1.1
COPY workspace/ ./application/
COPY compatibility/ ./compatibility/
CMD ["node", "compatibility/probe.mjs"]
