FROM postgres@sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca
COPY experimental-workspace/accounts/init-db.sh /docker-entrypoint-initdb.d/10-accounts.sh
