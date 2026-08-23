---
name: External news feed resilience
description: Durable constraints for aggregating the app's third-party fantasy news feeds.
---

Treat every upstream news feed as independently optional, with bounded requests and a partial successful response rather than a page-level failure.

**Why:** Reddit may return a 403 even from a server request, and the Fantasy Footballers feed can exceed the XML parser's entity-expansion limit. Either behavior should not make the Resources page unusable.

**How to apply:** Preserve independently recoverable sources and make the page visibly partial rather than failing as a whole. Treat third-party content as untrusted text.