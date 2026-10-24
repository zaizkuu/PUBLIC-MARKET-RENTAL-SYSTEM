import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firstAccounts, withPassword, checkPassword, passwordRules, passwordProblem,
  afterFailedAttempt, afterSignIn, lockRemainingMs, attemptsLeft, MAX_FAILED_ATTEMPTS,
  newRecoveryCode, withRecoveryCode, checkRecoveryCode, normalizeAccount,
  removalProblem, roleChangeProblem, nextAccountId, initialsOf, blankAccount, hasPassword,
} from '../src/security/accounts.ts';

const now = new Date('2026-10-24T08:00:00Z');
const head = { name: 'Engr. Luz M. Maderazo', position: 'Market Supervisor III' };

test('a new installation offers the head of the office board as its administrator, with no password yet', () => {
  const [admin] = firstAccounts(head, now);
  assert.equal(admin.role, 'Administrator');
  assert.equal(admin.name, head.name);
  assert.equal(hasPassword(admin), false);
});

test('passwords are stored only as a salted hash and checked against it', async () => {
  const [admin] = firstAccounts(head, now);
  const withPw = await withPassword(admin, 'Stall-2026', now);
  assert.ok(withPw.passwordHash && !withPw.passwordHash.includes('Stall-2026'));
  assert.ok(withPw.passwordIterations >= 600000);
  assert.equal(await checkPassword(withPw, 'Stall-2026'), true);
  assert.equal(await checkPassword(withPw, 'stall-2026'), false);
  assert.equal(await checkPassword(withPw, ''), false);
  // Same password, different salt, different hash.
  const again = await withPassword(admin, 'Stall-2026', now);
  assert.notEqual(again.passwordHash, withPw.passwordHash);
});

test('weak passwords are refused with the rule they break', () => {
  assert.match(passwordProblem('short1', 'short1', 'Luz Maderazo'), /8 characters/);
  assert.match(passwordProblem('onlyletters', 'onlyletters', 'Luz Maderazo'), /letter and a number/);
  assert.match(passwordProblem('maderazo2026', 'maderazo2026', 'Luz Maderazo'), /your name/);
  assert.match(passwordProblem('password123', 'password123', 'Luz Maderazo'), /common/);
  assert.match(passwordProblem('Stall-2026', 'Stall-2027', 'Luz Maderazo'), /do not match/);
  assert.equal(passwordProblem('Stall-2026', 'Stall-2026', 'Luz Maderazo'), '');
  assert.ok(passwordRules('Stall-2026', 'Luz Maderazo').every((r) => r.met));
});

test('five wrong passwords lock the account, longer each round, and a sign-in clears it', () => {
  let account = blankAccount({ id: 'ACC-002', name: 'Clerk', position: 'Clerk I', role: 'Staff' }, now);
  for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) account = afterFailedAttempt(account, now);
  assert.equal(lockRemainingMs(account, now), 0);
  assert.equal(attemptsLeft(account), 1);
  account = afterFailedAttempt(account, now);
  assert.equal(lockRemainingMs(account, now), 5 * 60_000);
  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) account = afterFailedAttempt(account, now);
  assert.equal(lockRemainingMs(account, now), 10 * 60_000);
  account = afterSignIn(account, now);
  assert.equal(account.failedAttempts, 0);
  assert.equal(lockRemainingMs(account, now), 0);
});

test('recovery codes are long, unambiguous, and checked however they are typed', async () => {
  const code = newRecoveryCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  const [admin] = firstAccounts(head, now);
  const withCode = await withRecoveryCode(admin, code);
  assert.equal(await checkRecoveryCode(withCode, code.toLowerCase().replace(/-/g, ' ')), true);
  assert.equal(await checkRecoveryCode(withCode, newRecoveryCode()), false);
});

test('there is always an administrator, and nobody can remove themselves', () => {
  const [admin] = firstAccounts(head, now);
  const clerk = blankAccount({ id: nextAccountId([admin]), name: 'Louwhie Jane Bengero', position: 'Clerk I', role: 'Staff' }, now);
  const list = [admin, clerk];
  assert.equal(clerk.id, 'ACC-002');
  assert.match(removalProblem(list, admin, clerk.id), /only administrator/);
  assert.match(removalProblem(list, clerk, clerk.id), /signed in with/);
  assert.equal(removalProblem(list, clerk, admin.id), '');
  assert.match(roleChangeProblem(list, admin, 'Staff'), /at least one administrator/);
  assert.equal(roleChangeProblem(list, clerk, 'Administrator'), '');
});

test('stored rows are repaired into accounts, and initials skip titles', () => {
  assert.equal(normalizeAccount({ name: 'no id' }), null);
  const row = normalizeAccount({ id: 'ACC-009', name: 'X', role: 'Root', mustChangePassword: 1, failedAttempts: '2' });
  assert.equal(row.role, 'Staff');
  assert.equal(row.mustChangePassword, true);
  assert.equal(row.failedAttempts, 2);
  assert.equal(initialsOf('Engr. Luz M. Maderazo'), 'LM');
  assert.equal(initialsOf('Louwhie Jane Bengero'), 'LB');
});
