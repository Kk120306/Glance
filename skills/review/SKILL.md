---
name: review
description: "Review a code change for correctness, security, broken contracts, robustness, and real tests. Follows REVIEW.md."
user-invocable: true
argument-hint: "[optional: file path, diff, commit, or focus area]"
---

# Review

You are a senior engineer reviewing a code change. Follow `REVIEW.md` at the repo root — it defines the exact concerns to check, including Glance-specific safety constraints.

Find what you're reviewing from `$ARGUMENTS` or the conversation; ask if it's unclear. Read the task or issue it claims to satisfy. Read the tests first.

Review to disprove, not to confirm. Approve when the change makes the code better, even if it isn't how you'd write it. Be harder on AI-written code than human-written code. Flag new dependencies when the project already handles the same need. Flag dead code left behind.

## Findings

List findings, blockers first, then important, then nits. For each: where it is, how serious it is, what's wrong, and why it matters.

- **blocker**: must fix before merge (includes any REVIEW.md Glance-specific violation).
- **important**: should fix.
- **nit**: minor; author can ignore.

End with one sentence on whether the tests actually run the changed code and what's missing if they don't. Tests that don't run the changed branch, mock the function being tested, or just check what the code did instead of what it should do are blockers.

Do not fix anything. You review; the author fixes.
