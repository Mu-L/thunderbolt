Stage, commit (atomic, conventional), and push all current changes.

## Steps

1. **Inspect changes** — run `git status` (never use `-uall`) and `git diff --staged` / `git diff` to understand what changed. Also run `git log --oneline -5` to match the repo's commit style.

2. **Stage files** — add all relevant changed/untracked files by name. Never use `git add -A` or `git add .`. Never stage files that contain secrets (`.env`, credentials, keys).

3. **Write a conventional commit message** — use the format `type: short description` where type is one of: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`, `ci`, `build`. Use `fix` only for bugs that existed before the current branch (i.e., bugs present on main). For fixing something you broke or introduced on the current branch, use `chore`, `refactor`, or the type that matches the original change. If the changes relate to a Linear ticket (e.g., `THU-123`), include it: `feat(THU-123): short description`. Keep the subject under 72 characters. Add a body with bullet points if the change is non-trivial. Focus on the "why", not the "what".

4. **Commit** — use a HEREDOC for the message:
   ```bash
   git commit -m "$(cat <<'EOF'
   type: subject line

   - detail if needed
   EOF
   )"
   ```

5. **Push** — push to the current branch's remote tracking branch. If no upstream is set, push with `-u origin <branch>`.

6. **Verify** — run `git status` after push to confirm clean state.

## Monitor mode

If `$ARGUMENTS` contains `monitor`, run the following **after a successful push**. A PR must already exist on the current branch.

### Wait for CI

```bash
PR_NUMBER=$(gh pr list --head "$(git branch --show-current)" --json number --jq '.[0].number')
gh pr checks "$PR_NUMBER" --watch --fail-fast
```

If CI fails (max 3 attempts):
1. Read failing logs: `gh run list --branch "$(git branch --show-current)" --limit 1 --json databaseId --jq '.[0].databaseId' | xargs -I{} gh run view {} --log-failed`
2. Fix the issue, stage, commit, and push (repeat steps 1-6 above)
3. Wait for CI again

### Wait for bot reviews

After CI passes, poll for bot review comments (max 10 minutes, every 30s):

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
for i in $(seq 1 20); do
  COMMENTS=$(gh api "repos/$REPO/pulls/$PR_NUMBER/comments" --jq '[.[] | select(.user.type == "Bot")] | length')
  if [ "$COMMENTS" -gt 0 ]; then
    break
  fi
  sleep 30
done
```

### Address review comments

Fetch all PR review comments:
```bash
gh api "repos/$REPO/pulls/$PR_NUMBER/comments" --jq '.[] | "\(.id) \(.user.login): \(.path):\(.line) \(.body)"'
```

Fix legitimate bugs and violations flagged by bots. Ignore style nits and false positives.

If fixes were made, stage/commit/push them (steps 1-6), then **restart monitor mode from "Wait for CI"**.

### Resolve fixed comment threads

After all fixes are pushed and CI passes:

```bash
PR_NODE_ID=$(gh api "repos/$REPO/pulls/$PR_NUMBER" --jq '.node_id')

THREAD_IDS=$(gh api graphql -f query='
  query($id: ID!) {
    node(id: $id) {
      ... on PullRequest {
        reviewThreads(first: 100) {
          nodes { id, isResolved }
        }
      }
    }
  }
' -f id="$PR_NODE_ID" --jq '.data.node.reviewThreads.nodes[] | select(.isResolved == false) | .id')

for THREAD_ID in $THREAD_IDS; do
  gh api graphql -f query='
    mutation($id: ID!) {
      resolveReviewThread(input: {threadId: $id}) {
        thread { id }
      }
    }
  ' -f id="$THREAD_ID"
done
```

## Rules

- One atomic commit per invocation. If changes span unrelated concerns, ask the user whether to split into multiple commits.
- Never amend existing commits.
- Never force push.
- Never skip pre-commit hooks (`--no-verify`).
- If a pre-commit hook fails, fix the issue and create a new commit (don't amend).
- If `$ARGUMENTS` contains text other than `monitor`, use it as guidance for the commit message.
