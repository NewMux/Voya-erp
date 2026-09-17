import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Voya ERP',
    template: '%s · Voya ERP',
  },
  description: 'Voya Travel & Tourism internal operating system',
  // Internal tool: keep it out of search results entirely.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#4CA7BC',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
