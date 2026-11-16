import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { runHook, makeRepo } from './helpers.mjs';

const H = 'h5-bash-guard.mjs';
const repo = makeRepo({ 'README.md': 'x' }); // on branch "feature"
const bash = (command, cwd = repo) => ({ session_id: 't', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });
const decision = (cmd, cwd) => runHook(H, bash(cmd, cwd)).json?.hookSpecificOutput?.permissionDecision ?? 'none';

test('asks for pushes that target develop or main', () => {
  for (const c of [
    'git push origin develop',
    'git push -u origin main',
    'git push origin HEAD:develop',
    'git push origin feat/x:refs/heads/main',
    'git push --force origin +main',
    'git -C backend push origin develop',
    'git push origin HEAD:main 2>&1 | tail -5',
    'cd x && git push --all',
  ]) assert.equal(decision(c), 'ask', c);
});

test('allows pushes to feature branches', () => {
  for (const c of ['git push -u origin feat/hooks', 'git push origin develop-notes', 'git push', 'git push origin main-fix'])
    assert.equal(decision(c), 'none', c);
});

test('asks for a bare push, or a push of HEAD / @, while on develop', () => {
  const dev = makeRepo({ 'README.md': 'x' });
  execFileSync('git', ['-C', dev, 'checkout', '-q', '-b', 'develop']);
  for (const c of ['git push', 'git push -u origin HEAD', 'git push origin @', 'git push --force origin +HEAD'])
    assert.equal(decision(c, dev), 'ask', c);
  assert.equal(decision('git push origin HEAD:feat/x', dev), 'none');
  assert.equal(decision('git push -u origin HEAD'), 'none', 'HEAD on a feature branch');
});

test('wrapped commands are still checked', () => {
  for (const c of [
    'bash -c "terraform apply"',
    "sh -c 'git push origin develop'",
    'zsh -lc "cd x && terraform destroy"',
    'timeout 30 git push origin main',
    'timeout -s KILL 5m terraform apply',
    'echo main | xargs -n1 git push origin main',
    'nice -n 10 terraform apply',
    'env -u FOO A=1 terraform apply',
    'if git push origin main; then echo ok; fi',
    'eval "git push origin develop"',
    'git commit -m "$(echo wip)" --no-verify',
  ]) assert.equal(decision(c), 'ask', c);
});

test('quoted text, heredoc bodies and comments are data, not commands', () => {
  const heredoc = `git commit -m "$(cat <<'EOF'\ndocs: terraform apply stays manual\ngit push origin develop is blocked\nnpm install zod\nEOF\n)"`;
  for (const c of [
    heredoc,
    'git commit -m "mention --no-verify and git push origin main"',
    'echo "terraform apply"',
    "grep -n 'git push origin develop' README.md",
    'git status # then git push origin main',
    'cat <<EOF > notes.md\nterraform destroy\nEOF',
  ]) assert.equal(decision(c), 'none', c);
});

test('asks for --no-verify, terraform apply/destroy, backend repointing', () => {
  for (const c of [
    'git commit -m "wip" --no-verify',
    'terraform apply tfplan',
    'terraform -chdir=live/dev destroy',
    'terraform init -backend-config=prod.hcl',
    'terraform init -reconfigure',
  ]) assert.equal(decision(c), 'ask', c);
});

test('allows terraform plan / validate / fmt', () => {
  for (const c of ['terraform plan -out tfplan', 'terraform validate', 'terraform fmt -check -recursive terraform'])
    assert.equal(decision(c), 'none', c);
});

test('asks when a dependency is added; bare installs allowed', () => {
  for (const c of ['npm install zod', 'npm i -D vitest', 'npm --prefix backend add left-pad', 'pnpm add x', 'yarn add x', 'fvm flutter pub add dio', 'dart pub add http'])
    assert.equal(decision(c), 'ask', c);
  for (const c of ['npm install', 'npm ci', 'npm install --prefix backend', 'cd backend && npm i', 'fvm flutter pub get', 'npm run install:all'])
    assert.equal(decision(c), 'none', c);
});

test('the reason names the rule for the user', () => {
  const r = runHook(H, bash('git push origin develop'));
  assert.match(r.json.hookSpecificOutput.permissionDecisionReason, /develop.*feature branch \+ PR/);
});

test('DK_HOOKS_DISABLE=h5 turns it off', () => {
  assert.equal(runHook(H, bash('git push origin main'), { DK_HOOKS_DISABLE: 'h5' }).stdout, '');
});
