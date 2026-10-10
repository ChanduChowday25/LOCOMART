import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type PortalRole = 'CUSTOMER' | 'SHOPKEEPER' | 'ADMIN';

export const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, signInWithGoogle, user, error, clearError } = useAuth();

  const initialPortal = (searchParams.get('portal')?.toUpperCase() as PortalRole) || 'CUSTOMER';
  const [selectedPortal, setSelectedPortal] = useState<PortalRole>(
    ['CUSTOMER', 'SHOPKEEPER', 'ADMIN'].includes(initialPortal) ? initialPortal : 'CUSTOMER'
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // If already logged in, redirect to appropriate portal
  useEffect(() => {
    if (user) {
      if (user.role === 'CUSTOMER') navigate('/customer');
      else if (user.role === 'SHOPKEEPER') navigate('/shopkeeper');
      else if (user.role === 'ADMIN') navigate('/admin');
    }
  }, [user, navigate]);

  const handlePortalChange = (portal: PortalRole) => {
    setSelectedPortal(portal);
    setLocalError(null);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password.trim()) {
      setLocalError('Please enter both your email and password.');
      return;
    }

    setSubmitting(true);
    const res = await signIn(cleanEmail, password, selectedPortal);
    setSubmitting(false);

    if (res.success) {
      if (selectedPortal === 'CUSTOMER') navigate('/customer');
      else if (selectedPortal === 'SHOPKEEPER') navigate('/shopkeeper');
      else if (selectedPortal === 'ADMIN') navigate('/admin');
    } else {
      setLocalError(res.error || 'Authentication failed. Please check your credentials.');
    }
  };

  const handleGoogleLogin = async () => {
    setLocalError(null);
    clearError();
    try {
      await signInWithGoogle(selectedPortal);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to initiate Google OAuth.');
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
            Your local shops, right at your doorstep.
          </h1>
          <p className="showcase-description">
            Shop farm-fresh produce, daily dairy, and everyday household essentials directly from your trusted neighborhood stores. Enjoy honest store prices and prompt neighborhood delivery.
          </p>

          {/* Local Shopping Hero Image */}
          <div className="showcase-image-card">
            <img
              src="/assets/local-shopping-hero.jpg"
              alt="Local neighborhood grocery store market with fresh produce"
              className="showcase-hero-img"
            />
            <div className="showcase-image-badge">
              <span>🌾</span>
              <span>100% Verified Neighborhood Stores</span>
            </div>
          </div>
        </div>

        {/* Trust Pillars */}
        <div className="showcase-pillars">
          <div className="pillar-item">
            <div className="pillar-icon">🏪</div>
            <div className="pillar-title">Direct from Shops</div>
            <div className="pillar-desc">Support local store owners you recognize and trust.</div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">⚡</div>
            <div className="pillar-title">Doorstep Delivery</div>
            <div className="pillar-desc">Delivered quickly from stores right in your area.</div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">🏷️</div>
            <div className="pillar-title">Transparent Prices</div>
            <div className="pillar-desc">Original store shelf pricing without hidden markups.</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Right Auth Form Side                                          */}
      {/* ------------------------------------------------------------- */}
      <div className="auth-form-side">
        <div className="auth-form-card">
          <div className="auth-card-header">
            <h2>Welcome Back</h2>
            <p className="auth-card-subtitle">
              Sign in to manage your grocery orders and account.
            </p>
          </div>

          {/* Portal Selector (Customer / Shopkeeper / Admin) */}
          <div className="portal-selector-tabs" role="tablist" aria-label="Portal Selection">
            <button
              type="button"
              role="tab"
              aria-selected={selectedPortal === 'CUSTOMER'}
              className={`portal-selector-tab ${selectedPortal === 'CUSTOMER' ? 'active' : ''}`}
              onClick={() => handlePortalChange('CUSTOMER')}
            >
              <span>🛒</span>
              <span>Customer</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedPortal === 'SHOPKEEPER'}
              className={`portal-selector-tab ${selectedPortal === 'SHOPKEEPER' ? 'active' : ''}`}
              onClick={() => handlePortalChange('SHOPKEEPER')}
            >
              <span>🏪</span>
              <span>Shopkeeper</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedPortal === 'ADMIN'}
              className={`portal-selector-tab ${selectedPortal === 'ADMIN' ? 'active' : ''}`}
              onClick={() => handlePortalChange('ADMIN')}
            >
              <span>🛡️</span>
              <span>Admin</span>
            </button>
          </div>

          {/* Active Portal Context Indicator */}
          <div className="portal-role-desc">
            {selectedPortal === 'CUSTOMER' && (
              <span>Logging in to <strong>Customer Portal</strong> for grocery shopping.</span>
            )}
            {selectedPortal === 'SHOPKEEPER' && (
              <span>Logging in to <strong>Shopkeeper Portal</strong> for store management.</span>
            )}
            {selectedPortal === 'ADMIN' && (
              <span>Logging in to <strong>Admin Portal</strong> for governance and approvals.</span>
            )}
          </div>

          {(localError || error) && (
            <div className="alert alert-error" role="alert">
              <span className="alert-icon">⚠️</span>
              <span>{localError || error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
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
                <label htmlFor="login-password">Password</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <Link to="/forgot-password" className="auth-forgot-link">
                    Forgot Password?
                  </Link>
                  <button
                    type="button"
                    className="btn-toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="button button-primary button-block"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: '#fff' }}></span>
                  <span>Signing In...</span>
                </>
              ) : (
                `Sign In to ${selectedPortal === 'CUSTOMER' ? 'Customer Account' : selectedPortal === 'SHOPKEEPER' ? 'Shopkeeper Portal' : 'Admin Portal'}`
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>or continue with</span>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="button button-oauth"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" style={{ marginRight: '0.5rem' }}>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="auth-footer">
            <p>
              New to LOCOMART?{' '}
              <Link to="/register" className="auth-link">
                Create customer account
              </Link>
            </p>
            <p className="auth-sub-note">
              Note: Shopkeeper and Admin roles require authorized credentials.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
