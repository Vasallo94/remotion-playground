# 0023. Pi research uses capped public-web tools and cited structured output

## Status

Accepted

## Context

The Pi copywriter must not invent factual material. The legacy Python researcher used DuckDuckGo Instant Answers and unrestricted direct URL fetches, mixed topic-specific product rules into its role prompt, and returned loosely structured text. Porting that behavior directly would preserve weak provenance and introduce server-side request forgery risk in the long-running TypeScript runtime.

Research is also not universally required: a fictional story or a request whose complete content is supplied by the user should not incur external calls merely because the pipeline has a researcher step.

## Decision Drivers

- Keep the researcher topic-neutral and conditional on a need for external evidence.
- Ground every factual claim in explicit source URLs.
- Keep network access behind narrow tools rather than giving the child general shell or filesystem access.
- Prevent localhost/private-network access and validate redirects.
- Bound latency, response size, tool-call count, and model-visible output.
- Produce an artifact the copywriter can consume deterministically.
- Avoid introducing a credentialed search provider for the first slice.

## Considered Options

### Option 1 — Let the model answer from prior knowledge

- Pros: no network implementation.
- Cons: no freshness, no provenance, and unacceptable hallucination risk.

### Option 2 — Port unrestricted `web_search` and `web_fetch`

- Pros: minimal migration work.
- Cons: weak citations, unbounded HTML, and SSRF/private-network exposure.

### Option 3 — Capped DuckDuckGo Instant Answers plus guarded direct fetch

- Pros: credential-free, deterministic enough for a first slice, explicit sources, and a narrow security boundary.
- Cons: search recall is limited and many topics require known URLs or later provider upgrades.

### Option 4 — Add a credentialed search API immediately

- Pros: stronger search quality and richer results.
- Cons: new secret management, cost, provider coupling, and operational setup before validating the specialist contract.

## Decision

Choose Option 3 for the first Pi researcher.

The isolated researcher receives only:

- `web_search`: capped DuckDuckGo Instant Answers results with URLs;
- `web_fetch`: public HTTPS text fetch with DNS/IP/redirect validation;
- `submit_research`: terminating structured output.

Both network tools share a per-run call budget. Fetching rejects credentials in URLs, non-HTTPS schemes, nonstandard ports, localhost-style names, private/loopback/link-local/multicast IPs, and redirects to unsafe targets. DNS is checked before each request. Responses, redirects, time, and model-visible text are capped.

The structured artifact contains summary, key concepts, examples, unknowns, deduplicated source URLs, and claims with nonempty citations plus confidence. The parent persists the artifact and feeds source-labelled evidence to the copywriter.

Research remains conditional. The coordinator skips the research step for fiction or fully supplied material and records that decision in the pipeline plan.

## Consequences

- Factual scripts gain explicit provenance and missing knowledge becomes visible.
- The researcher cannot inspect local files or internal services.
- DuckDuckGo Instant Answers may return sparse results; callers should provide known official URLs when available.
- A later search-provider upgrade can replace `web_search` without changing the research artifact contract.
- DNS preflight materially reduces SSRF risk but cannot provide the same network isolation as a dedicated egress proxy; production deployment should still enforce network policy outside the process.
