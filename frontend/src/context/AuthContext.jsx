import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('jobradar_auth_token') || null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal control
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState('');
  const [authModalTab, setAuthModalTab] = useState('signup'); // 'signup' | 'login'

  const openAuthModal = useCallback((reason = '', defaultTab = 'signup') => {
    setAuthModalReason(reason);
    setAuthModalTab(defaultTab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    setAuthModalReason('');
  }, []);

  // Fetch current user if token exists on load
  const loadCurrentUser = useCallback(async (authToken) => {
    if (!authToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
        } else {
          // Token invalid
          localStorage.removeItem('jobradar_auth_token');
          setToken(null);
          setUser(null);
        }
      } else {
        localStorage.removeItem('jobradar_auth_token');
        setToken(null);
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to load current user:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadCurrentUser(token);
    } else {
      setLoading(false);
    }
  }, [token, loadCurrentUser]);

  // Request email OTP (mock display for now until real SMTP)
  const requestOtp = async (email) => {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to generate verification code');
    }
    return data; // contains devOtp, email, message
  };

  // Register with email, password, and OTP
  const register = async ({ email, password, name, otp }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, otp })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Registration failed');
    }

    localStorage.setItem('jobradar_auth_token', data.token);
    setToken(data.token);
    setUser(data.user);
    closeAuthModal();
    return data;
  };

  // Login with email and password
  const login = async ({ email, password }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('jobradar_auth_token', data.token);
    setToken(data.token);
    setUser(data.user);
    closeAuthModal();
    return data;
  };

  // Login with OTP
  const loginWithOtp = async ({ email, otp }) => {
    const res = await fetch('/api/auth/login-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'OTP login failed');
    }

    localStorage.setItem('jobradar_auth_token', data.token);
    setToken(data.token);
    setUser(data.user);
    closeAuthModal();
    return data;
  };

  // Logout
  const logout = () => {
    localStorage.removeItem('jobradar_auth_token');
    setToken(null);
    setUser(null);
  };

  // Authenticated fetch wrapper
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      // Session expired or unauthenticated
      logout();
      openAuthModal('Please sign in or create an account to perform this action.');
    }

    return res;
  }, [token, openAuthModal]);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(user && token),
    authModalOpen,
    authModalReason,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    setAuthModalTab,
    requestOtp,
    register,
    login,
    loginWithOtp,
    logout,
    authFetch
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
