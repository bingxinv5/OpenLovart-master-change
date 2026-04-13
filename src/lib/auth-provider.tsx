'use client';

import React from 'react';
import { MockClerkProvider } from '@/lib/mock-clerk';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <MockClerkProvider>{children}</MockClerkProvider>;
}
