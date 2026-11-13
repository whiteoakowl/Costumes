'use client';
import { Layout } from '@/components/Layout';
import { EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <Layout>
      <EmptyState title="Page not found" message="Use the menu to find your way back." />
    </Layout>
  );
}
