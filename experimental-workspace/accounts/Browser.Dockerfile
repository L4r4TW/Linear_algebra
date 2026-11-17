FROM mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579
WORKDIR /service
RUN npm install --no-save --package-lock=false playwright@1.65.1 parse5@8.1.1 pg@8.23.1
COPY experimental-workspace/accounts/ ./accounts/
COPY experimental-workspace/workspace/ ./application/
COPY experimental-workspace/discovery/ ./discovery/
COPY experimental-workspace/compatibility/ ./compatibility/
COPY experimental-workspace/calculus-100/student-oracles.mjs experimental-workspace/calculus-100/local-pilot.json ./calculus/
WORKDIR /service/accounts
CMD ["node","browser-acceptance.mjs"]
