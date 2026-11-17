FROM postgres@sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca
COPY experimental-workspace/accounts/migrate.sh /migrate.sh
COPY experimental-workspace/accounts/migrations/ /migrations/
ENTRYPOINT ["/bin/bash","/migrate.sh"]
