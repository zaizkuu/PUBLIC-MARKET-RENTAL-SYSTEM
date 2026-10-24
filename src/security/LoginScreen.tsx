import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import type { Account } from './accounts';
import {
  hasPassword, checkPassword, withPassword, passwordRules, passwordProblem,
  afterFailedAttempt, afterSignIn, lockRemainingMs, attemptsLeft, LOCKOUT_MINUTES,
  newRecoveryCode, withRecoveryCode, checkRecoveryCode, initialsOf,
} from './accounts';
import './security.css';

/* ============================================================
   Sign-in screen
   ============================================================

   The first thing on screen when the system starts, and what comes back when
   it is locked. The person picks their account from the office's list, then
   types their password. An account that has never been used asks for a new
   password instead; an administrator who set one is given a recovery code to
   keep, which is the way back in if the password is ever forgotten.

   Nothing here touches the records. It reports what happened through the
   callbacks, and the app decides what to save and what to write in the
   logbook. */

export type SignInEvent = 'signed-in' | 'password-set' | 'recovered' | 'unlocked';

type Step = 'choose' | 'password' | 'create' | 'show-code' | 'recover';

type Props = {
  accounts: Account[];
  /* Set when the accounts could not be read: nobody is let in until they can be. */
  problem?: string;
  onRetry?: () => void;
  /* Unlock mode: the screen was locked while this account was signed in. */
  lockedAccount?: Account;
  onSwitchAccount?: () => void;
  /* Saves a changed account — failed attempts, a new password. Awaited, so a
     password is on disk before the person is let in on it. */
  onSaveAccount: (account: Account) => Promise<void>;
  onSignedIn: (account: Account, event: SignInEvent) => void;
  /* Something the logbook should hear about: a wrong password, a lockout. */
  onAudit: (details: string) => void;
};

const STATUS_TEXT: Record<string, string> = { new: 'First sign-in', locked: 'Locked', change: 'New password needed' };

