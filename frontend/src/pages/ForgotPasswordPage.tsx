import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ForgotPasswordPage: React.FC = () => {
  const { sendResetPasswordEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }

    setSubmitting(true);
    const res = await sendResetPasswordEmail(cleanEmail);
    setSubmitting(false);

    if (res.success) {
      setSubmitted(true);
    } else {
      setErrorMsg(res.error || 'Failed to send password reset email. Please try again.');
    }
  };

  return (
    <div className="auth-page-layout">
      {/* ------------------------------------------------------------- */}
      {/* Left Showcase Side (Consistent with LOCOMART Auth Layout)     */}
      {/* ------------------------------------------------------------- */}
      <div className="showcase-side">
        <div className="showcase-content">
          <div className="showcase-pill-badge">
            <span className="pill-dot"></span>
            <span>Account Security & Recovery</span>
          </div>

          <h1 className="showcase-tagline">
            Never lose access to your local marketplace.
          </h1>
          <p className="showcase-description">
            Quickly recover your LOCOMART account so you can continue ordering fresh local groceries, daily dairy, and household essentials from your neighborhood stores.
          </p>

          <div className="showcase-image-card">
            <img
              src="/assets/local-shopping-hero.jpg"
              alt="Local neighborhood grocery store market with fresh produce"
              className="showcase-hero-img"
            />
            <div className="showcase-image-badge">
              <span>🔒</span>
              <span>Secure Authentication via InsForge</span>
            </div>
          </div>
        </div>

        <div className="showcase-pillars">
          <div className="pillar-item">
            <div className="pillar-icon">✉️</div>
            <div className="pillar-title">Verified Email Link</div>
            <div className="pillar-desc">Safe, time-limited reset links delivered straight to your inbox.</div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">🛡️</div>
            <div className="pillar-title">Protected Account</div>
            <div className="pillar-desc">Your order history and saved delivery details stay completely safe.</div>
          </div>
          <div className="pillar-item">
            <div className="pillar-icon">⚡</div>
            <div className="pillar-title">Instant Recovery</div>
            <div className="pillar-desc">Set your new password and sign right back into your account.</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Right Form Side                                               */}
      {/* ------------------------------------------------------------- */}
      <div className="auth-form-side">
        <div className="auth-form-card">
          {submitted ? (
            /* Success State: Check Your Email */
            <div className="auth-success-box" style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  margin: '0 auto 1.25rem auto',
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  borderRadius: 'var(--radius-full)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                }}
              >
                ✉️
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-brown-900)', marginBottom: '0.5rem' }}>
                Check Your Email
              </h2>
              <p style={{ color: 'var(--color-text-body)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                If an account exists for <strong>{email}</strong>, we have sent a secure password reset link to your inbox.
              </p>

              <div
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  fontSize: '0.85rem',
                  color: 'var(--color-text-muted)',
                  textAlign: 'left',
                  marginBottom: '1.5rem',
                  lineHeight: 1.45,
                }}
              >
                <strong style={{ color: 'var(--color-brown-900)', display: 'block', marginBottom: '0.25rem' }}>
                  Next Steps:
                </strong>
                1. Open the email from <strong>LOCOMART / InsForge</strong>.<br />
                2. Click the <strong>Reset Password</strong> button or link.<br />
                3. Choose your new password on the secure reset page.<br />
                <span style={{ display: 'block', marginTop: '0.5rem', fontStyle: 'italic' }}>
                  Can't find the email? Check your spam or promotions folder.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setEmail('');
                  }}
                  className="button button-secondary button-block"
                >
                  Send to Another Email Address
                </button>
                <Link to="/login" className="button button-ghost button-block">
                  ← Return to Login
                </Link>
              </div>
            </div>
          ) : (
            /* Input Form: Email & Submit */
            <>
              <div className="auth-card-header">
                <h2>Forgot Password?</h2>
                <p className="auth-card-subtitle">
                  Enter your email address and we'll send you a link to reset your account password.
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
                  <label htmlFor="reset-email">Email Address</label>
                  <input
                    id="reset-email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                  <span className="field-hint">
                    Enter the email registered with your Customer, Shopkeeper, or Admin account.
                  </span>
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
                      <span>Sending Reset Link...</span>
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>

              <div className="auth-footer" style={{ marginTop: '1.75rem' }}>
                <p>
                  Remember your password?{' '}
                  <Link to="/login" className="auth-link">
                    Sign in to your account
                  </Link>
                </p>
                <p className="auth-sub-note">
                  Need help? Contact support or register a new customer account.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
