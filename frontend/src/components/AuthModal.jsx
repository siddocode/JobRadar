import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthModal() {
  const {
    authModalOpen,
    authModalReason,
    authModalTab,
    closeAuthModal,
    setAuthModalTab,
    checkEmail,
    requestOtp,
    register,
    login,
    loginWithOtp
  } = useAuth();

  const [tab, setTab] = useState(authModalTab || 'signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Email availability check states
  const [isEmailRegistered, setIsEmailRegistered] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  // OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Sign in mode: 'password' | 'otp'
  const [signInMode, setSignInMode] = useState('password');

  // Submit states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const modalRef = useRef(null);

  useEffect(() => {
    if (authModalTab) {
      setTab(authModalTab);
    }
  }, [authModalTab]);

  useEffect(() => {
    // Reset fields on modal open/close
    if (authModalOpen) {
      setError(null);
      setSuccessMsg(null);
      setIsEmailRegistered(false);
    } else {
      setOtpSent(false);
      setOtpSentMessage('');
      setOtp('');
      setError(null);
      setSuccessMsg(null);
      setIsEmailRegistered(false);
      setIsCheckingEmail(false);
    }
  }, [authModalOpen]);

  // Handle countdown timer for OTP resend
  useEffect(() => {
    let timer;
    if (otpCooldown > 0) {
      timer = setTimeout(() => setOtpCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  // Check email availability in signup mode as user enters email
  const verifyEmailAvailability = async (targetEmail) => {
    if (!targetEmail || !targetEmail.includes('@') || targetEmail.length < 5 || tab !== 'signup') {
      setIsEmailRegistered(false);
      return;
    }
    setIsCheckingEmail(true);
    try {
      const res = await checkEmail(targetEmail);
      if (res.exists) {
        setIsEmailRegistered(true);
        setError('An account with this email already exists. Please sign in instead.');
      } else {
        setIsEmailRegistered(false);
        if (error && error.includes('already exists')) {
          setError(null);
        }
      }
    } catch (err) {
      console.warn('Check email error:', err);
    } finally {
      setIsCheckingEmail(false);
    }
  };

  // Debounced check while typing in registration mode
  useEffect(() => {
    if (tab !== 'signup' || !email.includes('@') || email.length < 5) {
      setIsEmailRegistered(false);
      return;
    }
    const timer = setTimeout(() => {
      verifyEmailAvailability(email);
    }, 450);
    return () => clearTimeout(timer);
  }, [email, tab]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && authModalOpen) {
        closeAuthModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authModalOpen, closeAuthModal]);

  if (!authModalOpen) return null;

  // Helper to send OTP
  const handleSendOtp = async (targetEmail = email) => {
    if (!targetEmail || !targetEmail.includes('@')) {
      setError('Please enter a valid email address first');
      return;
    }

    if (tab === 'signup') {
      setIsCheckingEmail(true);
      const checkRes = await checkEmail(targetEmail);
      setIsCheckingEmail(false);
      if (checkRes.exists) {
        setIsEmailRegistered(true);
        setError('An account with this email already exists. Please sign in instead.');
        return;
      }
    }

    setIsSendingOtp(true);
    setError(null);
    try {
      const data = await requestOtp(targetEmail, tab === 'signup' ? 'register' : 'login');
      setOtpSent(true);
      setOtpSentMessage(data.message || `Verification code sent to ${targetEmail}`);
      setOtpCooldown(30);
    } catch (err) {
      if (err.exists) {
        setIsEmailRegistered(true);
      }
      setError(err.message || 'Failed to send verification code');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === 'signup') {
        if (!email.trim() || !password || !otp.trim()) {
          throw new Error('Please fill in email, password, and the 6-digit verification code');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
        await register({ email: email.trim(), password, name: name.trim(), otp: otp.trim() });
      } else {
        // Sign In
        if (signInMode === 'password') {
          if (!email.trim() || !password) {
            throw new Error('Please provide your email and password');
          }
          await login({ email: email.trim(), password });
        } else {
          // Sign In with OTP
          if (!email.trim() || !otp.trim()) {
            throw new Error('Please enter your email and the 6-digit OTP code');
          }
          await loginWithOtp({ email: email.trim(), otp: otp.trim() });
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={closeAuthModal} role="dialog" aria-modal="true">
      <div
        className="auth-modal-content"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          className="auth-modal-close"
          onClick={closeAuthModal}
          title="Close (Esc)"
          aria-label="Close modal"
        >
          ×
        </button>

        {/* Modal Header */}
        <div className="auth-modal-header">
          <div className="auth-brand-badge">
            <span>JobRadar Auth</span>
          </div>
          <h2 className="auth-modal-title">
            {tab === 'signup' ? 'Create your account' : 'Sign in to JobRadar'}
          </h2>
          <p className="auth-modal-subtitle">
            {tab === 'signup'
              ? 'Access your outreach pipeline, track target companies, and draft tailored recruiter emails.'
              : 'Sign in to access your personal outreach pipeline, tracked companies, and notes.'}
          </p>
        </div>

        {/* Reason Banner (if triggered by protected action) */}
        {authModalReason && (
          <div className="auth-reason-banner">
            <span className="auth-reason-text">{authModalReason}</span>
          </div>
        )}

        {/* Verification Code Status Banner */}
        {otpSent && (
          <div className="auth-email-sent-alert" id="auth-otp-top-banner">
            <div className="auth-email-sent-badge">
              <span className="auth-email-sent-dot"></span>
              <span>Verification Code Sent</span>
            </div>
            <p className="auth-email-sent-message">
              We sent a 6-digit verification code to <strong>{email || 'your email'}</strong>. Please check your inbox (and spam folder) and enter it below.
            </p>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="auth-tab-bar">
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setTab('signup');
              setError(null);
            }}
          >
            Create Account
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => {
              setTab('login');
              setError(null);
            }}
          >
            Sign In
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="auth-form-body">
          {error && (
            <div className="auth-error-alert">
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="auth-success-alert">
              <span>{successMsg}</span>
            </div>
          )}

          {/* SIGN UP FIELDS */}
          {tab === 'signup' && (
            <>
              <div className="auth-field-group">
                <label className="auth-label" htmlFor="auth-name-input">Your Name (Optional)</label>
                <input
                  type="text"
                  id="auth-name-input"
                  className="auth-input"
                  placeholder="e.g. Aditi Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="auth-field-group">
                <div className="auth-label-row">
                  <label className="auth-label" htmlFor="auth-email-input">Email Address</label>
                  {otpCooldown > 0 ? (
                    <span className="otp-cooldown-text">Resend in {otpCooldown}s</span>
                  ) : (
                    <button
                      type="button"
                      className="auth-text-action-btn"
                      onClick={() => handleSendOtp(email)}
                      disabled={isSendingOtp || !email.includes('@') || isEmailRegistered || isCheckingEmail}
                      title={isEmailRegistered ? 'Email already registered. Please sign in.' : undefined}
                    >
                      {isCheckingEmail ? 'Checking...' : (isSendingOtp ? 'Sending...' : (otpSent ? 'Resend Code' : 'Get Verification Code'))}
                    </button>
                  )}
                </div>
                <input
                  type="email"
                  id="auth-email-input"
                  className={`auth-input ${isEmailRegistered ? 'auth-input-warning' : ''}`}
                  placeholder="name@company.com or personal email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (isEmailRegistered) setIsEmailRegistered(false);
                    if (error) setError(null);
                  }}
                  onBlur={() => {
                    if (tab === 'signup' && email.includes('@') && email.length > 5) {
                      verifyEmailAvailability(email);
                    }
                  }}
                />
                {isEmailRegistered && (
                  <div className="auth-email-exists-box">
                    <div className="auth-email-exists-content">
                      <span className="auth-email-exists-dot"></span>
                      <span className="auth-email-exists-msg">
                        This email is already registered.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="auth-switch-tab-quick-btn"
                      onClick={() => {
                        setTab('login');
                        setIsEmailRegistered(false);
                        setError(null);
                      }}
                    >
                      Sign In &rarr;
                    </button>
                  </div>
                )}
              </div>

              {/* 6-Digit OTP Input */}
              <div className="auth-field-group">
                <div className="auth-label-row">
                  <label className="auth-label" htmlFor="auth-otp-input">
                    6-Digit Verification Code
                  </label>
                  {!otpSent ? (
                    <span className="auth-hint-text">Click "Get Verification Code" above</span>
                  ) : (
                    <span className="auth-hint-text" style={{ color: '#059669', fontWeight: 600 }}>Sent to inbox</span>
                  )}
                </div>
                <div className="auth-otp-input-wrapper">
                  <input
                    type="text"
                    id="auth-otp-input"
                    className="auth-input otp-input"
                    placeholder="Enter 6-digit OTP code"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    autoComplete="one-time-code"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="auth-field-group">
                <div className="auth-label-row">
                  <label className="auth-label" htmlFor="auth-password-input">Password (min 6 characters)</label>
                  <button
                    type="button"
                    className="auth-text-action-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="auth-password-input"
                  className="auth-input"
                  placeholder="Choose a secure password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading || isEmailRegistered}
                id="auth-signup-submit"
              >
                {loading ? 'Creating Account...' : 'Create Account & Verify'}
              </button>
            </>
          )}

          {/* SIGN IN FIELDS */}
          {tab === 'login' && (
            <>
              <div className="auth-field-group">
                <label className="auth-label" htmlFor="login-email-input">Email Address</label>
                <input
                  type="email"
                  id="login-email-input"
                  className="auth-input"
                  placeholder="Your registered email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {signInMode === 'password' ? (
                <div className="auth-field-group">
                  <div className="auth-label-row">
                    <label className="auth-label" htmlFor="login-password-input">Password</label>
                    <button
                      type="button"
                      className="auth-text-action-btn"
                      onClick={() => setSignInMode('otp')}
                    >
                      Sign in with OTP instead
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="login-password-input"
                    className="auth-input"
                    placeholder="Enter your password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              ) : (
                <div className="auth-field-group">
                  <div className="auth-label-row">
                    <label className="auth-label" htmlFor="login-otp-input">6-Digit Verification Code</label>
                    {otpCooldown > 0 ? (
                      <span className="otp-cooldown-text">Resend in {otpCooldown}s</span>
                    ) : (
                      <button
                        type="button"
                        className="auth-text-action-btn"
                        onClick={() => handleSendOtp(email)}
                        disabled={isSendingOtp || !email.includes('@')}
                      >
                        {isSendingOtp ? 'Sending...' : (otpSent ? 'Resend Code' : 'Get Code')}
                      </button>
                    )}
                  </div>
                  <div className="auth-otp-input-wrapper">
                    <input
                      type="text"
                      id="login-otp-input"
                      className="auth-input otp-input"
                      placeholder="Enter 6-digit OTP code"
                      maxLength={6}
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                  <div style={{ marginTop: '6px', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="auth-text-action-btn"
                      onClick={() => setSignInMode('password')}
                    >
                      Use Password instead
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading}
                id="auth-login-submit"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </>
          )}
        </form>

        {/* Modal Footer */}
        <div className="auth-modal-footer">
          <p className="auth-footer-text">
            {tab === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => {
                    setTab('login');
                    setError(null);
                  }}
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Need an account?{' '}
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => {
                    setTab('signup');
                    setError(null);
                  }}
                >
                  Create free account
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
