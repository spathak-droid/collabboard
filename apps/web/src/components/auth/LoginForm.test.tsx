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
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock Firebase auth
vi.mock('@/lib/firebase/auth', () => ({
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithGithub: vi.fn(),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('renders login form with all fields', () => {
    render(<LoginForm />);
    
    expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
  
  it('shows social login buttons', () => {
    render(<LoginForm />);
    
    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in with github/i)).toBeInTheDocument();
  });
  
  it('handles email/password login successfully', async () => {
    const user = userEvent.setup();
    vi.mocked(auth.signIn).mockResolvedValue({} as any);
    
    render(<LoginForm />);
    
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(auth.signIn).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });
  
  it('displays error message on login failure', async () => {
    const user = userEvent.setup();
    vi.mocked(auth.signIn).mockRejectedValue(new Error('Invalid credentials'));
    
    render(<LoginForm />);
    
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    
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
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });
  
  it('handles GitHub login', async () => {
    const user = userEvent.setup();
    vi.mocked(auth.signInWithGithub).mockResolvedValue({} as any);
    
    render(<LoginForm />);
    
    await user.click(screen.getByText(/sign in with github/i));
    
    await waitFor(() => {
      expect(auth.signInWithGithub).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });
  
  it('disables form while loading', async () => {
    const user = userEvent.setup();
    vi.mocked(auth.signIn).mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<LoginForm />);
    
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeDisabled();
      expect(screen.getByLabelText(/password/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });
  });
});
