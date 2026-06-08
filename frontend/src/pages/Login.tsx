import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/authStore';
import { errorMessage } from '../api/client';
import { useT } from '../lib/i18n';

export default function Login() {
  const { login, loading } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="logo">م</div>
        <h2>{t('page.login.title')}</h2>
        <p>{t('page.login.tagline')}</p>

        {error && <div className="alert error">⚠️ {error}</div>}

        <div className="field">
          <label>{t('page.login.username')}</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>{t('page.login.password')}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>

        <button className="btn" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
          {loading ? t('page.login.loading') : t('page.login.submit')}
        </button>
      </form>
    </div>
  );
}
