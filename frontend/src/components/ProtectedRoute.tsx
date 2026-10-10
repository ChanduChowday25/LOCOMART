import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: 'CUSTOMER' | 'SHOPKEEPER' | 'ADMIN';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRole }) => {
  const { user, token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', color: '#94a3b8' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
          <p>Verifying authentication session...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    // Redirect unauthenticated user to login with the portal they tried to access
    const portal = allowedRole ? allowedRole.toLowerCase() : 'customer';
    return <Navigate to={`/login?portal=${portal}`} state={{ from: location }} replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    // Role mismatch
    return (
      <div className="container" style={{ padding: '3rem 1.5rem', maxWidth: '650px', margin: '0 auto' }}>
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '0.75rem' }}>Access Denied (403 Forbidden)</h2>
          <p style={{ color: '#94a3b8', marginBottom: '1.25rem' }}>
            Your account is authenticated as <strong>{user.role}</strong>, but this page requires <strong>{allowedRole}</strong> privileges.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {user.role === 'CUSTOMER' && (
              <a href="/customer" className="button button-primary">Go to Customer Portal</a>
            )}
            {user.role === 'SHOPKEEPER' && (
              <a href="/shopkeeper" className="button button-primary">Go to Shopkeeper Portal</a>
            )}
            {user.role === 'ADMIN' && (
              <a href="/admin" className="button button-primary">Go to Admin Portal</a>
            )}
            <a href="/login" className="button button-secondary">Switch Account</a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
