FROM linear-algebra-experimental-renderer:latest
USER root
COPY experimental-workspace/verification-pipeline/attest-renderer.sh /tmp/attest-renderer.sh
RUN sh /tmp/attest-renderer.sh
