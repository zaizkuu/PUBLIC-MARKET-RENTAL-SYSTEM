import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Account, Role } from './accounts';
import {
  ROLES, blankAccount, checkPassword, withPassword, withRecoveryCode, newRecoveryCode, passwordProblem, passwordRules,
  nextAccountId, removalProblem, roleChangeProblem, hasPassword, lockRemainingMs, initialsOf,
} from './accounts';

/* ============================================================
   Settings → Your Account / User Accounts / Sign-in Security
   ============================================================

   Everyone can change their own password here. Administrators also add the
   office's accounts, reset a forgotten password to a temporary one (which
   its owner must replace at the next sign-in), change who is an
   administrator, and set how soon an idle screen locks itself. Every change
   is handed to `onChange` with a sentence for the logbook. */

export const IDLE_LOCK_CHOICES = [5, 10, 15, 30, 0];
export const idleLabel = (minutes: number) => (minutes > 0 ? `After ${minutes} minutes without use` : 'Never (not recommended)');

type Props = {
  accounts: Account[];
  current: Account;
  officers: Array<{ name: string; position: string }>;
  idleMinutes: number;
  onIdleMinutes: (minutes: number) => void;
  onChange: (next: Account[], audit: string, toast: string) => Promise<void>;
};

const when = (iso: string) => (iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

function Rules({ password, confirm, name }: { password: string; confirm: string; name: string }) {
  const rules = passwordRules(password, name);
  return (
    <ul className="login-rules" aria-label="Password rules">
      {[...rules, { label: 'Both boxes match', met: !!confirm && confirm === password }].map((r) => (
        <li key={r.label} className={r.met ? 'met' : ''}>
          <span className="material-symbols-outlined" aria-hidden="true">{r.met ? 'check_circle' : 'radio_button_unchecked'}</span>{r.label}
        </li>
      ))}
    </ul>
  );
}

function Field({ id, label, value, onChange, type = 'password', autoComplete = 'new-password', placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; placeholder?: string;
}) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input id={id} className="form-input" type={type} value={value} autoComplete={autoComplete} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return text ? <div className="form-error" role="alert"><span className="material-symbols-outlined">error</span>{text}</div> : null;
}

