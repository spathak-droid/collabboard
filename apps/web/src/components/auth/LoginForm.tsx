/**
 * Login Form Component with TDD
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, signInWithGoogle, signInAsGuest, handleRedirectResult } from '@/lib/firebase/auth';

export const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Handle redirect result when returning from Google/GitHub sign-in
  useEffect(() => {
    handleRedirectResult().then((user) => {
      if (user) {
        router.push(returnUrl || '/dashboard');
      }
    });
  }, [router, returnUrl]);
  
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const user = await signIn(email, password);
      if (!user.emailVerified) {
        const verifyUrl = returnUrl ? `/verify-email?returnUrl=${encodeURIComponent(returnUrl)}` : '/verify-email';
        router.push(verifyUrl);
      } else {
        router.push(returnUrl || '/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };
  
  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    
    try {
      const user = await signInWithGoogle();
      if (user) {
        router.push(returnUrl || '/dashboard');
      }
      // If null, redirect is in progress — don't reset loading
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign in with Google';
      setError(message);
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    const name = guestName.trim();
    if (!name) {
      setError('Please enter your name to continue as a guest.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await signInAsGuest(name);
      router.push(returnUrl || '/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in as guest');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="glass-panel w-full max-w-sm rounded-2xl p-5 shadow-[0_20px_60px_-30px_rgba(0,61,130,0.55)]">
      <h2 className="mb-1 text-center text-2xl font-bold text-slate-900">Welcome Back</h2>
      <p className="mb-5 text-center text-xs text-slate-600">Sign in to continue collaborating</p>
      
      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700" role="alert">
          {error}
        </div>
      )}
      
      <form onSubmit={handleEmailLogin} className="space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-cyan-100 bg-white/80 px-2.5 py-2 text-sm text-slate-900 outline-none transition-all focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
            required
            disabled={loading}
          />
        </div>
        
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-cyan-100 bg-white/80 px-2.5 py-2 text-sm text-slate-900 outline-none transition-all focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
            required
            disabled={loading}
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-200 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
      
      <div className="mt-5">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[var(--surface)] px-2 text-slate-500">Or continue with</span>
          </div>
        </div>
        
        <div className="mt-3 space-y-2">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.655 32.657 29.196 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.955 3.045l5.657-5.657C34.051 6.054 29.279 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 13 24 13c3.059 0 5.842 1.154 7.955 3.045l5.657-5.657C34.051 6.054 29.279 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.176 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.15 35.091 26.715 36 24 36c-5.176 0-9.621-3.326-11.289-7.957l-6.522 5.025C9.5 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.02 12.02 0 01-4.084 5.571l.003-.002 6.19 5.238C36.971 39.18 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
            Sign in with Google
            </span>
          </button>
          
        </div>
      </div>
      
      <div className="mt-5">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[var(--surface)] px-2 text-slate-500">Or continue as guest</span>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleGuestLogin(); } }}
            placeholder="Enter your name"
            maxLength={50}
            disabled={loading}
            className="flex-1 rounded-lg border border-cyan-100 bg-white/80 px-2.5 py-2 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleGuestLogin}
            disabled={loading}
            className="shrink-0 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Joining...' : 'Join as Guest'}
          </button>
        </div>
      </div>

      <div className="mt-5 text-center text-xs text-slate-600">
        Don&apos;t have an account?{' '}
        <a href={returnUrl ? `/signup?returnUrl=${encodeURIComponent(returnUrl)}` : '/signup'} className="font-semibold text-cyan-700 hover:text-cyan-900">
          Sign up
        </a>
      </div>
    </div>
  );
};
