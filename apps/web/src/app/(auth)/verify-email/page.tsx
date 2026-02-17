/**
 * Email Verification page
 * Shown after signup or when an unverified user tries to access the app.
 */

'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { resendVerificationEmail, signOut } from '@/lib/firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/config';
import { BrandLogo } from '@/components/brand/BrandLogo';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const redirectTo = returnUrl || '/dashboard';
  const { user, loading } = useAuth();
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // If no user, redirect to login
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // If user is already verified or is a guest, redirect
  useEffect(() => {
    if (user?.emailVerified || user?.isAnonymous) {
      router.push(redirectTo);
    }
  }, [user, router, redirectTo]);

  // Poll Firebase for verification status every 3 seconds
  useEffect(() => {
    if (!user || user.emailVerified) return;

    const interval = setInterval(async () => {
      try {
        const firebaseAuth = getFirebaseAuth();
        const currentUser = firebaseAuth.currentUser;
        if (currentUser) {
          await currentUser.reload();
          if (currentUser.emailVerified) {
            // Clear session cache so useAuth picks up the new state
            try { sessionStorage.removeItem('collabboard_auth_user'); } catch { /* noop */ }
            router.push(redirectTo);
          }
        }
      } catch {
        // ignore — user may have signed out
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [user, router, redirectTo]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    setResendStatus('sending');
    setErrorMsg('');
    try {
      await resendVerificationEmail();
      setResendStatus('sent');
      setCooldown(60);
    } catch (err: unknown) {
      setResendStatus('error');
      const message = err instanceof Error ? err.message : 'Failed to resend email';
      if (message.includes('too-many-requests')) {
        setErrorMsg('Too many requests. Please wait a minute and try again.');
        setCooldown(60);
      } else {
        setErrorMsg(message);
      }
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/login');
  }, [router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  if (user.emailVerified) {
    return null;
  }

  return (
    <div className="hero-bg relative flex min-h-screen items-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-5">
        <BrandLogo size="xl" showText={false} logoClassName="h-24 w-auto drop-shadow-none" />
      </div>
      <div className="hero-blob left-[-4rem] top-[2rem] h-64 w-64 bg-cyan-300/50" />
      <div className="hero-blob right-[-5rem] top-[8rem] h-80 w-80 bg-blue-300/45" />
      <div className="hero-blob bottom-[-6rem] left-[40%] h-72 w-72 bg-emerald-300/40" />

      <div className="relative z-10 mx-auto w-full max-w-md">
        <div className="glass-panel rounded-3xl p-8 text-center shadow-[0_28px_80px_-40px_rgba(0,61,130,0.55)]">
          {/* Email icon */}
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-100 to-blue-100">
            <svg className="h-8 w-8 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 className="mb-2 text-2xl font-bold text-slate-900">Verify your email</h2>
          <p className="mb-1 text-sm text-slate-600">
            We sent a verification link to
          </p>
          <p className="mb-6 text-sm font-semibold text-slate-800">
            {user.email}
          </p>

          <p className="mb-6 text-sm text-slate-500">
            Click the link in your email to verify your account. Once verified, this page will automatically redirect you.
            <br className="mt-1" />
            <span className="mt-2 inline-block text-slate-400">
              Don&apos;t see it? Check your spam or junk folder.
            </span>
          </p>

          {/* Status messages */}
          {resendStatus === 'sent' && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Verification email sent! Check your inbox.
            </div>
          )}
          {resendStatus === 'error' && errorMsg && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMsg}
            </div>
          )}

          {/* Resend button */}
          <button
            onClick={handleResend}
            disabled={resendStatus === 'sending' || cooldown > 0}
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 py-2.5 font-semibold text-white shadow-md shadow-cyan-200 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resendStatus === 'sending'
              ? 'Sending...'
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : 'Resend verification email'}
          </button>

          {/* Polling indicator */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            Waiting for verification...
          </div>

          {/* Sign out / use different email */}
          <div className="mt-6 border-t border-slate-200 pt-4">
            <button
              onClick={handleSignOut}
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
            >
              Sign out or use a different email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
