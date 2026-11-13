import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '../styles.css';
import { ClientRoot } from './ClientRoot';

export const metadata: Metadata = {
  title: 'Dance Studio & Costumes',
  description: 'Run your dance studio: dancers, classes, costumes, shows, families and staff in one place.',
  applicationName: 'Dance Studio & Costumes',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  // iPhone / iPad home screen
  appleWebApp: { capable: true, title: 'Dance Studio', statusBarStyle: 'default' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fbf6f1',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientRoot>{children}</ClientRoot>
      </body>
    </html>
  );
}
