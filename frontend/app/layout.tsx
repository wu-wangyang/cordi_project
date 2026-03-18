import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Meeting Notes Summariser',
  description: 'CORDi technical assessment starter app',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
