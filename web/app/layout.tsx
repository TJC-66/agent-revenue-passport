import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://agent-revenue-passport.manshiguang124.chatgpt.site'),
  title: 'ProofRabbit — Verifiable AI Agent Revenue',
  description: 'Verify buyer-signed AI-agent revenue, detect connected-wallet fraud signals, and issue a wallet-bound GenLayer revenue credential.',
  icons: {
    icon: [{ url: '/proofrabbit-favicon-v3.png', type: 'image/png', sizes: '64x64' }],
    shortcut: '/proofrabbit-favicon-v3.png',
    apple: '/proofrabbit-apple-icon-v3.png',
  },
  openGraph: {
    title: 'ProofRabbit — Verifiable AI Agent Revenue',
    description: 'Buyer-signed revenue evidence, fraud-risk analysis, and wallet-bound GenLayer credentials for AI agents.',
    url: '/',
    siteName: 'ProofRabbit',
    images: [{ url: '/proofrabbit-logo.png', width: 1024, height: 1024, alt: 'ProofRabbit logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'ProofRabbit — Verifiable AI Agent Revenue',
    description: 'Buyer-signed revenue evidence, fraud-risk analysis, and wallet-bound GenLayer credentials for AI agents.',
    images: ['/proofrabbit-logo.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
