# Engineering lessons

- Keep a temporary live-testing tunnel open until the owner has finished inspecting the dashboard, or the announced safety deadline expires. Backend proof alone does not establish that the human testing session is complete. Explain closure clearly and provide a secure sender-scoped RESUME path when temporary URLs change; never expose confirmation tokens in chat.
- Opening an already confirmed message draft must display its saved incident and location, not ask for confirmation again. Carry the returned incident into dashboard filters, demo visibility and map focus. Label real-only metrics clearly beside demo preview counts, and verify the complete phone-to-dashboard return path.

- After the owner updates credential availability, inspect populated variable names securely and test current services; do not repeat a stale missing-credentials assumption. Never expose values or raw provider diagnostics.
- Resolve the repository from the current Git remote, and use only Shayan3600/Drain-Dispatch for this project. Before every publication, scan tracked source and outgoing history, and exclude downloaded credential files as well as dot-env files.
- Use SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET as canonical names; retain PHOTON aliases for existing setups without changing their values.

- Product owner authorized a new repository after the original private backend could not be accessed. Follow that latest direction; do not wait for or claim preservation of source that was never inspected.

- Preserve existing backend: discover exact repository before introducing overlapping server code.
- Verify service connectivity and persisted data before claiming sponsor integration.
- Inspect only environment variable names; never print or commit secrets.
- Use the installed Spectrum package declarations as the authoritative SDK contract.
- Resolve paths from the project root consistently in both source and compiled entry points. Create parent directories before initializing PGlite; verify a fresh checkout, not only existing data.
- Windows sandbox can block Node realpath resolution within OneDrive. Verify build/dev using an approved unsandboxed command before changing application code for permission errors.
- Dependency audit fixes must preserve supported SDK APIs; do not accept an automatic major downgrade to remove a transitive advisory.
- Database NULL is not an omitted optional API field. Normalize nullable draft fields at the serialization boundary and exercise the actual browser messaging confirmation path, not only direct API confirmation.
