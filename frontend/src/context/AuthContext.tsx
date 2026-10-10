import React, { createContext, useContext, useEffect, useState } from 'react';
import { insforge } from '../api/insforge';
import type {
  UserProfile,
  ProfileUpdatePayload,
} from '../api/client';
import {
  syncUserWithBackend,
  getCurrentUserFromBackend,
  verifyRoleWithBackend,
  updateProfile as updateProfileApi,
} from '../api/client';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string, portalRole: 'CUSTOMER' | 'SHOPKEEPER' | 'ADMIN') => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  verifyEmail: (email: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: (portalRole: 'CUSTOMER' | 'SHOPKEEPER' | 'ADMIN') => Promise<void>;
  signOut: () => Promise<void>;
  updateCustomerProfile: (data: ProfileUpdatePayload) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
  sendResetPasswordEmail: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  resetPassword: (newPassword: string, token: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  setSession: (token: string, user: UserProfile) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'locomart_access_token';
const PENDING_ROLE_KEY = 'locomart_pending_portal_role';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const setSession = (newToken: string, newUser: UserProfile) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  };

  // Initialize and verify session on mount
  useEffect(() => {
    async function initSession() {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (storedToken) {
        try {
          const res = await getCurrentUserFromBackend(storedToken);
          setUser(res.user);
          setToken(storedToken);
        } catch {
          // Token expired or invalid
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    }
    initSession();
  }, []);

  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await getCurrentUserFromBackend(token);
      setUser(res.user);
    } catch {
      // Ignored
    }
  };

  const signIn = async (
    email: string,
    password: string,
    portalRole: 'CUSTOMER' | 'SHOPKEEPER' | 'ADMIN'
  ): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error: authError } = await insforge.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authError || !data?.accessToken) {
        let msg = authError?.message || 'Invalid email or password.';
        if (msg === 'Failed to fetch') {
          msg = 'Unable to connect to the authentication server. Please check your connection and try again.';
        }
        setError(msg);
        return { success: false, error: msg };
      }

      const accessToken = data.accessToken;

      // Backend role verification & synchronization (authoritative check)
      const verifyRes = await verifyRoleWithBackend(accessToken, portalRole);
      if (!verifyRes.allowed || !verifyRes.user) {
        // Sign out from InsForge session to avoid leaving an unauthorized state
        await insforge.auth.signOut();
        const msg = verifyRes.message || 'Access denied for the selected portal.';
        setError(msg);
        return { success: false, error: msg };
      }

      // verifyRoleWithBackend already synchronized user with public.users and returned authoritative profile
      localStorage.setItem(TOKEN_KEY, accessToken);
      setToken(accessToken);
      setUser(verifyRes.user);

      return { success: true };
    } catch (err: any) {
      let msg = err?.message || 'Login failed. Please try again.';
      if (msg === 'Failed to fetch') {
        msg = 'Unable to connect to the LOCOMART backend. Please check your connection and try again.';
      }
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    name: string
  ): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim();
      const { data, error: regError } = await insforge.auth.signUp({
        email: cleanEmail,
        password,
        name: cleanName,
      });

      if (regError) {
        let msg = regError.message || 'Registration failed.';
        if (msg === 'Failed to fetch') {
          msg = 'Unable to connect to the authentication server. Please check your connection and try again.';
        }
        setError(msg);
        return { success: false, error: msg };
      }

      // If accessToken is directly available
      let accessToken = data?.accessToken;
      if (!accessToken) {
        // Fallback sign in to retrieve token
        const loginRes = await insforge.auth.signInWithPassword({ email: cleanEmail, password });
        accessToken = loginRes.data?.accessToken;
      }

      if (accessToken) {
        const syncRes = await syncUserWithBackend(accessToken);
        localStorage.setItem(TOKEN_KEY, accessToken);
        setToken(accessToken);
        setUser(syncRes.user);
        return { success: true };
      }

      return { success: true };
    } catch (err: any) {
      let msg = err?.message || 'Registration failed. Please try again.';
      if (msg === 'Failed to fetch') {
        msg = 'Unable to connect to the LOCOMART backend. Please check your connection and try again.';
      }
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const verifyEmail = async (email: string, otp: string): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error: vError } = await insforge.auth.verifyEmail({
        email: cleanEmail,
        otp: otp.trim(),
      });

      if (vError || !data?.accessToken) {
        let msg = vError?.message || 'Verification failed. Please check the code.';
        if (msg === 'Failed to fetch') {
          msg = 'Unable to connect to the authentication server. Please check your connection and try again.';
        }
        setError(msg);
        return { success: false, error: msg };
      }

      const accessToken = data.accessToken;
      const syncRes = await syncUserWithBackend(accessToken);
      localStorage.setItem(TOKEN_KEY, accessToken);
      setToken(accessToken);
      setUser(syncRes.user);

      return { success: true };
    } catch (err: any) {
      let msg = err?.message || 'Failed to verify email code. Please try again.';
      if (msg === 'Failed to fetch') {
        msg = 'Unable to connect to the LOCOMART backend. Please check your connection and try again.';
      }
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const signInWithGoogle = async (portalRole: 'CUSTOMER' | 'SHOPKEEPER' | 'ADMIN') => {
    localStorage.setItem(PENDING_ROLE_KEY, portalRole);
    await insforge.auth.signInWithOAuth('google', {
      redirectTo: `${window.location.origin}/auth/callback`,
      additionalParams: { prompt: 'select_account' },
    });
  };

  const signOut = async () => {
    try {
      await insforge.auth.signOut();
    } catch {
      // Ignored
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PENDING_ROLE_KEY);
    setToken(null);
    setUser(null);
  };

  const updateCustomerProfile = async (
    data: ProfileUpdatePayload
  ): Promise<{ success: boolean; error?: string }> => {
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }
    try {
      const res = await updateProfileApi(token, data);
      setUser(res.profile);
      return { success: true };
    } catch (err: any) {
      const msg = err.message || 'Failed to update profile.';
      return { success: false, error: msg };
    }
  };

  const sendResetPasswordEmail = async (
    email: string
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const redirectTo = `${window.location.origin}/reset-password`;
      const { data, error: authError } = await insforge.auth.sendResetPasswordEmail({
        email: cleanEmail,
        redirectTo,
      });

      if (authError) {
        let msg = authError.message || 'Failed to send password reset email.';
        if (msg === 'Failed to fetch') {
          msg = 'Unable to connect to the authentication server. Please check your connection and try again.';
        }
        setError(msg);
        return { success: false, error: msg };
      }

      return {
        success: true,
        message: data?.message || 'If your email is registered, we have sent you a password reset link. Please check your inbox.',
      };
    } catch (err: any) {
      const msg = err?.message || 'Failed to request password reset.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const resetPassword = async (
    newPassword: string,
    token: string
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    setError(null);
    try {
      const { data, error: authError } = await insforge.auth.resetPassword({
        newPassword,
        otp: token,
      });

      if (authError) {
        let msg = authError.message || 'Failed to reset password.';
        if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')) {
          msg = 'This password reset link is invalid or has expired. Please request a new reset link.';
        }
        setError(msg);
        return { success: false, error: msg };
      }

      return {
        success: true,
        message: data?.message || 'Your password has been reset successfully.',
      };
    } catch (err: any) {
      const msg = err?.message || 'Failed to reset password.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        signIn,
        signUp,
        verifyEmail,
        signInWithGoogle,
        signOut,
        updateCustomerProfile,
        refreshUser,
        clearError,
        sendResetPasswordEmail,
        resetPassword,
        setSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
