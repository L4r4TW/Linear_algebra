FROM linear-algebra-account-browser-qa:latest
COPY experimental-workspace/calculus-100/ /service/calculus/
COPY experimental-workspace/verification-pipeline/contract.mjs /service/calculus/pipeline-contract.mjs
WORKDIR /service/calculus
CMD ["node","preactivation.mjs"]
