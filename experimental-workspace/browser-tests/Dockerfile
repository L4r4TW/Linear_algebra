FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /qa
RUN npm install --no-save --package-lock=false playwright@1.65.1
COPY browser-tests/picker.test.mjs ./picker.test.mjs
COPY browser-tests/continuity-reporter.mjs ./continuity-reporter.mjs
CMD ["node", "--test", "picker.test.mjs"]
