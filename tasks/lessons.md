# Engineering lessons

- Product owner authorized a new repository after the original private backend could not be accessed. Follow that latest direction; do not wait for or claim preservation of source that was never inspected.

- Preserve existing backend: discover exact repository before introducing overlapping server code.
- Verify service connectivity and persisted data before claiming sponsor integration.
- Inspect only environment variable names; never print or commit secrets.
- Use the installed Spectrum package declarations as the authoritative SDK contract.
- Resolve paths from the project root consistently in both source and compiled entry points. Create parent directories before initializing PGlite; verify a fresh checkout, not only existing data.
- Windows sandbox can block Node realpath resolution within OneDrive. Verify build/dev using an approved unsandboxed command before changing application code for permission errors.
- Dependency audit fixes must preserve supported SDK APIs; do not accept an automatic major downgrade to remove a transitive advisory.
- Database NULL is not an omitted optional API field. Normalize nullable draft fields at the serialization boundary and exercise the actual browser messaging confirmation path, not only direct API confirmation.
