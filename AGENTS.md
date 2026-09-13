# Agent instructions for the agentenv repo

Instructions for AI coding agents contributing to this repository (the
`agentenv` project itself — not the instructions `agentenv` generates for
other repos; those live in `templates/`).

## GitHub Actions

Always pin actions to a full commit SHA, never to a floating tag (`@v4`,
`@main`, etc.) — a tag can be moved to point at different, unreviewed code
after the fact; a SHA cannot. Add the human-readable version as a trailing
comment so the pin stays maintainable:

```yaml
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
```

When adding or updating a workflow step, resolve the SHA yourself (e.g.
`git ls-remote --tags <action-repo-url>`) — never guess or invent one.

Dependabot (`.github/dependabot.yml`) keeps the `github-actions` ecosystem
current — it opens PRs that bump the pinned SHA and its version comment
together, so the SHA-pinning rule above and Dependabot are meant to work
together, not in tension. Once the CLI tech stack is decided
(`docs/decisions/0001-cli-tech-stack.md`) and its module manifest exists,
add that ecosystem (e.g. `gomod`) to `dependabot.yml` too.
