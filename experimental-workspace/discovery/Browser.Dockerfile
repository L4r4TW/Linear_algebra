FROM linear-algebra-picker-qa:latest
COPY experimental-workspace/discovery/browser.test.mjs /qa/discovery.test.mjs
CMD ["node","--test","discovery.test.mjs"]
