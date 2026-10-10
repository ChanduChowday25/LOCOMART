import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { signUp, error, clearError } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail || !password.trim()) {
      setLocalError('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }

    setSubmitting(true);
    const res = await signUp(cleanEmail, password, cleanName);
    setSubmitting(false);

    if (res.success) {
      // Continue directly to customer flow without email verification or OTP
      navigate('/customer');
    } else {
      setLocalError(res.error || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="auth-split-wrapper">
      {/* ------------------------------------------------------------- */}
      {/* Left Showcase Side (Desktop / Tablet)                          */}
      {/* ------------------------------------------------------------- */}
      <div className="auth-showcase-side">
        <div className="showcase-top">
          {/* Official Logo and Name */}
          <div className="showcase-brand">
            <img
              src="/assets/locomart-logo.png"
              alt="Official LOCOMART Logo"
              className="showcase-logo-img"
            />
            <div>
              <div className="showcase-brand-name">LOCOMART</div>
              <span className="brand-subtext">Local Grocery Platform</span>
            </div>
          </div>

          {/* Headline & Purpose */}
          <h1 className="showcase-tagline">
            Fresh local groceries, delivered to your door.
          </h1>
          <p className="showcase-description">
            Create your free customer account to browse neighborhood stores, build your basket, and receive fast, personalized doorstep delivery from merchants in your community.
          </p>

          {/* Local Shopping Hero Image */}
          <div className="showcase-image-card">
            <img
              src="/assets/local-shopping-hero.jpg"
              alt="Neighborhood grocery shelves with fresh fruits and vegetables"
              className="showcase-hero-img"
            />
            <div className="showcase-image-badge">
              <span>🛒</span>
              <span>Join Your Local Neighborhood Market</span>
            </div>
          </div>
        </div>

        {/* Trust Pillars */}
        <div className="showcase-pillars">
          <div className="pillar-item">
            <div className="pillar-icon">🌱</div>
            <div className="pillar-title">Fresh Produce</div>
            <div className="pillar-desc">Daily stocked vegetables, fruits, and dairy.</div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">🚀</div>
            <div className="pillar-title">Fast Delivery</div>
            <div className="pillar-desc">Doorstep arrival from nearby shops.</div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">🔒</div>
            <div className="pillar-title">Safe & Simple</div>
            <div className="pillar-desc">Seamless account profile and order tracking.</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Right Auth Form Side                                          */}
      {/* ------------------------------------------------------------- */}
      <div className="auth-form-side">
        <div className="auth-form-card">
          <div className="auth-card-header">
            <h2>Create Customer Account</h2>
            <p className="auth-card-subtitle">
              Sign up as a customer to start ordering groceries.
            </p>
          </div>

          {/* Security Notice Pill */}
          <div className="portal-role-desc" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>👤</span>
            <span>Registration role is strictly <strong>CUSTOMER</strong>.</span>
          </div>

          {(localError || error) && (
            <div className="alert alert-error" role="alert">
              <span className="alert-icon">⚠️</span>
              <span>{localError || error}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="reg-name">Full Name</label>
              <input
                id="reg-name"
                type="text"
                placeholder="e.g. Chandu Chowdary"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-email">Email Address</label>
              <input
                id="reg-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <div className="password-label-row">
                <label htmlFor="reg-password">Password (minimum 6 characters)</label>
                <button
                  type="button"
                  className="btn-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <span className="field-hint">Must be at least 6 characters long.</span>
            </div>

            <button
              type="submit"
              className="button button-primary button-block"
              disabled={submitting}
              style={{ marginTop: '0.75rem' }}
            >
              {submitting ? (
                <>
                  <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: '#fff' }}></span>
                  <span>Creating Account...</span>
                </>
              ) : (
                'Create Customer Account'
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Already have an account?{' '}
              <Link to="/login" className="auth-link">
                Sign In
              </Link>
            </p>
            <p className="auth-sub-note">
              Shopkeeper store applications are submitted through the customer portal after sign in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
