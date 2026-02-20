/**
 * Test cases for LoginForm component (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';
import * as auth from '@/lib/firebase/auth';

// Mock Next.js router
const mockPush = vi.fn();
const mockGet = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: mockGet,
  }),
}));

// Mock Firebase auth
vi.mock('@/lib/firebase/auth', () => ({
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithGithub: vi.fn(),
  handleRedirectResult: vi.fn().mockResolvedValue(null),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('renders login form with all fields', () => {
    render(<LoginForm />);
    
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    
    const submitButton = screen.getByRole('button', { name: /^sign in$/i });
    expect(submitButton).toBeInTheDocument();
  });
  
  it('shows social login buttons', () => {
    render(<LoginForm />);
    
    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
  });
  
  it('handles email/password login successfully', async () => {
    const user = userEvent.setup();
    const mockUser = { emailVerified: true };
    vi.mocked(auth.signIn).mockResolvedValue(mockUser as any);
    
    render(<LoginForm />);
    
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    
    const submitButton = screen.getByRole('button', { name: /^sign in$/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(auth.signIn).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });
  
  it('displays error message on login failure', async () => {
    const user = userEvent.setup();
    vi.mocked(auth.signIn).mockRejectedValue(new Error('Invalid credentials'));
    
    render(<LoginForm />);
    
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    
    const submitButton = screen.getByRole('button', { name: /^sign in$/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid credentials/i);
    });
  });
  
  it('handles Google login', async () => {
    const user = userEvent.setup();
    vi.mocked(auth.signInWithGoogle).mockResolvedValue({} as any);
    
    render(<LoginForm />);
    
    await user.click(screen.getByText(/sign in with google/i));
    
    await waitFor(() => {
      expect(auth.signInWithGoogle).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });
  
  it('disables form while loading', async () => {
    const user = userEvent.setup();
    vi.mocked(auth.signIn).mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<LoginForm />);
    
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    
    const submitButton = screen.getByRole('button', { name: /^sign in$/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeDisabled();
      expect(screen.getByLabelText(/password/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });
  });
});
