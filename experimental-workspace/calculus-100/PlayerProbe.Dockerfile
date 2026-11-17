FROM linear-algebra-account-tools:latest
COPY experimental-workspace/calculus-100/player-probe.mjs /service/accounts/player-probe.mjs
CMD ["node","player-probe.mjs"]