export default function AccountSettings({ accounts, current, officers, idleMinutes, onIdleMinutes, onChange }: Props) {
  const admin = current.role === 'Administrator';
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [panel, setPanel] = useState<'' | 'password' | 'code' | 'add' | `reset:${string}` | `remove:${string}`>('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [shownCode, setShownCode] = useState('');
  /* Add-account draft. `pick` is an officer's name from the board, or '' to type one in. */
  const [pick, setPick] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<Role>('Staff');

  const withoutAccount = useMemo(
    () => officers.filter((o) => o.name && !accounts.some((a) => a.name.trim().toLowerCase() === o.name.trim().toLowerCase())),
    [officers, accounts],
  );

  const open = (next: typeof panel) => {
    setPanel(panel === next ? '' : next);
    setProblem(''); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setShownCode('');
    setPick(''); setName(''); setPosition(''); setRole('Staff');
  };

  const run = (work: () => Promise<string | void>) => async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      const failed = await work();
      if (failed) setProblem(failed);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'The change could not be saved.');
    } finally { setBusy(false); }
  };

  const replace = (account: Account) => accounts.map((a) => (a.id === account.id ? account : a));

  const changeOwnPassword = run(async () => {
    if (!(await checkPassword(current, currentPw))) return 'Your current password is not correct.';
    const bad = passwordProblem(newPw, confirmPw, current.name);
    if (bad) return bad;
    if (newPw === currentPw) return 'Choose a password different from the current one.';
    await onChange(replace(await withPassword(current, newPw, new Date())), `${current.name} changed their password.`, 'Your password has been changed');
    open('');
  });

  const issueCode = run(async () => {
    if (!(await checkPassword(current, currentPw))) return 'Your current password is not correct.';
    const code = newRecoveryCode();
    await onChange(replace(await withRecoveryCode(current, code)), `${current.name} issued a new administrator recovery code; the old one no longer works.`, 'New recovery code issued');
    setCurrentPw('');
    setShownCode(code);
  });

  const addAccount = run(async () => {
    const officer = withoutAccount.find((o) => o.name === pick);
    const fullName = (officer?.name ?? name).trim();
    if (!fullName) return 'Choose a person from the office board, or type the name.';
    if (accounts.some((a) => a.name.trim().toLowerCase() === fullName.toLowerCase())) return `${fullName} already has an account.`;
    const bad = passwordProblem(newPw, confirmPw, fullName);
    if (bad) return bad;
    const fresh = blankAccount({ id: nextAccountId(accounts), name: fullName, position: (officer?.position ?? position).trim(), role }, new Date());
    const account = await withPassword(fresh, newPw, new Date(), { mustChange: true });
    await onChange([...accounts, account], `Account added for ${fullName} (${role}); a temporary password was set, to be changed at the first sign-in.`, `Account added for ${fullName}`);
    open('');
  });

  const resetPassword = (target: Account) => run(async () => {
    const bad = passwordProblem(newPw, confirmPw, target.name);
    if (bad) return bad;
    const account = await withPassword(target, newPw, new Date(), { mustChange: true });
    await onChange(replace(account), `${target.name}'s password was reset to a temporary one by ${current.name}; it must be changed at the next sign-in.`, `Temporary password set for ${target.name}`);
    open('');
  });

  const setRoleOf = (target: Account, next: Role) => run(async () => {
    const bad = roleChangeProblem(accounts, target, next);
    if (bad) return bad;
    await onChange(replace({ ...target, role: next }), `${target.name} is now ${next === 'Administrator' ? 'an administrator' : 'a staff account'} (changed by ${current.name}).`, `${target.name} is now ${next}`);
  });

  const unlock = (target: Account) => run(async () => {
    await onChange(replace({ ...target, failedAttempts: 0, lockedUntil: '' }), `${target.name}'s account was unlocked by ${current.name}.`, `${target.name} unlocked`);
  });

  const remove = (target: Account) => run(async () => {
    const bad = removalProblem(accounts, target, current.id);
    if (bad) return bad;
    await onChange(accounts.filter((a) => a.id !== target.id), `${target.name}'s account was removed by ${current.name}.`, `${target.name}'s account removed`);
    open('');
  });

  const passwordFields = (who: string) => (<>
    <div className="form-row">
      <Field id="acct-new" label={`New password${who ? ` for ${who}` : ''}`} value={newPw} onChange={setNewPw} />
      <Field id="acct-confirm" label="Type it again" value={confirmPw} onChange={setConfirmPw} />
    </div>
    <Rules password={newPw} confirm={confirmPw} name={who || current.name} />
  </>);

  return (<>
    <div className="settings-section">
      <div className="settings-section-header">Your Account</div>
      <div className="settings-section-body">
        <div className="login-who">
          <span className={`login-avatar${admin ? ' admin' : ''}`} aria-hidden="true">{initialsOf(current.name)}</span>
          <span className="login-who-text"><strong>{current.name}</strong><span>{current.position || current.role}</span></span>
          <span className={`account-role${admin ? ' admin' : ''}`}>{current.role}</span>
        </div>
        <div className="settings-item"><span className="settings-item-label">Signed in</span><span className="settings-item-value">{when(current.lastSignIn)}</span></div>
        <div className="settings-item"><span className="settings-item-label">Password last changed</span><span className="settings-item-value">{when(current.passwordChangedAt)}</span></div>
        <div className="settings-actions">
          <button type="button" className="btn-outline" aria-expanded={panel === 'password'} onClick={() => open('password')}><span className="material-symbols-outlined">key</span>Change Password</button>
          {admin && <button type="button" className="btn-outline" aria-expanded={panel === 'code'} onClick={() => open('code')}><span className="material-symbols-outlined">password</span>New Recovery Code</button>}
        </div>
        {panel === 'password' && (
          <form className="account-form" onSubmit={changeOwnPassword} noValidate>
            <h4>Change your password</h4>
            <Field id="acct-current" label="Current password" value={currentPw} onChange={setCurrentPw} autoComplete="current-password" />
            {passwordFields('')}
            <Problem text={problem} />
            <div className="settings-actions"><button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save New Password'}</button><button type="button" className="btn-outline" onClick={() => open('')}>Cancel</button></div>
          </form>
        )}
        {panel === 'code' && (
          <form className="account-form" onSubmit={issueCode} noValidate>
            <h4>Issue a new recovery code</h4>
            {shownCode ? (<>
              <p className="settings-note">Write this code down and keep it somewhere safe in the office. It is shown only this once; the previous code no longer works.</p>
              <div className="login-code"><code>{shownCode}</code></div>
              <div className="settings-actions"><button type="button" className="btn-primary" onClick={() => open('')}>I Have Written It Down</button></div>
            </>) : (<>
              <p className="settings-note">The recovery code lets you back in if you forget your password. Issuing a new one cancels the old one.</p>
              <Field id="acct-current" label="Current password" value={currentPw} onChange={setCurrentPw} autoComplete="current-password" />
              <Problem text={problem} />
              <div className="settings-actions"><button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Issue New Code'}</button><button type="button" className="btn-outline" onClick={() => open('')}>Cancel</button></div>
            </>)}
          </form>
        )}
      </div>
    </div>

    <div className="settings-section">
      <div className="settings-section-header">Sign-in Security</div>
      <div className="settings-section-body">
        <p className="settings-lead">The system opens on the sign-in page every time it starts. When nobody has used it for a while, the screen locks itself and asks for the password again — the page underneath stays as it was.</p>
        <div className="form-group">
          <label className="form-label" htmlFor="idle-lock">Lock the screen</label>
          <select id="idle-lock" className="form-select" value={idleMinutes} disabled={!admin} onChange={(e) => onIdleMinutes(Number(e.target.value))}>
            {IDLE_LOCK_CHOICES.map((m) => <option key={m} value={m}>{idleLabel(m)}</option>)}
          </select>
          {!admin && <span className="form-hint">Only an administrator can change this.</span>}
        </div>
        <p className="settings-note"><span className="material-symbols-outlined">info</span>Five wrong passwords in a row lock an account for 5 minutes, doubling each time after. Every sign-in, sign-out and lock is written to the logbook.</p>
      </div>
    </div>

    {admin && (
      <div className="settings-section full">
        <div className="settings-section-header">User Accounts</div>
        <div className="settings-section-body">
          <p className="settings-lead">Everyone who uses the system should have their own account, so the logbook shows who did what. New accounts start with a temporary password that the person replaces at their first sign-in.</p>
          <div className="table-wrap">
            <table className="mini-table">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Actions</th></tr></thead>
              <tbody>
                {accounts.map((a) => {
                  const lockedMs = lockRemainingMs(a, new Date());
                  const state = lockedMs > 0 ? ['danger', 'Locked'] : !hasPassword(a) ? ['warn', 'Password not set'] : a.mustChangePassword ? ['warn', 'Temporary password'] : ['', 'Active'];
                  const self = a.id === current.id;
                  return (
                    <tr key={a.id}>
                      <td><strong>{a.name}</strong>{self && ' (you)'}<br /><span className="account-state">{a.position || '—'}</span></td>
                      <td><span className={`account-role${a.role === 'Administrator' ? ' admin' : ''}`}>{a.role}</span></td>
                      <td><span className={`account-state ${state[0]}`}>{state[1]}</span></td>
                      <td><span className="account-state">{when(a.lastSignIn)}</span></td>
                      <td>
                        <div className="row-actions">
                          {!self && <button type="button" className="row-icon-btn" title="Set a temporary password" aria-label={`Set a temporary password for ${a.name}`} onClick={() => open(`reset:${a.id}`)}><span className="material-symbols-outlined">lock_reset</span></button>}
                          {lockedMs > 0 && <button type="button" className="row-icon-btn" title="Unlock" aria-label={`Unlock ${a.name}`} onClick={() => { void unlock(a)(); }}><span className="material-symbols-outlined">lock_open</span></button>}
                          <button type="button" className="row-icon-btn" title={a.role === 'Administrator' ? 'Make staff' : 'Make administrator'} aria-label={`${a.role === 'Administrator' ? 'Make staff' : 'Make administrator'}: ${a.name}`} onClick={() => { void setRoleOf(a, a.role === 'Administrator' ? 'Staff' : 'Administrator')(); }}>
                            <span className="material-symbols-outlined">{a.role === 'Administrator' ? 'remove_moderator' : 'add_moderator'}</span>
                          </button>
                          {!self && <button type="button" className="row-icon-btn danger" title="Remove account" aria-label={`Remove ${a.name}'s account`} onClick={() => open(`remove:${a.id}`)}><span className="material-symbols-outlined">person_remove</span></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!panel && <Problem text={problem} />}
          <div className="settings-actions">
            <button type="button" className="btn-primary" aria-expanded={panel === 'add'} onClick={() => open('add')}><span className="material-symbols-outlined">person_add</span>Add Account</button>
          </div>

          {panel === 'add' && (
            <form className="account-form" onSubmit={addAccount} noValidate>
              <h4>Add an account</h4>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="acct-person">Person</label>
                  <select id="acct-person" className="form-select" value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">Someone not on the office board…</option>
                    {withoutAccount.map((o) => <option key={o.name} value={o.name}>{o.name} — {o.position}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="acct-role">Role</label>
                  <select id="acct-role" className="form-select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              {!pick && (
                <div className="form-row">
                  <Field id="acct-name" label="Full name" type="text" autoComplete="off" value={name} onChange={setName} placeholder="As it should appear in the logbook" />
                  <Field id="acct-position" label="Position" type="text" autoComplete="off" value={position} onChange={setPosition} placeholder="e.g. Market Collector" />
                </div>
              )}
              {passwordFields(pick || name)}
              <p className="settings-note"><span className="material-symbols-outlined">info</span>Give the temporary password to the person privately. They choose their own at their first sign-in.</p>
              <Problem text={problem} />
              <div className="settings-actions"><button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add Account'}</button><button type="button" className="btn-outline" onClick={() => open('')}>Cancel</button></div>
            </form>
          )}

          {accounts.map((a) => panel === `reset:${a.id}` && (
            <form key={a.id} className="account-form" onSubmit={resetPassword(a)} noValidate>
              <h4>Temporary password for {a.name}</h4>
              <p className="settings-note">Use this when someone has forgotten their password. They will be asked to choose a new one at their next sign-in, and the account is unlocked.</p>
              {passwordFields(a.name)}
              <Problem text={problem} />
              <div className="settings-actions"><button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Set Temporary Password'}</button><button type="button" className="btn-outline" onClick={() => open('')}>Cancel</button></div>
            </form>
          ))}

          {accounts.map((a) => panel === `remove:${a.id}` && (
            <div key={a.id} className="account-form" role="alertdialog" aria-label={`Remove ${a.name}'s account?`}>
              <h4>Remove {a.name}'s account?</h4>
              <p className="settings-note">They will no longer be able to sign in. Their name stays on everything they recorded in the logbook.</p>
              <Problem text={problem} />
              <div className="settings-actions"><button type="button" className="btn-danger" disabled={busy} onClick={() => { void remove(a)(); }}>Remove Account</button><button type="button" className="btn-outline" onClick={() => open('')}>Cancel</button></div>
            </div>
          ))}
        </div>
      </div>
    )}
  </>);
}