function clockText(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function manilaToday() {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
}

export default function LoginScreen({ accounts, problem, onRetry, lockedAccount, onSwitchAccount, onSaveAccount, onSignedIn, onAudit }: Props) {
  const unlocking = !!lockedAccount;
  const [selectedId, setSelectedId] = useState(lockedAccount?.id ?? '');
  const [step, setStep] = useState<Step>(lockedAccount ? 'password' : 'choose');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /* An account part-way through: its password is set and saved, the recovery
     code is on screen, and it signs in once the code has been noted down. */
  const [pending, setPending] = useState<{ account: Account; code: string; event: SignInEvent } | null>(null);
  const [codeNoted, setCodeNoted] = useState(false);
  /* Set once the current password has been checked for an account that must
     choose a new one, so the create step knows it is a change, not a first. */
  const [verified, setVerified] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const firstField = useRef<HTMLInputElement | HTMLButtonElement | null>(null);

  const selected = accounts.find((a) => a.id === selectedId) ?? lockedAccount;
  const lockMs = selected ? lockRemainingMs(selected, now) : 0;

  /* Tick while an account is locked, so the countdown and the button follow. */
  const lockedNow = lockMs > 0;
  useEffect(() => {
    if (!lockedNow) return;
    const timer = window.setInterval(() => {
      const at = new Date();
      setNow(at);
      /* The wait is over: the error that started it no longer applies. */
      if (selected && lockRemainingMs(selected, at) <= 0) setError('');
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockedNow, selected]);

  useEffect(() => { firstField.current?.focus(); }, [step, selectedId]);

  const reset = (next: Step) => {
    setStep(next); setPassword(''); setConfirm(''); setCode(''); setShow(false); setError(''); setNow(new Date());
  };

  const choose = (account: Account) => {
    setSelectedId(account.id);
    setVerified(false);
    reset(hasPassword(account) ? 'password' : 'create');
  };

  const back = () => {
    if (unlocking) return;
    setSelectedId('');
    setVerified(false);
    reset('choose');
  };

  const trackCaps = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false);

  /* A wrong password or recovery code counts towards the lock either way. */
  const failed = async (account: Account, what: string) => {
    const at = new Date();
    const next = afterFailedAttempt(account, at);
    await onSaveAccount(next);
    const lockedNow = lockRemainingMs(next, at) > 0;
    onAudit(lockedNow
      ? `${account.name}'s account was locked for ${Math.round(lockRemainingMs(next, at) / 60000)} minutes after ${next.failedAttempts} wrong ${what}s in a row.`
      : `Failed sign-in for ${account.name}: wrong ${what} (${next.failedAttempts} in a row).`);
    setNow(at);
    setError(lockedNow
      ? `Too many wrong ${what}s. This account is locked for ${Math.round(lockRemainingMs(next, at) / 60000)} minutes.`
      : `That ${what} is not correct. ${attemptsLeft(next)} more ${attemptsLeft(next) === 1 ? 'try' : 'tries'} before the account locks for ${LOCKOUT_MINUTES} minutes or more.`);
  };

  const finish = async (account: Account, event: SignInEvent) => {
    const signed = afterSignIn(account, new Date());
    await onSaveAccount(signed);
    onSignedIn(signed, event);
  };

  const run = (work: () => Promise<void>) => async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await work(); } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  };

  const submitPassword = run(async () => {
    if (!selected) return;
    if (lockRemainingMs(selected, new Date()) > 0) { setError('This account is locked. Wait for the countdown to finish, then try again.'); return; }
    if (!password) { setError('Type your password.'); return; }
    if (!(await checkPassword(selected, password))) { await failed(selected, 'password'); setPassword(''); return; }
    if (selected.mustChangePassword) { setVerified(true); reset('create'); return; }
    await finish(selected, unlocking ? 'unlocked' : 'signed-in');
  });

  /* A new password: the first one, or one replacing a temporary password. */
  const submitCreate = run(async () => {
    if (!selected) return;
    const problemText = passwordProblem(password, confirm, selected.name);
    if (problemText) { setError(problemText); return; }
    let next = await withPassword(selected, password, new Date());
    if (next.role === 'Administrator' && !next.recoveryHash) {
      const fresh = newRecoveryCode();
      next = await withRecoveryCode(next, fresh);
      await onSaveAccount(next);
      setPending({ account: next, code: fresh, event: 'password-set' });
      setCodeNoted(false);
      reset('show-code');
      return;
    }
    await finish(next, 'password-set');
  });

  const submitRecover = run(async () => {
    if (!selected) return;
    if (lockRemainingMs(selected, new Date()) > 0) { setError('This account is locked. Wait for the countdown to finish, then try again.'); return; }
    if (!(await checkRecoveryCode(selected, code))) { await failed(selected, 'recovery code'); return; }
    const problemText = passwordProblem(password, confirm, selected.name);
    if (problemText) { setError(problemText); return; }
    /* A recovery code works once. The next one is shown now, in its place. */
    const fresh = newRecoveryCode();
    const next = await withRecoveryCode(await withPassword(selected, password, new Date()), fresh);
    await onSaveAccount(next);
    onAudit(`${selected.name} reset their password with the recovery code; a new recovery code was issued.`);
    setPending({ account: next, code: fresh, event: 'recovered' });
    setCodeNoted(false);
    reset('show-code');
  });

  const continueAfterCode = run(async () => {
    if (pending) await finish(pending.account, pending.event);
  });

  const statusOf = (a: Account) => (lockRemainingMs(a, now) > 0 ? 'locked' : !hasPassword(a) ? 'new' : a.mustChangePassword ? 'change' : '');
  const rules = useMemo(() => passwordRules(password, selected?.name ?? ''), [password, selected?.name]);

  const passwordInput = (id: string, label: string, value: string, set: (v: string) => void, autoComplete: string, focus = false): ReactNode => (
    <div className="login-field">
      <label htmlFor={id}>{label}</label>
      <div className="login-input">
        <span className="material-symbols-outlined" aria-hidden="true">lock</span>
        <input
          id={id}
          ref={focus ? (el) => { firstField.current = el; } : undefined}
          type={show ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          spellCheck={false}
          onChange={(e) => { set(e.target.value); setError(''); }}
          onKeyDown={trackCaps}
          onKeyUp={trackCaps}
          aria-invalid={!!error}
          aria-describedby={error ? 'login-error' : undefined}
        />
        {focus && (
          <button type="button" className="login-reveal" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
            <span className="material-symbols-outlined" aria-hidden="true">{show ? 'visibility_off' : 'visibility'}</span>
          </button>
        )}
      </div>
    </div>
  );

  const capsNote = caps && <p className="login-caps" role="status"><span className="material-symbols-outlined" aria-hidden="true">keyboard_capslock</span>Caps Lock is on</p>;
  /* While the account is locked the countdown says it all; the error that caused it would only repeat it. */
  const errorNote = error && lockMs <= 0 && <p className="login-error" id="login-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">error</span>{error}</p>;
  const lockNote = lockMs > 0 && step !== 'choose' && (
    <p className="login-locked" role="status"><span className="material-symbols-outlined" aria-hidden="true">lock_clock</span><span>Locked after too many wrong tries. Try again in <strong>{clockText(lockMs)}</strong>.</span></p>
  );

  const who = selected && (
    <div className="login-who">
      <span className={`login-avatar${selected.role === 'Administrator' ? ' admin' : ''}`} aria-hidden="true">{initialsOf(selected.name)}</span>
      <span className="login-who-text"><strong>{selected.name}</strong><span>{selected.position || selected.role}</span></span>
      {!unlocking && step !== 'show-code' && <button type="button" className="login-link" onClick={back}>Not you?</button>}
    </div>
  );

  let body: ReactNode;
  if (problem) {
    body = (
      <>
        <h2 className="login-title">Sign-in is unavailable</h2>
        <p className="login-lead">The list of accounts could not be read, so nobody can be let in until it can. Your records are not affected.</p>
        <p className="login-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">error</span>{problem}</p>
        {onRetry && <button type="button" className="btn-primary login-submit" onClick={onRetry}><span className="material-symbols-outlined" aria-hidden="true">refresh</span>Try Again</button>}
      </>
    );
  } else if (step === 'choose') {
    body = (
      <>
        <h2 className="login-title">Choose your account</h2>
        <p className="login-lead">Select your name to sign in to the market office records.</p>
        <ul className="login-accounts" aria-label="Accounts">
          {accounts.map((a, i) => {
            const status = statusOf(a);
            return (
              <li key={a.id}>
                <button type="button" className="login-account" onClick={() => choose(a)} ref={i === 0 ? (el) => { firstField.current = el; } : undefined}>
                  <span className={`login-avatar${a.role === 'Administrator' ? ' admin' : ''}`} aria-hidden="true">{initialsOf(a.name)}</span>
                  <span className="login-account-text">
                    <strong>{a.name}</strong>
                    <span>{a.position || a.role}{a.position && a.role === 'Administrator' ? ' · Administrator' : ''}</span>
                    {status && <span className={`login-tag ${status}`}>{STATUS_TEXT[status]}</span>}
                  </span>
                  <span className="material-symbols-outlined login-chevron" aria-hidden="true">chevron_right</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="login-hint">Not on the list? Ask an administrator to add your account in <strong>Settings → User Accounts</strong>.</p>
      </>
    );
  } else if (step === 'password') {
    body = (
      <form onSubmit={submitPassword} noValidate>
        <h2 className="login-title">{unlocking ? 'Screen locked' : 'Welcome back'}</h2>
        <p className="login-lead">{unlocking ? 'The system was locked to keep the records private. Enter your password to carry on where you left off.' : 'Enter your password to continue.'}</p>
        {who}
        {passwordInput('login-password', 'Password', password, setPassword, 'current-password', true)}
        {capsNote}{lockNote}{errorNote}
        <button type="submit" className="btn-primary login-submit" disabled={busy || lockMs > 0}>
          <span className="material-symbols-outlined" aria-hidden="true">{busy ? 'hourglass_top' : 'login'}</span>{busy ? 'Checking…' : unlocking ? 'Unlock' : 'Sign In'}
        </button>
        <div className="login-actions">
          {selected?.role === 'Administrator' && selected.recoveryHash
            ? <button type="button" className="login-link" onClick={() => reset('recover')}>Forgot password?</button>
            : <span className="login-hint">Forgot your password? An administrator can reset it.</span>}
          {unlocking && onSwitchAccount && <button type="button" className="login-link" onClick={onSwitchAccount}>Sign out instead</button>}
        </div>
      </form>
    );
  } else if (step === 'create') {
    const changing = verified || selected?.mustChangePassword;
    body = (
      <form onSubmit={submitCreate} noValidate>
        <h2 className="login-title">{changing ? 'Choose a new password' : 'Create your password'}</h2>
        <p className="login-lead">{changing
          ? 'Your password was set by an administrator. Choose one only you know before continuing.'
          : 'This is the first sign-in for this account. Choose a password only you know — you will use it every time the system starts.'}</p>
        {who}
        {passwordInput('login-new', 'New password', password, setPassword, 'new-password', true)}
        {passwordInput('login-confirm', 'Type it again', confirm, setConfirm, 'new-password')}
        <ul className="login-rules" aria-label="Password rules">
          {rules.map((r) => (
            <li key={r.label} className={r.met ? 'met' : ''}>
              <span className="material-symbols-outlined" aria-hidden="true">{r.met ? 'check_circle' : 'radio_button_unchecked'}</span>
              {r.label}<span className="sr-only">{r.met ? ' — done' : ' — not yet'}</span>
            </li>
          ))}
          <li className={confirm && confirm === password ? 'met' : ''}>
            <span className="material-symbols-outlined" aria-hidden="true">{confirm && confirm === password ? 'check_circle' : 'radio_button_unchecked'}</span>
            Both boxes match
          </li>
        </ul>
        {capsNote}{errorNote}
        <button type="submit" className="btn-primary login-submit" disabled={busy}>
          <span className="material-symbols-outlined" aria-hidden="true">{busy ? 'hourglass_top' : 'key'}</span>{busy ? 'Saving…' : 'Save Password and Sign In'}
        </button>
      </form>
    );
  } else if (step === 'recover') {
    body = (
      <form onSubmit={submitRecover} noValidate>
        <h2 className="login-title">Reset with your recovery code</h2>
        <p className="login-lead">Type the recovery code you were given when you set your password, then choose a new password.</p>
        {who}
        <div className="login-field">
          <label htmlFor="login-code">Recovery code</label>
          <div className="login-input">
            <span className="material-symbols-outlined" aria-hidden="true">password</span>
            <input id="login-code" ref={(el) => { firstField.current = el; }} value={code} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} onChange={(e) => { setCode(e.target.value); setError(''); }} aria-invalid={!!error} />
          </div>
        </div>
        {passwordInput('login-new', 'New password', password, setPassword, 'new-password')}
        {passwordInput('login-confirm', 'Type it again', confirm, setConfirm, 'new-password')}
        {capsNote}{lockNote}{errorNote}
        <button type="submit" className="btn-primary login-submit" disabled={busy || lockMs > 0}>
          <span className="material-symbols-outlined" aria-hidden="true">{busy ? 'hourglass_top' : 'lock_reset'}</span>{busy ? 'Checking…' : 'Reset Password'}
        </button>
        <div className="login-actions"><button type="button" className="login-link" onClick={() => reset('password')}>Back to sign in</button></div>
      </form>
    );
  } else {
    body = (
      <form onSubmit={continueAfterCode} noValidate>
        <h2 className="login-title">Keep your recovery code</h2>
        <p className="login-lead">If you ever forget your password, this code is the only way back into the administrator account. Write it down and keep it somewhere safe in the office. It is shown only once.</p>
        {who}
        <div className="login-code" aria-label="Recovery code">
          <code>{pending?.code}</code>
          <button type="button" className="btn-outline btn-outline-sm" onClick={() => { void navigator.clipboard?.writeText(pending?.code ?? ''); }}>
            <span className="material-symbols-outlined" aria-hidden="true">content_copy</span>Copy
          </button>
        </div>
        <label className="login-check">
          <input type="checkbox" checked={codeNoted} onChange={(e) => setCodeNoted(e.target.checked)} ref={(el) => { firstField.current = el as unknown as HTMLInputElement; }} />
          I have written this code down and will keep it safe.
        </label>
        {errorNote}
        <button type="submit" className="btn-primary login-submit" disabled={!codeNoted || busy}>
          <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>Continue to the System
        </button>
      </form>
    );
  }

  return (
    <div className={`login-screen${unlocking ? ' overlay' : ''}`} role={unlocking ? 'dialog' : undefined} aria-modal={unlocking || undefined} aria-label={unlocking ? 'Screen locked' : undefined}>
      <aside className="login-brand">
        <div className="login-brand-top">
          <img className="login-seal" src="./logo.jpg" alt="Municipality of Tanauan official seal" />
          <div>
            <p className="login-brand-kicker">Municipality of Tanauan, Leyte</p>
            <h1 className="login-brand-title">Tanauan Public Market</h1>
            <p className="login-brand-sub">Market Office · Rental Monitoring System</p>
          </div>
        </div>
        <ul className="login-brand-points">
          <li><span className="material-symbols-outlined" aria-hidden="true">storefront</span>Stalls, tenants, rent and utility billing in one register</li>
          <li><span className="material-symbols-outlined" aria-hidden="true">wifi_off</span>Works without internet — records stay on this computer</li>
          <li><span className="material-symbols-outlined" aria-hidden="true">verified_user</span>Every sign-in and change is written to the logbook</li>
        </ul>
        <p className="login-brand-foot">{manilaToday()}</p>
      </aside>
      <main className="login-panel">
        <div className="login-card">{body}</div>
        <p className="login-foot"><span className="material-symbols-outlined" aria-hidden="true">shield_lock</span>Authorized market office personnel only. Lock the screen or sign out before leaving this computer.</p>
      </main>
    </div>
  );
}
