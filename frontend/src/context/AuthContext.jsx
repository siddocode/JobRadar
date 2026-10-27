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

  // Candidate Profile State (cached in localStorage ONLY if user is logged in)
  const [candidateProfile, setCandidateProfile] = useState(() => {
    try {
      const authToken = localStorage.getItem('jobradar_auth_token');
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

    if (token && newProfile) {
      try {
        await fetch('/api/auth/candidate-profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
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
      localStorage.removeItem('jobradar_candidate_profile');
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
          localStorage.removeItem('jobradar_auth_token');
          localStorage.removeItem('jobradar_candidate_profile');
          setToken(null);
          setUser(null);
          setCandidateProfile(null);
        }
      } else {
        localStorage.removeItem('jobradar_auth_token');
        localStorage.removeItem('jobradar_candidate_profile');
        setToken(null);
        setUser(null);
        setCandidateProfile(null);
      }
    } catch (err) {
      console.error('Failed to load current user:', err);
      localStorage.removeItem('jobradar_auth_token');
      localStorage.removeItem('jobradar_candidate_profile');
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
    setCandidateProfile(null);
    localStorage.removeItem('jobradar_candidate_profile');
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

  // Logout - completely wipe token, user, and all cached candidate CV/URL data
  const logout = () => {
    localStorage.removeItem('jobradar_auth_token');
    localStorage.removeItem('jobradar_candidate_profile');
    setToken(null);
    setUser(null);
    setCandidateProfile(null);
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
