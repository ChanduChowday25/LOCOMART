import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchAdminApplications,
  fetchAdminApplication,
  approveAdminApplication,
  rejectAdminApplication,
  seedAdminDemoShops,
  fetchAdminShops,
  type ShopkeeperApplication,
} from '../api/client';

export const AdminPage: React.FC = () => {
  const { user, token, signOut } = useAuth();

  // Application List State
  const [applications, setApplications] = useState<ShopkeeperApplication[]>([]);
  const [activeFilter, setActiveFilter] = useState<'PENDING' | 'ALL' | 'APPROVED' | 'REJECTED' | 'SHOPS'>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Shops State
  const [shops, setShops] = useState<any[]>([]);
  const [loadingShops, setLoadingShops] = useState(false);

  // Selected Application for Review
  const [selectedApp, setSelectedApp] = useState<ShopkeeperApplication | null>(null);

  // Rejection Dialog State
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Demo Shops Seeding State
  const [seeding, setSeeding] = useState(false);
  const [seedSuccessMessage, setSeedSuccessMessage] = useState<string | null>(null);

  // Load applications
  const loadApplications = async (filter: string = activeFilter) => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAdminApplications(token, filter === 'ALL' ? undefined : filter);
      setApplications(res.applications || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch applications.');
    } finally {
      setLoading(false);
    }
  };

  // Load shops
  const loadShops = async () => {
    if (!token) return;
    try {
      setLoadingShops(true);
      const res = await fetchAdminShops(token);
      setShops(res.shops || []);
    } catch (err: any) {
      console.error('Failed to load shops:', err);
    } finally {
      setLoadingShops(false);
    }
  };

  useEffect(() => {
    if (activeFilter === 'SHOPS') {
      loadShops();
    } else {
      loadApplications(activeFilter);
    }
  }, [token, activeFilter]);

  // Open review modal
  const handleOpenReview = async (appId: string) => {
    if (!token) return;
    setActionFeedback(null);
    setRejecting(false);
    setRejectionReason('');
    try {
      const res = await fetchAdminApplication(token, appId);
      setSelectedApp(res.application);
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Failed to load application details.' });
    }
  };

  // Approve application
  const handleApprove = async () => {
    if (!token || !selectedApp) return;
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await approveAdminApplication(token, selectedApp.id);
      setActionFeedback({
        type: 'success',
        message: '✓ Application approved successfully! The applicant has been promoted to SHOPKEEPER and their store is now ACTIVE.',
      });
      setSelectedApp(res.application);
      loadApplications(activeFilter);
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Failed to approve application.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Reject application
  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedApp) return;

    if (!rejectionReason.trim()) {
      setActionFeedback({ type: 'error', message: 'A rejection reason is mandatory.' });
      return;
    }

    setActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await rejectAdminApplication(token, selectedApp.id, rejectionReason.trim());
      setActionFeedback({
        type: 'success',
        message: 'Application rejected. Rejection reason has been recorded and the applicant remains a CUSTOMER.',
      });
      setSelectedApp(res.application);
      setRejecting(false);
      loadApplications(activeFilter);
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Failed to reject application.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Seed demo shops
  const handleSeedDemoShops = async () => {
    if (!token) return;
    setSeeding(true);
    setSeedSuccessMessage(null);
    try {
      const res = await seedAdminDemoShops(token);
      setSeedSuccessMessage(`✓ ${res.message} (${res.shops.join(', ')})`);
      setTimeout(() => setSeedSuccessMessage(null), 7000);
      if (activeFilter === 'SHOPS') {
        loadShops();
      } else {
        loadApplications(activeFilter);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to seed demo shops.');
    } finally {
      setSeeding(false);
    }
  };

  const pendingCount = applications.filter((a) => a.status === 'PENDING').length;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2.5rem 1.5rem', width: '100%' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '2rem' }}>🛡️</span>
            <h1 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--color-brown-900)' }}>
              Admin Portal
            </h1>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-error-bg)',
                color: 'var(--color-error-text)',
                border: '1px solid var(--color-error-border)',
              }}
            >
              RESTRICTED
            </span>
          </div>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Signed in as <strong>{user?.email}</strong>. Manage shopkeeper applications, review verification documents, and activate stores.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleSeedDemoShops}
            disabled={seeding}
            className="button button-sm button-secondary"
            title="Idempotently ensure the 4 initial demo shops and shopkeepers exist in PostgreSQL"
          >
            {seeding ? 'Seeding Demo Stores...' : '🌱 Seed 4 Demo Stores'}
          </button>
          <button type="button" onClick={signOut} className="button button-sm button-secondary">
            Sign Out
          </button>
        </div>
      </div>

      {seedSuccessMessage && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          <span className="alert-icon">✓</span>
          <span>{seedSuccessMessage}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
          <span className="alert-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Admin Tabs & Filter Bar */}
      <div className="admin-toolbar">
        <div className="admin-filter-tabs">
          <button
            type="button"
            className={`admin-filter-btn ${activeFilter === 'PENDING' ? 'active' : ''}`}
            onClick={() => setActiveFilter('PENDING')}
          >
            ⏳ Pending Review
            {pendingCount > 0 && <span className="admin-filter-badge">{pendingCount}</span>}
          </button>

          <button
            type="button"
            className={`admin-filter-btn ${activeFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ALL')}
          >
            📋 All Applications
          </button>

          <button
            type="button"
            className={`admin-filter-btn ${activeFilter === 'APPROVED' ? 'active' : ''}`}
            onClick={() => setActiveFilter('APPROVED')}
          >
            ✓ Approved
          </button>

          <button
            type="button"
            className={`admin-filter-btn ${activeFilter === 'REJECTED' ? 'active' : ''}`}
            onClick={() => setActiveFilter('REJECTED')}
          >
            ✕ Rejected
          </button>

          <button
            type="button"
            className={`admin-filter-btn ${activeFilter === 'SHOPS' ? 'active' : ''}`}
            onClick={() => setActiveFilter('SHOPS')}
          >
            🏪 Active Shops in DB
          </button>
        </div>

        <button
          type="button"
          onClick={() => (activeFilter === 'SHOPS' ? loadShops() : loadApplications(activeFilter))}
          className="button button-sm button-secondary"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Main Content: Applications Table or Active Shops */}
      {activeFilter === 'SHOPS' ? (
        <div>
          {loadingShops ? (
            <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
              <p>Loading database shops...</p>
            </div>
          ) : shops.length === 0 ? (
            <div className="placeholder-card" style={{ margin: 0 }}>
              <div className="placeholder-icon">🏪</div>
              <h3>No Active Shops in Database</h3>
              <p className="placeholder-text">
                Click "Seed 4 Demo Stores" above or approve pending shopkeeper applications to create active shop records in PostgreSQL.
              </p>
            </div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Shop Name</th>
                    <th>Business Phone</th>
                    <th>Location</th>
                    <th>Owner User ID</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shops.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        {s.description && (
                          <div style={{ fontSize: '0.775rem', color: 'var(--color-text-muted)', marginTop: '0.2rem', maxWidth: '300px' }}>
                            {s.description}
                          </div>
                        )}
                      </td>
                      <td>{s.business_phone}</td>
                      <td>
                        {s.city}, {s.state} - {s.pincode}
                      </td>
                      <td>
                        <code>{s.owner_id}</code>
                      </td>
                      <td>
                        <span className="badge-status badge-approved">
                          {s.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div>
          {loading ? (
            <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
              <p>Loading applications...</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="placeholder-card" style={{ margin: 0 }}>
              <div className="placeholder-icon">📋</div>
              <h3>No Applications Found</h3>
              <p className="placeholder-text">
                {activeFilter === 'PENDING'
                  ? 'There are currently no pending shopkeeper applications waiting for review.'
                  : `No applications match the "${activeFilter}" filter.`}
              </p>
            </div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Shop Name</th>
                    <th>Applicant Details</th>
                    <th>Location</th>
                    <th>Submitted On</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id}>
                      <td>
                        <strong>{app.shop_name}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                          Phone: {app.shop_phone}
                        </div>
                      </td>
                      <td>
                        <div>{app.applicant_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{app.applicant_email}</div>
                      </td>
                      <td>
                        {app.city}, {app.state}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.825rem' }}>
                          {new Date(app.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge-status ${
                            app.status === 'APPROVED'
                              ? 'badge-approved'
                              : app.status === 'REJECTED'
                              ? 'badge-rejected'
                              : 'badge-pending'
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleOpenReview(app.id)}
                          className="button button-sm button-secondary"
                        >
                          Review →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* APPLICATION REVIEW MODAL                                  */}
      {/* ========================================================= */}
      {selectedApp && (
        <div className="modal-backdrop" onClick={() => setSelectedApp(null)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ margin: 0, fontSize: '1.35rem', color: 'var(--color-brown-900)' }}>
                  {selectedApp.shop_name}
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Application ID: <code>{selectedApp.id}</code>
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span
                  className={`badge-status ${
                    selectedApp.status === 'APPROVED'
                      ? 'badge-approved'
                      : selectedApp.status === 'REJECTED'
                      ? 'badge-rejected'
                      : 'badge-pending'
                  }`}
                >
                  {selectedApp.status}
                </span>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setSelectedApp(null)}
                  aria-label="Close modal"
                >
                  ×
                </button>
              </div>
            </div>

            {actionFeedback && (
              <div
                className={`alert ${actionFeedback.type === 'success' ? 'alert-success' : 'alert-error'}`}
                style={{ marginBottom: '1.25rem' }}
              >
                <span className="alert-icon">{actionFeedback.type === 'success' ? '✓' : '⚠️'}</span>
                <span>{actionFeedback.message}</span>
              </div>
            )}

            {/* Applicant & Shop Details Grid */}
            <div className="modal-details-grid">
              <div className="modal-detail-block">
                <div className="modal-detail-label">Applicant Information</div>
                <div className="modal-detail-value">{selectedApp.applicant_name}</div>
                <div className="modal-detail-subtext">{selectedApp.applicant_email}</div>
                {selectedApp.applicant_phone && (
                  <div className="modal-detail-subtext">Phone: {selectedApp.applicant_phone}</div>
                )}
                <div className="modal-detail-subtext" style={{ marginTop: '0.4rem' }}>
                  User ID: <code>{selectedApp.user_id}</code>
                </div>
              </div>

              <div className="modal-detail-block">
                <div className="modal-detail-label">Store Location & Phone</div>
                <div className="modal-detail-value">{selectedApp.shop_phone}</div>
                <div className="modal-detail-subtext">{selectedApp.shop_address}</div>
                <div className="modal-detail-subtext">
                  {selectedApp.city}, {selectedApp.state} - {selectedApp.pincode}
                </div>
              </div>
            </div>

            {selectedApp.shop_description && (
              <div style={{ background: 'var(--color-surface-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem', border: '1px solid var(--color-border-subtle)', marginBottom: '1.25rem' }}>
                <div className="modal-detail-label">Shop Description</div>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-body)', lineHeight: 1.5 }}>
                  {selectedApp.shop_description}
                </p>
              </div>
            )}

            {/* Verification Documents & Photos (Authorized Access) */}
            <div style={{ background: '#FAF7F2', borderRadius: 'var(--radius-md)', padding: '1.25rem', border: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
              <div className="modal-detail-label" style={{ marginBottom: '0.75rem' }}>
                🔒 Verification Documents (Private Storage / Authorized Access)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Shop Photo */}
                <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>Storefront Photo:</div>
                  {selectedApp.authorized_photo_url ? (
                    <div>
                      <img
                        src={selectedApp.authorized_photo_url}
                        alt="Storefront"
                        style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: 'var(--radius-xs)', marginBottom: '0.4rem' }}
                      />
                      <a
                        href={selectedApp.authorized_photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="button button-sm button-secondary"
                        style={{ display: 'inline-block', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      >
                        View Full Photo ↗
                      </a>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>No photo uploaded.</div>
                  )}
                </div>

                {/* Registration Document */}
                <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>Supporting Document:</div>
                  {selectedApp.authorized_document_url ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>📄</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-body)' }}>Attached Document</span>
                      </div>
                      <a
                        href={selectedApp.authorized_document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="button button-sm button-secondary"
                        style={{ display: 'inline-block', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      >
                        View Document (Authorized) ↗
                      </a>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>No document uploaded.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Application Status Information & Review Controls */}
            {selectedApp.status === 'APPROVED' && (
              <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
                <span className="alert-icon">✓</span>
                <div>
                  <strong>Approved & Activated</strong>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                    Reviewed by <code>{selectedApp.reviewed_by || 'Admin'}</code> on{' '}
                    {selectedApp.reviewed_at ? new Date(selectedApp.reviewed_at).toLocaleString() : 'N/A'}. User is now a
                    SHOPKEEPER.
                  </div>
                </div>
              </div>
            )}

            {selectedApp.status === 'REJECTED' && (
              <div className="status-rejection-banner" style={{ margin: '0 0 1.25rem 0' }}>
                <h4>Application Rejected</h4>
                <p>
                  <strong>Reason:</strong> "{selectedApp.rejection_reason || 'No reason specified'}"
                </p>
                <div style={{ fontSize: '0.8rem', marginTop: '0.4rem', opacity: 0.85 }}>
                  Reviewed by <code>{selectedApp.reviewed_by || 'Admin'}</code> on{' '}
                  {selectedApp.reviewed_at ? new Date(selectedApp.reviewed_at).toLocaleString() : 'N/A'}. User remains a
                  CUSTOMER.
                </div>
              </div>
            )}

            {/* Rejection Dialog Form */}
            {rejecting && (
              <form onSubmit={handleReject} style={{ background: '#FFF5F5', border: '1px solid var(--color-error-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-error-text)', fontSize: '0.95rem' }}>
                  Provide Reason for Rejection *
                </h4>
                <p style={{ fontSize: '0.825rem', color: 'var(--color-text-body)', margin: '0 0 0.75rem 0' }}>
                  This reason will be displayed to the customer on their dashboard so they can understand what details or documents to correct before reapplying.
                </p>
                <textarea
                  rows={3}
                  placeholder="e.g. The uploaded registration certificate is illegible. Please re-upload a clear copy."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                  style={{ width: '100%', marginBottom: '0.75rem' }}
                />
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setRejecting(false)}
                    className="button button-sm button-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button button-sm button-danger"
                    disabled={actionLoading || !rejectionReason.trim()}
                  >
                    {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                  </button>
                </div>
              </form>
            )}

            {/* Review Action Buttons (Only allowed for PENDING) */}
            {selectedApp.status === 'PENDING' && !rejecting && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setRejecting(true)}
                  className="button button-secondary"
                  style={{ color: 'var(--color-error)' }}
                  disabled={actionLoading}
                >
                  ✕ Reject with Reason
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  className="button button-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Approving...' : '✓ Approve & Create Shop'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
