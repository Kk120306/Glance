---
name: task-to-pr
description: "Turn one GitHub Issue into a draft PR. Use when the user passes an issue number and expects code, tests, review, and a PR."
user-invocable: true
argument-hint: "<issue number> e.g. '#12' or 'github#12'"
---

# Task To PR

Turn one GitHub Issue into a draft PR. The issue is the audit trail: a teammate should follow the work without reading the diff.

## Workflow

1. **Resolve the issue.** Fetch it from GitHub. Capture the goal, acceptance criteria, linked context. Confirm it has `agent:ready` or equivalent. Move it to `agent:working`. Stop and report if the issue is unclear, already has an open PR, spans unrelated changes, or has `risk:high` without attended-session confirmation.

2. **Run `branch`.** Start from a clean tree on the default branch. Name the branch after the issue number and a short slug.

3. **Run `implement`** with the issue as the task. The acceptance criteria are the definition of done. All Glance safety checks must pass.

4. **Run `review`** with the `code-reviewer` subagent. Judge every finding; fix valid in-scope ones; re-verify. If no subagent capability exists, self-review and say so in the PR.

5. **Run `pr`.** The body must include the issue link and acceptance criteria status.

6. **Update the issue.** Comment with the PR link and verification evidence. Move it to `agent:complete`.

7. **Report:** issue, branch, commit, PR URL, checks run, anything blocked or unverified.

## Boundaries

- One issue, one branch, one PR.
- Pause at the opened PR. Merging and post-review follow-up are separate work.
- Open PRs only after verification has run, or state clearly what could not be verified.
- On a blocker: comment what blocked you on the issue, apply `needs:human`, release the `agent:working` claim, and exit cleanly.
