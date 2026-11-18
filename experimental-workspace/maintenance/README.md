# Source quality tools

See [../../CONTRIBUTING.md](../../CONTRIBUTING.md) for architecture, scope and commands. `check.ps1` checks maintained sources; `-Write` formats them in an isolated Docker container and copies only allowlisted source files back. No PG runtime, data, evidence or secrets are modified.

ESLint checks correctness hazards, undefined names and unused bindings. Prettier owns formatting. Versions are exact and lockfile-backed; production services do not install these development dependencies. `quality.mjs` explicitly enumerates the scope, so generated report directories never become accidental formatting targets. The CI quality job runs the same image without network access or mounted data.

Keep the Docker source list and quality scope consistent when adding a new application module. Extend the scope deliberately, with the appropriate compatibility evidence for protected runtime changes. Do not disable lint rules to hide an application error; document unusual browser-vs-Node execution contexts narrowly in the config.
