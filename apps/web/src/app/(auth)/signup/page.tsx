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
      <div className="hero-blob left-[-4rem] top-[2rem] h-64 w-64 bg-cyan-300/50" />
      <div className="hero-blob right-[-5rem] top-[8rem] h-80 w-80 bg-blue-300/45" />
      <div className="hero-blob bottom-[-6rem] left-[40%] h-72 w-72 bg-emerald-300/40" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-center gap-12">
        <div className="hidden max-w-sm lg:block">
          <p className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">
            Start Creating
          </p>
          <h1 className="text-4xl font-bold leading-tight text-slate-900">
            Build ideas in a
            {' '}
            <span className="neon-title">live visual space</span>
          </h1>
          <p className="mt-4 text-slate-600">
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
