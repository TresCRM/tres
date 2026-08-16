import './globals.css';
import { Source_Sans_3 } from 'next/font/google';
import Providers from './providers';

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-source-sans',
});

export const metadata = {
  title: 'TRES CRM',
  description: 'Multi-tenant SaaS helpdesk and CRM platform',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sourceSans.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
