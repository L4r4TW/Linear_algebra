FROM linear-algebra-calculus-tools:latest
COPY experimental-workspace/practice-400/ /qa/collections/
ENTRYPOINT ["node"]
CMD ["--test","/qa/collections/contract.test.mjs"]
