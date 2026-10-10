import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { resetPassword } = useAuth();

  // Extract reset token and status from query parameters
  const token = searchParams.get('token') || searchParams.get('otp') || searchParams.get('code');
  const statusParam = searchParams.get('insforge_status');
  const errorParam = searchParams.get('insforge_error');

  const isLinkInvalidOrExpired = statusParam === 'error' || Boolean(errorParam) || !token;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!token) {
      setErrorMsg('Missing or invalid reset token. Please request a new reset link.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please ensure both fields are identical.');
      return;
    }

    setSubmitting(true);
    const res = await resetPassword(newPassword, token);
    setSubmitting(false);

    if (res.success) {
      setSuccess(true);
    } else {
      setErrorMsg(res.error || 'Failed to reset password. The link may have expired.');
    }
  };

  return (
    <div className="auth-page-layout">
      {/* ------------------------------------------------------------- */}
      {/* Left Showcase Side                                            */}
      {/* ------------------------------------------------------------- */}
      <div className="showcase-side">
        <div className="showcase-content">
          <div className="showcase-pill-badge">
            <span className="pill-dot"></span>
            <span>Security & Authentication</span>
          </div>

          <h1 className="showcase-tagline">
            Set your new LOCOMART password.
          </h1>
          <p className="showcase-description">
            Choose a strong, unique password to safeguard your neighborhood orders, saved addresses, and profile details.
          </p>

          <div className="showcase-image-card">
            <img
              src="/assets/local-shopping-hero.jpg"
              alt="Local neighborhood grocery store market with fresh produce"
              className="showcase-hero-img"
            />
            <div className="showcase-image-badge">
              <span>🛡️</span>
              <span>Encrypted Authentication & Session Security</span>
            </div>
          </div>
        </div>

        <div className="showcase-pillars">
          <div className="pillar-item">
            <div className="pillar-icon">🔒</div>
            <div className="pillar-title">Strong Encryption</div>
            <div className="pillar-desc">Your credentials are hashed and secured via InsForge Auth.</div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">🛒</div>
            <div className="pillar-title">Seamless Access</div>
            <div className="pillar-desc">Instantly log in to resume daily shopping without disruption.</div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">🏪</div>
            <div className="pillar-title">One Identity</div>
            <div className="pillar-desc">Works across all LOCOMART customer and shopkeeper portals.</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Right Form Side                                               */}
      {/* ------------------------------------------------------------- */}
      <div className="auth-form-side">
        <div className="auth-form-card">
          {success ? (
            /* ========================================================= */
            /* Success State                                             */
            /* ========================================================= */
            <div className="auth-success-box" style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  margin: '0 auto 1.25rem auto',
                  background: 'var(--color-success-bg)',
                  color: 'var(--color-success)',
                  borderRadius: 'var(--radius-full)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  border: '1px solid var(--color-success-border)',
                }}
              >
                ✓
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-brown-900)', marginBottom: '0.5rem' }}>
                Password Reset Successfully! 🎉
              </h2>
              <p style={{ color: 'var(--color-text-body)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.75rem' }}>
                Your account password has been updated. You can now use your new password to sign in.
              </p>

              <Link to="/login" className="button button-primary button-block">
                Sign In to Your Account →
              </Link>
            </div>
          ) : isLinkInvalidOrExpired ? (
            /* ========================================================= */
            /* Invalid or Expired Token State                            */
            /* ========================================================= */
            <div className="auth-error-box" style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  margin: '0 auto 1.25rem auto',
                  background: 'var(--color-error-bg)',
                  color: 'var(--color-error)',
                  borderRadius: 'var(--radius-full)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  border: '1px solid var(--color-error-border)',
                }}
              >
                ⚠️
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-brown-900)', marginBottom: '0.5rem' }}>
                Invalid or Expired Link
              </h2>
              <p style={{ color: 'var(--color-text-body)', fontSize: '0.925rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                {errorParam ||
                  'This password reset link is invalid, incomplete, or has already expired. Password reset links are time-limited to protect your account.'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Link to="/forgot-password" className="button button-primary button-block">
                  Request a New Reset Link →
                </Link>
                <Link to="/login" className="button button-ghost button-block">
                  ← Return to Login
                </Link>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* Active Reset Form State                                   */
            /* ========================================================= */
            <>
              <div className="auth-card-header">
                <h2>Set New Password</h2>
                <p className="auth-card-subtitle">
                  Create a new password of at least 6 characters for your account.
                </p>
              </div>

              {errorMsg && (
                <div className="alert alert-error" role="alert" style={{ marginBottom: '1.25rem' }}>
                  <span className="alert-icon">⚠️</span>
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                <div className="form-group">
                  <div className="password-label-row">
                    <label htmlFor="reset-new-password">New Password</label>
                    <button
                      type="button"
                      className="btn-toggle-password"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input
                    id="reset-new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    autoFocus
                  />
                  <span className="field-hint">Must contain at least 6 characters.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="reset-confirm-password">Confirm New Password</label>
                  <input
                    id="reset-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>

                <button
                  type="submit"
                  className="button button-primary button-block"
                  disabled={submitting}
                  style={{ marginTop: '0.5rem' }}
                >
                  {submitting ? (
                    <>
                      <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: '#fff' }}></span>
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    'Update Password'
                  )}
                </button>
              </form>

              <div className="auth-footer" style={{ marginTop: '1.75rem' }}>
                <p>
                  Remember your old password?{' '}
                  <Link to="/login" className="auth-link">
                    Sign in to your account
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
