/**
 * Signup page
 */

import { Suspense } from 'react';
import { SignupForm } from '@/components/auth/SignupForm';
import { BrandLogo } from '@/components/brand/BrandLogo';

export default function SignupPage() {
  return (
    <div className="hero-bg relative flex min-h-screen items-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-5">
        <BrandLogo size="xl" showText={false} logoClassName="h-24 w-auto drop-shadow-none" />
      </div>
      <div className="hero-blob left-[-4rem] top-[2rem] h-48 w-48 bg-cyan-300/50" />
      <div className="hero-blob right-[-5rem] top-[8rem] h-56 w-56 bg-blue-300/45" />
      <div className="hero-blob bottom-[-6rem] left-[40%] h-52 w-52 bg-emerald-300/40" />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-center gap-8">
        <div className="hidden max-w-xs lg:block">
          <p className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">
            Start Creating
          </p>
          <h1 className="text-3xl font-bold leading-tight text-slate-900">
            Build ideas in a
            {' '}
            <span className="neon-title">live visual space</span>
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Create your account and launch boards with real-time collaboration.
          </p>
        </div>

        <Suspense fallback={<div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
