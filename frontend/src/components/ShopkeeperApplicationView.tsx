import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchMyApplicationStatus,
  submitShopkeeperApplication,
  uploadApplicationFile,
  type ShopkeeperApplication,
  type ApplicationSubmitPayload,
  type UserProfile,
} from '../api/client';

interface Props {
  user: UserProfile | null;
  token: string | null;
}

export const ShopkeeperApplicationView: React.FC<Props> = ({ user, token }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [appStatus, setAppStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE'>('NONE');
  const [application, setApplication] = useState<ShopkeeperApplication | null>(null);
  const [showReapplyForm, setShowReapplyForm] = useState(false);

  // Form Fields
  const [shopName, setShopName] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // Uploads
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoKey, setPhotoKey] = useState<string>('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docKey, setDocKey] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadStatus = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetchMyApplicationStatus(token);
      setAppStatus(res.status);
      setApplication(res.application);
      if (res.status === 'REJECTED') {
        setShowReapplyForm(false);
      }
    } catch (err: any) {
      console.error('Failed to load application status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [token]);

  // Pre-fill default location from profile if available
  useEffect(() => {
    if (user && !shopAddress) {
      if (user.city) setCity(user.city);
      if (user.state) setState(user.state);
      if (user.pincode) setPincode(user.pincode);
      if (user.phone && !shopPhone) setShopPhone(user.phone);
    }
  }, [user]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !token) return;
    const file = e.target.files[0];
    setPhotoFile(file);
    setUploadingPhoto(true);
    try {
      const res = await uploadApplicationFile(token, file, 'photo');
      setPhotoKey(res.key);
      setFeedback({ type: 'success', message: `Shop photo "${file.name}" uploaded successfully.` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to upload shop photo.' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDocSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !token) return;
    const file = e.target.files[0];
    setDocFile(file);
    setUploadingDoc(true);
    try {
      const res = await uploadApplicationFile(token, file, 'document');
      setDocKey(res.key);
      setFeedback({ type: 'success', message: `Verification document "${file.name}" uploaded successfully.` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to upload document.' });
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!shopName.trim()) {
      setFeedback({ type: 'error', message: 'Please provide your Shop Name.' });
      return;
    }
    if (!shopPhone.trim()) {
      setFeedback({ type: 'error', message: 'Please provide the Shop / Business Phone number.' });
      return;
    }
    if (!shopAddress.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
      setFeedback({ type: 'error', message: 'Please provide full store address, city, state, and pincode.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const payload: ApplicationSubmitPayload = {
      shop_name: shopName.trim(),
      shop_description: shopDescription.trim(),
      shop_phone: shopPhone.trim(),
      shop_address: shopAddress.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      shop_photo_url: photoKey,
      document_url: docKey,
      applicant_name: user?.name || user?.email?.split('@')[0],
      applicant_phone: user?.phone || '',
    };

    try {
      const res = await submitShopkeeperApplication(token, payload);
      setFeedback({
        type: 'success',
        message: res.message || 'Application submitted successfully! Our administrators will review your store details.',
      });
      setApplication(res.application);
      setAppStatus('PENDING');
      setShowReapplyForm(false);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to submit application. Please check all fields and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
        <p>Checking shopkeeper application status...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="content-header">
        <h1>Become a LOCOMART Shopkeeper</h1>
        <p>
          Partner with LOCOMART to bring your neighborhood grocery store online, receive local customer orders, and grow your local business.
        </p>
      </div>

      {feedback && (
        <div className={`alert ${feedback.type === 'success' ? 'alert-success' : 'alert-error'}`} role="alert" style={{ marginBottom: '1.5rem' }}>
          <span className="alert-icon">{feedback.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. PENDING STATUS VIEW                                    */}
      {/* ========================================================= */}
      {appStatus === 'PENDING' && application && (
        <div className="application-status-card pending">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '2rem' }}>⏳</span>
              <div>
                <h3 style={{ margin: 0, color: 'var(--color-brown-900)', fontSize: '1.25rem' }}>
                  Application Under Review
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Submitted on {new Date(application.created_at).toLocaleDateString()} at {new Date(application.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
            <span className="badge-status badge-pending">Status: PENDING</span>
          </div>

          <div style={{ background: 'var(--color-surface-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.25rem' }}>
            <h4 style={{ color: 'var(--color-brown-900)', marginTop: 0, marginBottom: '0.75rem', fontSize: '1rem' }}>
              Submitted Store Details:
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div><strong>Shop Name:</strong> {application.shop_name}</div>
              <div><strong>Business Phone:</strong> {application.shop_phone}</div>
              <div><strong>Location:</strong> {application.city}, {application.state} - {application.pincode}</div>
              <div><strong>Street Address:</strong> {application.shop_address}</div>
              {application.shop_photo_url && (
                <div>
                  <strong>Store Photo:</strong>{' '}
                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>✓ Attached</span>
                </div>
              )}
              {application.document_url && (
                <div>
                  <strong>Registration Doc:</strong>{' '}
                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>✓ Attached</span>
                </div>
              )}
            </div>
            {application.shop_description && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--color-text-body)' }}>
                <strong>Description:</strong> {application.shop_description}
              </div>
            )}
          </div>

          <div style={{ background: '#FFFDF9', border: '1px solid var(--color-warning-border)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-warning-text)', lineHeight: 1.5 }}>
              Your application is in queue for administrator review. Per platform rules, customers may maintain at most <strong>one pending application</strong>. Once reviewed, your account will automatically be upgraded to <strong>SHOPKEEPER</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. APPROVED STATUS VIEW                                   */}
      {/* ========================================================= */}
      {appStatus === 'APPROVED' && (
        <div className="application-status-card approved">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '2.25rem' }}>🎉</span>
              <div>
                <h3 style={{ margin: 0, color: 'var(--color-success-text)', fontSize: '1.3rem' }}>
                  Congratulations! Application Approved
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  Your store is now an active local merchant on LOCOMART.
                </span>
              </div>
            </div>
            <span className="badge-status badge-approved">Status: APPROVED</span>
          </div>

          <p style={{ color: 'var(--color-text-body)', lineHeight: 1.6, fontSize: '0.95rem', margin: '1rem 0' }}>
            Your shopkeeper application has been verified and approved by the administration. Your account now holds the <strong>SHOPKEEPER</strong> role, and your store is created in the LOCOMART store directory.
          </p>

          <button
            type="button"
            onClick={() => navigate('/shopkeeper')}
            className="button button-primary"
            style={{ marginTop: '0.5rem' }}
          >
            Enter Shopkeeper Portal →
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. REJECTED STATUS VIEW                                   */}
      {/* ========================================================= */}
      {appStatus === 'REJECTED' && application && !showReapplyForm && (
        <div className="application-status-card rejected">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '2.25rem' }}>⚠️</span>
              <div>
                <h3 style={{ margin: 0, color: 'var(--color-error-text)', fontSize: '1.25rem' }}>
                  Application Requires Revision
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Reviewed on {application.reviewed_at ? new Date(application.reviewed_at).toLocaleDateString() : 'Recent'}
                </span>
              </div>
            </div>
            <span className="badge-status badge-rejected">Status: REJECTED</span>
          </div>

          <div className="status-rejection-banner">
            <h4>Administrator Feedback / Reason for Rejection:</h4>
            <p>"{application.rejection_reason || 'Information provided did not meet verification criteria.'}"</p>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-body)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
            Your account remains a <strong>CUSTOMER</strong>. You may update your store information, address, or upload clearer verification documents and reapply.
          </p>

          <button
            type="button"
            onClick={() => {
              // Pre-fill existing data for easy revision
              setShopName(application.shop_name || '');
              setShopDescription(application.shop_description || '');
              setShopPhone(application.shop_phone || '');
              setShopAddress(application.shop_address || '');
              setCity(application.city || '');
              setState(application.state || '');
              setPincode(application.pincode || '');
              setShowReapplyForm(true);
            }}
            className="button button-primary"
          >
            ✏️ Submit Revised Application
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. APPLICATION FORM (New or Reapplying)                    */}
      {/* ========================================================= */}
      {(appStatus === 'NONE' || showReapplyForm) && (
        <div className="profile-card">
          {showReapplyForm && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontWeight: 600, color: 'var(--color-brown-900)' }}>Reapplying with updated information</span>
              <button
                type="button"
                onClick={() => setShowReapplyForm(false)}
                className="button button-sm button-secondary"
              >
                Cancel Reapplication
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Section 1: Applicant Information */}
            <div className="profile-section-title">
              <span>👤</span>
              <span>Applicant Identity</span>
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label htmlFor="app-name">Applicant Full Name</label>
                <input
                  id="app-name"
                  type="text"
                  value={user?.name || ''}
                  disabled
                  className="input-disabled"
                />
                <span className="field-hint">From your verified customer profile.</span>
              </div>

              <div className="form-group flex-1">
                <label htmlFor="app-email">Account Email</label>
                <input
                  id="app-email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="input-disabled"
                />
                <span className="field-hint">Primary contact for approval notifications.</span>
              </div>
            </div>

            <hr className="profile-section-divider" />

            {/* Section 2: Store / Business Information */}
            <div className="profile-section-title">
              <span>🏪</span>
              <span>Store & Business Details</span>
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label htmlFor="shop-name">Shop Name *</label>
                <input
                  id="shop-name"
                  type="text"
                  placeholder="e.g. Sri Lakshmi Stores"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  required
                />
                <span className="field-hint">The public commercial name shown to customers.</span>
              </div>

              <div className="form-group flex-1">
                <label htmlFor="shop-phone">Shop / Business Phone *</label>
                <input
                  id="shop-phone"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={shopPhone}
                  onChange={(e) => setShopPhone(e.target.value)}
                  required
                />
                <span className="field-hint">Business contact number used for customer calls and order dispatch.</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="shop-desc">Shop Description</label>
              <textarea
                id="shop-desc"
                rows={2}
                placeholder="e.g. Traditional neighborhood provision store offering premium rice varieties, dals, spices, and fresh dairy essentials."
                value={shopDescription}
                onChange={(e) => setShopDescription(e.target.value)}
              />
              <span className="field-hint">Brief overview of grocery categories and specialty items you provide.</span>
            </div>

            <div className="form-group">
              <label htmlFor="shop-addr">Shop Physical Address *</label>
              <textarea
                id="shop-addr"
                rows={2}
                placeholder="e.g. Shop #4, Gandhi Bazaar Main Road"
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                required
              />
              <span className="field-hint">Exact physical address where customers or delivery personnel locate your store.</span>
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label htmlFor="shop-city">City *</label>
                <input
                  id="shop-city"
                  type="text"
                  placeholder="e.g. Chennai"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>

              <div className="form-group flex-1">
                <label htmlFor="shop-state">State *</label>
                <input
                  id="shop-state"
                  type="text"
                  placeholder="e.g. Tamil Nadu"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  required
                />
              </div>

              <div className="form-group flex-1">
                <label htmlFor="shop-pincode">Pincode *</label>
                <input
                  id="shop-pincode"
                  type="text"
                  placeholder="e.g. 600001"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  required
                />
              </div>
            </div>

            <hr className="profile-section-divider" />

            {/* Section 3: Verification Uploads (Private Storage) */}
            <div className="profile-section-title">
              <span>📁</span>
              <span>Verification Documents & Storefront Photo</span>
            </div>

            <div className="form-row" style={{ alignItems: 'flex-start' }}>
              {/* Shop Photo Upload */}
              <div className="form-group flex-1">
                <label>Shop Front / Store Photo</label>
                <div className="file-upload-box">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    disabled={uploadingPhoto}
                  />
                  <div className="file-upload-icon">📷</div>
                  <div className="file-upload-text">
                    {uploadingPhoto ? 'Uploading photo to secure storage...' : 'Click or drop store photo here'}
                  </div>
                  <div className="file-upload-hint">PNG, JPG, or WEBP up to 10MB</div>
                </div>
                {photoFile && (
                  <div className="file-selected-pill">
                    <span>✓ {photoFile.name}</span>
                  </div>
                )}
              </div>

              {/* Business Registration / Supporting Doc Upload */}
              <div className="form-group flex-1">
                <label>Registration / Trade Certificate / Supporting Document</label>
                <div className="file-upload-box">
                  <input
                    type="file"
                    accept=".pdf,image/*,.doc,.docx"
                    onChange={handleDocSelect}
                    disabled={uploadingDoc}
                  />
                  <div className="file-upload-icon">📄</div>
                  <div className="file-upload-text">
                    {uploadingDoc ? 'Uploading document to secure storage...' : 'Click or drop registration document here'}
                  </div>
                  <div className="file-upload-hint">PDF or Image document up to 10MB</div>
                </div>
                {docFile && (
                  <div className="file-selected-pill">
                    <span>✓ {docFile.name}</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: 'var(--color-surface-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.15rem', marginTop: '1rem', border: '1px solid var(--color-border)', fontSize: '0.825rem', color: 'var(--color-text-muted)' }}>
              🔒 <strong>Privacy Assurance:</strong> Uploaded documents are stored in private InsForge Storage and accessible only to authorized administrators for verification purposes.
            </div>

            {/* Submit Button */}
            <div className="profile-actions-bar" style={{ marginTop: '1.75rem' }}>
              <button
                type="submit"
                className="button button-primary"
                disabled={submitting || uploadingPhoto || uploadingDoc}
              >
                {submitting ? (
                  <>
                    <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: '#fff' }}></span>
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  'Submit Application for Admin Review'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
