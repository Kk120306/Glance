---
name: pr
description: "Commit, push, and open a pull request with a clear description."
user-invocable: true
argument-hint: "[optional: PR title, base branch, or draft|ready]"
---

# PR

Take finished work on the current branch to an open pull request.

## Workflow

1. Run `commit` for any uncommitted intended changes.
2. Push the branch.
3. Open a draft PR with `gh`. Write the title like a commit subject.
4. Write the body from the diff and the work actually done: what changed and why, the issue link, tests and checks run with results, review findings fixed, anything not verified. A reviewer should judge the change without reading the conversation.
5. Report the PR URL.

## Rules

- One PR per branch. If one is already open, push and update its description instead.
- Preserve human edits to the body; update only what new commits change.
- Follow the repo's PR template when one exists.
- Do not claim verification that did not run.
- If push or PR creation fails, keep work local and report the exact failure.
