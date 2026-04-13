'use client';

import React, { createContext, useContext } from 'react';

// Mock user for demo mode
const mockUser = {
  id: 'demo-user-001',
  firstName: 'Demo',
  lastName: 'User',
  fullName: 'Demo User',
  username: 'demo',
  primaryEmailAddress: { emailAddress: 'demo@example.com' },
  imageUrl: '',
  createdAt: new Date('2024-01-01'),
};

const MockUserContext = createContext({ user: mockUser, isLoaded: true, isSignedIn: true });
const MockSessionContext = createContext({ session: null, isLoaded: true });

// Re-export mock versions of Clerk hooks/components for demo mode
export function useUser() {
  return useContext(MockUserContext);
}

export function SignedIn({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SignedOut(props: { children: React.ReactNode }) {
  void props;
  return null;
}

export function SignInButton({ children }: { children: React.ReactNode; mode?: string }) {
  return <>{children}</>;
}

export function UserButton() {
  return (
    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-xs font-bold">
      D
    </div>
  );
}

export function MockClerkProvider({ children }: { children: React.ReactNode }) {
  return (
    <MockUserContext.Provider value={{ user: mockUser, isLoaded: true, isSignedIn: true }}>
      <MockSessionContext.Provider value={{ session: null, isLoaded: true }}>
        {children}
      </MockSessionContext.Provider>
    </MockUserContext.Provider>
  );
}
