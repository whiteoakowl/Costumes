'use client';
import type { ReactNode } from 'react';
import { Layout } from '@/components/Layout';

/** Every studio screen gets the sidebar, top bar and portal checks. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Layout>{children}</Layout>;
}
