import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { insforge } from '../api/insforge';
import { verifyRoleWithBackend } from '../api/client';
import { useAuth } from '../context/AuthContext';

export const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [statusText, setStatusText] = useState('Finalizing Google Authentication...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        const portal = (localStorage.getItem('locomart_pending_portal_role') as 'CUSTOMER' | 'SHOPKEEPER' | 'ADMIN') || 'CUSTOMER';

        // Check current session from InsForge
        setStatusText('Verifying InsForge session...');
        const { data, error } = await insforge.auth.getCurrentUser();

        if (error || !data?.user) {
          throw new Error(error?.message || 'Could not retrieve authenticated user session.');
        }

        // Get accessToken if available in session
        // If SDK stores session in memory/cookies, we retrieve the token
        // In browser apps, insforge manages httpOnly cookies or local session
        let token = localStorage.getItem('locomart_access_token');
        
        // If not in localStorage, call sync using SDK
        // Let's check token or sync directly
        if (!token) {
          // If token wasn't saved, try to get from InsForge internal session storage
          const sessionData = (insforge.auth as any).session;
          if (sessionData?.accessToken) {
            token = sessionData.accessToken;
          }
        }

        if (token) {
          // Verify role against selected portal and synchronize profile
          const verifyRes = await verifyRoleWithBackend(token, portal);
          if (!verifyRes.allowed || !verifyRes.user) {
            setErrorMsg(verifyRes.message || 'Access denied for the selected portal.');
            await insforge.auth.signOut();
            return;
          }

          // verifyRoleWithBackend already synchronized user with public.users and returned authoritative profile
          setSession(token, verifyRes.user);
        }

        // Redirect to intended portal
        if (portal === 'CUSTOMER') navigate('/customer');
        else if (portal === 'SHOPKEEPER') navigate('/shopkeeper');
        else if (portal === 'ADMIN') navigate('/admin');
        else navigate('/customer');

      } catch (err: any) {
        setErrorMsg(err.message || 'OAuth verification encountered an error.');
      }
    }

    handleCallback();
  }, [navigate, searchParams, setSession]);

  return (
    <div className="auth-page-container">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h2>Google Authentication</h2>
        {errorMsg ? (
          <div className="alert alert-error" style={{ marginTop: '1.5rem' }}>
            <span>{errorMsg}</span>
            <div style={{ marginTop: '1rem' }}>
              <a href="/login" className="button button-secondary">Return to Login</a>
            </div>
          </div>
        ) : (
          <div style={{ padding: '2rem 0' }}>
            <div className="spinner" style={{ margin: '0 auto 1.5rem auto' }}></div>
            <p style={{ color: '#94a3b8' }}>{statusText}</p>
          </div>
        )}
      </div>
    </div>
  );
};
