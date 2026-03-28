// fetch tenant branding once and hydrate CSS vars
export async function loadBranding() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/tenant/branding`, { credentials: 'include' });
    if (!res.ok) return;
    const { colors, logoUrl } = await res.json(); // {colors:{primary,...}}
    const root = document.documentElement;
    if (colors?.primary) root.style.setProperty('--brand-primary', colors.primary);
    if (colors?.bg) root.style.setProperty('--brand-bg', colors.bg);
    if (colors?.panel) root.style.setProperty('--brand-panel', colors.panel);
    if (colors?.ink) root.style.setProperty('--brand-ink', colors.ink);
    if (logoUrl) root.style.setProperty('--brand-logo-url', `url(${logoUrl})`);
  } catch {}
}
