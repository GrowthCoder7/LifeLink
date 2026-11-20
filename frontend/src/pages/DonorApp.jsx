import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getSession, login } from '../api/client.js';
import { Field, Select } from '../components/Field.jsx';
import { Layout } from '../components/Layout.jsx';
import { usePolling } from '../components/usePolling.js';
import { BLOOD_GROUPS, formatDate, timeAgo } from '../components/format.js';

const EMPTY_FORM = {
  full_name: '', email: '', password: '', phone: '', blood_group: 'O+', date_of_birth: '',
  last_donation_date: '', organ_pledge: false, city: 'Bengaluru', lat: '', lng: '',
};

// Drop empty optional fields and turn coordinates into numbers before sending.
function toPayload(form) {
  const payload = { ...form };
  for (const key of ['last_donation_date', 'city', 'lat', 'lng']) {
    if (payload[key] === '') delete payload[key];
  }
  if (payload.lat !== undefined) payload.lat = Number(payload.lat);
  if (payload.lng !== undefined) payload.lng = Number(payload.lng);
  return payload;
}

function Registration() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api('/api/donors', { method: 'POST', body: toPayload(form) });
      await login(form.email.trim(), form.password);
      navigate('/donor', { replace: true });
    } catch (err) {
      setErrors(err.field ? { [err.field]: err.message.replace(/"/g, '') } : { form: err.message });
      setBusy(false);
    }
  }

  const input = (key, type = 'text', extra = {}) =>
    function renderInput(props) {
      return <input {...props} type={type} value={form[key]} onChange={set(key)} {...extra} />;
    };

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-wide" aria-labelledby="register-title">
        <p className="brand brand-large"><span className="brand-mark" aria-hidden="true" />LifeLink</p>
        <h1 id="register-title">Register as a donor</h1>
        <form onSubmit={onSubmit} noValidate className="form-grid">
          <Field id="full_name" label="Full name" error={errors.full_name}>{input('full_name', 'text', { autoComplete: 'name' })}</Field>
          <Field id="reg-email" label="Email" error={errors.email}>{input('email', 'email', { autoComplete: 'email' })}</Field>
          <Field id="reg-password" label="Password" error={errors.password} hint="At least 8 characters">
            {input('password', 'password', { autoComplete: 'new-password' })}
          </Field>
          <Field id="phone" label="Phone" error={errors.phone} hint="Stored encrypted">{input('phone', 'tel', { autoComplete: 'tel' })}</Field>
          <Field id="blood_group" label="Blood group" error={errors.blood_group}>
            {(props) => <Select {...props} options={BLOOD_GROUPS} value={form.blood_group} onChange={set('blood_group')} />}
          </Field>
          <Field id="date_of_birth" label="Date of birth" error={errors.date_of_birth}>{input('date_of_birth', 'date')}</Field>
          <Field id="last_donation_date" label="Last donation (optional)" error={errors.last_donation_date}>{input('last_donation_date', 'date')}</Field>
          <Field id="city" label="City (optional)" error={errors.city}>{input('city')}</Field>
          <Field id="lat" label="Latitude (optional)" error={errors.lat}>{input('lat', 'number', { step: 'any' })}</Field>
          <Field id="lng" label="Longitude (optional)" error={errors.lng}>{input('lng', 'number', { step: 'any' })}</Field>
          <label className="checkbox form-grid-full">
            <input type="checkbox" checked={form.organ_pledge} onChange={set('organ_pledge')} />
            I pledge to be an organ donor
          </label>
          {errors.form && <p className="form-error form-grid-full" role="alert">{errors.form}</p>}
          <button type="submit" className="button button-primary form-grid-full" disabled={busy}>
            {busy ? 'Registering…' : 'Register'}
          </button>
        </form>
        <p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}

function Profile() {
  const profile = usePolling(() => api('/api/donors/me'), 0);
  const calls = usePolling(() => api('/api/notifications'), 15000);
  const donor = profile.data;

  return (
    <Layout title="My donor profile">
      {profile.error && <p className="form-error" role="alert">{profile.error}</p>}
      {donor && (
        <section className="card profile-card" aria-label="Profile">
          <div className="blood-drop" role="img" aria-label={`Blood group ${donor.blood_group}`}><span aria-hidden="true">{donor.blood_group}</span></div>
          <div>
            <h2>{donor.full_name}</h2>
            <p className="muted">{donor.email} · {donor.phone}{donor.city ? ` · ${donor.city}` : ''}</p>
            <dl className="facts">
              <div><dt>Eligibility</dt><dd>
                <span className={`badge ${donor.eligible ? 'badge-matched' : 'badge-partial'}`}>
                  {donor.eligible ? 'Eligible to donate' : 'Not eligible yet'}
                </span>
              </dd></div>
              <div><dt>Next eligible date</dt><dd>{donor.nextEligibleDate ? formatDate(donor.nextEligibleDate) : 'Not eligible (age limit)'}</dd></div>
              <div><dt>Last donation</dt><dd>{donor.last_donation_date ? formatDate(donor.last_donation_date) : 'Never'}</dd></div>
              <div><dt>Organ pledge</dt><dd>{donor.organ_pledge ? 'Pledged' : 'Not pledged'}</dd></div>
            </dl>
          </div>
        </section>
      )}
      <section className="card" aria-labelledby="calls-title">
        <h2 id="calls-title">Donation calls</h2>
        {(calls.data || []).length === 0 ? (
          <p className="empty">No donation calls right now. We will notify you when your blood group is needed.</p>
        ) : (
          <ul className="call-list">
            {calls.data.map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong>{n.channel === 'SMS' && <span className="sms-tag">SMS</span>}
                <p>{n.body}</p>
                <time dateTime={n.created_at}>{timeAgo(n.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Layout>
  );
}

export default function DonorApp() {
  const session = getSession();
  return session && session.user.role === 'DONOR' ? <Profile /> : <Registration />;
}
