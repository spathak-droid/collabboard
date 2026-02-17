/**
 * Signup Form Component with TDD
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signUp, signInWithGoogle } from '@/lib/firebase/auth';

const EyeIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

export const SignupForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const isEmailInvalid = emailTouched && email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isConfirmMismatch = confirmTouched && confirmPassword.length > 0 && password !== confirmPassword;
  
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }
    
    try {
      await signUp(email, password, displayName);
      const verifyUrl = returnUrl ? `/verify-email?returnUrl=${encodeURIComponent(returnUrl)}` : '/verify-email';
      router.push(verifyUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };
  
  const handleGoogleSignup = async () => {
    setError('');
    setLoading(true);
    
    try {
      await signInWithGoogle();
      router.push(returnUrl || '/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign up with Google');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="glass-panel w-full max-w-md rounded-3xl p-7 shadow-[0_28px_80px_-40px_rgba(0,61,130,0.55)]">
      <h2 className="mb-1 text-center text-3xl font-bold text-slate-900">Create Account</h2>
      <p className="mb-6 text-center text-sm text-slate-600">Launch your first board in seconds</p>
      
      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label htmlFor="displayName" className="mb-1 block text-sm font-medium text-slate-700">
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl border border-cyan-100 bg-white/80 px-3 py-2.5 text-slate-900 outline-none transition-all focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
            required
            disabled={loading}
          />
        </div>
        
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            className={`w-full rounded-xl border bg-white/80 px-3 py-2.5 text-slate-900 outline-none transition-all ${
              isEmailInvalid
                ? 'border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100'
                : 'border-cyan-100 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
            }`}
            required
            disabled={loading}
          />
          {isEmailInvalid && (
            <p className="mt-1 text-xs text-rose-500">Please enter a valid email address</p>
          )}
        </div>
        
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-cyan-100 bg-white/80 px-3 py-2.5 pr-10 text-slate-900 outline-none transition-all focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
              required
              disabled={loading}
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Minimum 6 characters</p>
        </div>
        
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700">
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setConfirmTouched(true)}
              className={`w-full rounded-xl border bg-white/80 px-3 py-2.5 pr-10 text-slate-900 outline-none transition-all ${
                isConfirmMismatch
                  ? 'border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100'
                  : 'border-cyan-100 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
              }`}
              required
              disabled={loading}
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              tabIndex={-1}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {isConfirmMismatch && (
            <p className="mt-1 text-xs text-rose-500">Passwords do not match</p>
          )}
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 py-2.5 font-semibold text-white shadow-md shadow-cyan-200 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>
      
      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-[var(--surface)] px-2 text-slate-500">Or continue with</span>
          </div>
        </div>
        
        <div className="mt-4 space-y-2">
          <button
            onClick={handleGoogleSignup}
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 bg-white/90 px-4 py-2.5 text-slate-700 transition-colors hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.655 32.657 29.196 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.955 3.045l5.657-5.657C34.051 6.054 29.279 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 13 24 13c3.059 0 5.842 1.154 7.955 3.045l5.657-5.657C34.051 6.054 29.279 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.176 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.15 35.091 26.715 36 24 36c-5.176 0-9.621-3.326-11.289-7.957l-6.522 5.025C9.5 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.02 12.02 0 01-4.084 5.571l.003-.002 6.19 5.238C36.971 39.18 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
            Sign up with Google
            </span>
          </button>
          
        </div>
      </div>
      
      <div className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <a href={returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : '/login'} className="font-semibold text-cyan-700 hover:text-cyan-900">
          Login
        </a>
      </div>
    </div>
  );
};
