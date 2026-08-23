---
name: GitHub push permissions
description: GitHub token permissions required when pushing repository commits from the Replit environment
---

A GitHub token can authenticate successfully through the GitHub API while still being unable to push. Fine-grained tokens must explicitly grant access to the target repository and **Contents: Read and write** permission.

**Why:** GitHub responds with a 403 permission-denied error when the token is valid but lacks repository write access, which can look like a broken Git credential.

**How to apply:** When configuring a Replit GitHub push, verify both repository selection and Contents write permission on the fine-grained token before troubleshooting git transport.