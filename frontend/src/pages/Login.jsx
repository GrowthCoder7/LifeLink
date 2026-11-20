import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HOME_BY_ROLE, login } from '../api/client.js';
import { Field } from '../components/Field.jsx';

const DEMO_ACCOUNTS = [
  ['hospital.yelahanka@lifelink.dev', 'Hospital'],
  ['hospital.jayanagar@lifelink.dev', 'Hospital'],
  ['bank.hebbal@lifelink.dev', 'Blood bank'],
  ['bank.koramangala@lifelink.dev', 'Blood bank'],
  ['admin@lifelink.dev', 'Admin'],
  ['donor.priya@lifelink.dev', 'Donor'],
];

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(email.trim(), password);
      navigate(HOME_BY_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(err.status === 401 ? 'Incorrect email or password.' : err.message);
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="brand brand-large"><span className="brand-mark" aria-hidden="true" />LifeLink</p>
        <h1 id="login-title">Sign in</h1>
        <form onSubmit={onSubmit} noValidate>
          <Field id="email" label="Email">
            {(props) => <input {...props} type="email" autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)} required />}
          </Field>
          <Field id="password" label="Password">
            {(props) => <input {...props} type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />}
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="button button-primary button-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">New donor? <Link to="/register">Register to donate</Link></p>
      </section>

      <aside className="demo-hint" aria-labelledby="demo-title">
        <h2 id="demo-title">Demo accounts</h2>
        <p>Password for all: <code>Demo@1234</code></p>
        <ul>
          {DEMO_ACCOUNTS.map(([account, role]) => (
            <li key={account}>
              <button type="button" className="link-button"
                onClick={() => { setEmail(account); setPassword('Demo@1234'); }}>
                {account}
              </button>
              <span>{role}</span>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
