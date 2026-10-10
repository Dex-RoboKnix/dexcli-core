---
provenance: AAC
---

# Releasing

1. Tests pass (`npm test`) and the push scan is clean.
2. Update the version in `package.json`.
3. The owner tags `vX.Y.Z`. Consumers pin a tag or a full commit, never a branch.
4. Pre-1.0: no release is promised.
