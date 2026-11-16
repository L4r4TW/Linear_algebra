FROM linear-algebra-picker-qa:latest
COPY experimental-workspace/discovery/browser.test.mjs /qa/discovery.test.mjs
COPY experimental-workspace/discovery/chooser.browser.mjs /qa/chooser.browser.mjs
CMD ["node","--test","--test-concurrency=1","discovery.test.mjs","chooser.browser.mjs"]
