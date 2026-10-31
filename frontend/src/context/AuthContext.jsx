import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const AUTH_COOKIE_NAME = 'jobradar_auth_token';

function getAuthCookie() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + AUTH_COOKIE_NAME + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function setAuthCookie(token, days = 7) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
  try {
    localStorage.setItem(AUTH_COOKIE_NAME, token);
  } catch (_) {}
}

function removeAuthCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${AUTH_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  try {
    localStorage.removeItem(AUTH_COOKIE_NAME);
  } catch (_) {}
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    // 1. Check cookies first
    const cookieToken = getAuthCookie();
    if (cookieToken) return cookieToken;

    // 2. Check localStorage backup
    try {
      const stored = localStorage.getItem(AUTH_COOKIE_NAME);
      if (stored) return stored;
    } catch (_) {}
    return null;
  });

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

  // Candidate Profile State (cached in localStorage ONLY if user is logged in via cookie)
  const [candidateProfile, setCandidateProfile] = useState(() => {
    try {
      const authToken = getAuthCookie();
      if (!authToken) {
        // User is not logged in: wipe any cached candidate profile
        localStorage.removeItem('jobradar_candidate_profile');
        return null;
      }
      const saved = localStorage.getItem('jobradar_candidate_profile');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // Auto-correct stale legacy bug where candidate with ~8-10 months of experience got saved as 8 years
      if (
        parsed &&
        parsed.totalYearsExperience === 8 &&
        (!parsed.experienceMonths || parsed.experienceMonths === 0) &&
        (parsed.isFresher !== undefined || (parsed.education && /202[0-9]/i.test(parsed.education)))
      ) {
        parsed.totalYearsExperience = 0;
        parsed.experienceMonths = 8;
        parsed.totalExperienceMonths = 8;
        parsed.experienceDisplay = '8 Months';
        parsed.isFresher = false;
        parsed.seniorityLevel = 'Early Career (< 1 Year, 8 Months)';
        localStorage.setItem('jobradar_candidate_profile', JSON.stringify(parsed));
      }
      return parsed;
    } catch (_) {
      return null;
    }
  });

  const updateCandidateProfile = useCallback(async (newProfile) => {
    setCandidateProfile(newProfile);
    try {
      if (newProfile) {
        localStorage.setItem('jobradar_candidate_profile', JSON.stringify(newProfile));
      } else {
        localStorage.removeItem('jobradar_candidate_profile');
      }
    } catch (_) {}

    const currentToken = token || getAuthCookie();
    if (currentToken && newProfile) {
      try {
        await fetch('/api/auth/candidate-profile', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({ candidateProfile: newProfile })
        });
      } catch (err) {
        console.warn('Could not sync candidate profile to server:', err);
      }
    }
  }, [token]);

  const clearCandidateProfile = useCallback(() => {
    setCandidateProfile(null);
    try {
      localStorage.removeItem('jobradar_candidate_profile');
    } catch (_) {}
  }, []);

  // Fetch current user if token exists on load
  const loadCurrentUser = useCallback(async (authToken) => {
    if (!authToken) {
      setUser(null);
      setCandidateProfile(null);
      try { localStorage.removeItem('jobradar_candidate_profile'); } catch (_) {}
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
          if (data.user.candidateProfile) {
            setCandidateProfile(data.user.candidateProfile);
            try {
              localStorage.setItem('jobradar_candidate_profile', JSON.stringify(data.user.candidateProfile));
            } catch (_) {}
          } else {
            setCandidateProfile(null);
            try {
              localStorage.removeItem('jobradar_candidate_profile');
            } catch (_) {}
          }
        } else {
          // Token invalid
          removeAuthCookie();
          try {
            localStorage.removeItem(AUTH_COOKIE_NAME);
            localStorage.removeItem('jobradar_candidate_profile');
          } catch (_) {}
          setToken(null);
          setUser(null);
          setCandidateProfile(null);
        }
      } else {
        removeAuthCookie();
        try {
          localStorage.removeItem(AUTH_COOKIE_NAME);
          localStorage.removeItem('jobradar_candidate_profile');
        } catch (_) {}
        setToken(null);
        setUser(null);
        setCandidateProfile(null);
      }
    } catch (err) {
      console.error('Failed to load current user:', err);
      removeAuthCookie();
      try {
        localStorage.removeItem(AUTH_COOKIE_NAME);
        localStorage.removeItem('jobradar_candidate_profile');
      } catch (_) {}
      setToken(null);
      setUser(null);
      setCandidateProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadCurrentUser(token);
    } else {
      setUser(null);
      setCandidateProfile(null);
      try {
        localStorage.removeItem('jobradar_candidate_profile');
      } catch (_) {}
      setLoading(false);
    }
  }, [token, loadCurrentUser]);

  // Check if email already exists
  const checkEmail = useCallback(async (email) => {
    if (!email || !email.includes('@')) {
      return { success: false, exists: false };
    }
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn('Check email error:', err);
      return { success: false, exists: false };
    }
  }, []);

  // Request email OTP (calls backend which sends real email via Brevo)
  const requestOtp = async (email, purpose = 'register') => {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), purpose })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const err = new Error(data.error || 'Failed to send verification code');
      err.exists = data.exists;
      throw err;
    }
    return data;
  };

  // Register with email, password, and OTP
  const register = async ({ email, password, name, otp }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, otp })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Registration failed');
    }

    // Store in cookie and clean up legacy localStorage
    setAuthCookie(data.token);
    try { localStorage.removeItem(AUTH_COOKIE_NAME); } catch (_) {}
    setToken(data.token);
    setUser(data.user);
    setCandidateProfile(null);
    try { localStorage.removeItem('jobradar_candidate_profile'); } catch (_) {}
    closeAuthModal();
    return data;
  };

  // Login with email and password
  const login = async ({ email, password }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }

    // Store in cookie and clean up legacy localStorage
    setAuthCookie(data.token);
    try { localStorage.removeItem(AUTH_COOKIE_NAME); } catch (_) {}
    setToken(data.token);
    setUser(data.user);
    if (data.user?.candidateProfile) {
      setCandidateProfile(data.user.candidateProfile);
      try {
        localStorage.setItem('jobradar_candidate_profile', JSON.stringify(data.user.candidateProfile));
      } catch (_) {}
    } else {
      setCandidateProfile(null);
      try {
        localStorage.removeItem('jobradar_candidate_profile');
      } catch (_) {}
    }
    closeAuthModal();
    return data;
  };

  // Login with OTP
  const loginWithOtp = async ({ email, otp }) => {
    const res = await fetch('/api/auth/login-otp', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'OTP login failed');
    }

    // Store in cookie and clean up legacy localStorage
    setAuthCookie(data.token);
    try { localStorage.removeItem(AUTH_COOKIE_NAME); } catch (_) {}
    setToken(data.token);
    setUser(data.user);
    if (data.user?.candidateProfile) {
      setCandidateProfile(data.user.candidateProfile);
      try {
        localStorage.setItem('jobradar_candidate_profile', JSON.stringify(data.user.candidateProfile));
      } catch (_) {}
    } else {
      setCandidateProfile(null);
      try {
        localStorage.removeItem('jobradar_candidate_profile');
      } catch (_) {}
    }
    closeAuthModal();
    return data;
  };

  // Logout - completely wipe token cookie, user, and all cached candidate CV data
  const logout = async () => {
    removeAuthCookie();
    try {
      localStorage.removeItem(AUTH_COOKIE_NAME);
      localStorage.removeItem('jobradar_candidate_profile');
    } catch (_) {}
    setToken(null);
    setUser(null);
    setCandidateProfile(null);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) {}
  };

  // Authenticated fetch wrapper
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    const currentToken = token || getAuthCookie();
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const res = await fetch(url, {
      ...options,
      credentials: options.credentials || 'include',
      headers
    });

    if (res.status === 401) {
      // Session expired or unauthenticated
      logout();
      openAuthModal('Please sign in or create an account to perform this action.');
    }

    return res;
  }, [token, openAuthModal]);

  const isAuthenticated = Boolean(user && token);

  const value = {
    user,
    token,
    loading,
    isAuthenticated,
    authModalOpen,
    authModalReason,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    setAuthModalTab,
    checkEmail,
    requestOtp,
    register,
    login,
    loginWithOtp,
    logout,
    authFetch,
    candidateProfile: isAuthenticated ? candidateProfile : null,
    updateCandidateProfile,
    clearCandidateProfile
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
