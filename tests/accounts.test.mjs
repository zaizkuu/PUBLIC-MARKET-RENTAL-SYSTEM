import test from 'node:test';
import assert from 'node:assert/strict';
import {
  officeAccounts, withPassword, checkPassword, passwordRules, passwordProblem,
  afterFailedAttempt, afterSignIn, lockRemainingMs, attemptsLeft, MAX_FAILED_ATTEMPTS,
  newRecoveryCode, withRecoveryCode, checkRecoveryCode, normalizeAccount,
  initialsOf, blankAccount, hasPassword,
} from '../src/security/accounts.ts';

const now = new Date('2026-10-24T08:00:00Z');
test('there are exactly three accounts: the office head as administrator and the two officers under her', () => {
  const accounts = officeAccounts([], now);
  assert.deepEqual(accounts.map((a) => [a.name, a.role]), [
    ['Engr. Luz M. Maderazo', 'Administrator'],
    ['Manuel G. Mercado', 'Staff'],
    ['Felmar Pica', 'Staff'],
  ]);
  assert.ok(accounts.every((a) => !hasPassword(a)), 'each chooses a password at first sign-in');
});

test('a password already chosen is kept, and accounts from an earlier version are dropped', async () => {
  const [admin] = officeAccounts([], now);
  const withPw = await withPassword(admin, 'Stall-2026', now);
  const extra = blankAccount({ id: 'ACC-009', name: 'Someone Added Before', position: '', role: 'Administrator' }, now);
  const accounts = officeAccounts([{ ...withPw, role: 'Staff', name: 'Renamed' }, extra], now);
  assert.equal(accounts.length, 3);
  assert.equal(await checkPassword(accounts[0], 'Stall-2026'), true);
  assert.equal(accounts[0].role, 'Administrator', 'the role always comes from the fixed list');
  assert.equal(accounts[0].name, 'Engr. Luz M. Maderazo');
  assert.ok(!accounts.some((a) => a.id === 'ACC-009'));
});

test('passwords are stored only as a salted hash and checked against it', async () => {
  const [admin] = officeAccounts([], now);
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
  const [admin] = officeAccounts([], now);
  const withCode = await withRecoveryCode(admin, code);
  assert.equal(await checkRecoveryCode(withCode, code.toLowerCase().replace(/-/g, ' ')), true);
  assert.equal(await checkRecoveryCode(withCode, newRecoveryCode()), false);
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
