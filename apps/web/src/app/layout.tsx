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
