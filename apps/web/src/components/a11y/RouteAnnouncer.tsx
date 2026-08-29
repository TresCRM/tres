'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const PATH_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/tickets': 'Tickets',
  '/customers': 'Customers',
  '/staff': 'Staff',
  '/billing': 'Billing',
  '/settings': 'Settings',
  '/settings/branding': 'Branding Settings',
  '/settings/widget': 'Widget Settings',
  '/reports': 'Reports',
  '/admin': 'Admin Dashboard',
  '/signin': 'Sign In',
  '/signup': 'Sign Up',
  '/': 'Home',
};

function getPageName(pathname: string): string {
  if (PATH_NAMES[pathname]) return PATH_NAMES[pathname];

  // Try matching the first two segments, then the first segment
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const twoSegment = `/${segments[0]}/${segments[1]}`;
    if (PATH_NAMES[twoSegment]) return PATH_NAMES[twoSegment];
  }
  if (segments.length >= 1) {
    const oneSegment = `/${segments[0]}`;
    if (PATH_NAMES[oneSegment]) return PATH_NAMES[oneSegment];
  }

  // Fallback: capitalize the last segment
  const last = segments[segments.length - 1] || '';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export default function RouteAnnouncer() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState('');
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const name = getPageName(pathname);
    setAnnouncement(`Navigated to ${name}`);

    const timer = setTimeout(() => {
      setAnnouncement('');
    }, 1000);

    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <span
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </span>
  );
}
