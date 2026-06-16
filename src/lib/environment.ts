/**
 * Detects whether the app is running in the development/test environment
 * (Lovable preview) versus the published live environment.
 *
 * Lovable Cloud uses two separate databases (Test vs Live) for preview and
 * published apps respectively. Data is NOT shared between them.
 */
export function isDevEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  // Lovable preview hostnames look like: id-preview--<uuid>.lovable.app
  // Local dev (vite) runs on localhost / 127.0.0.1
  return (
    host.includes('id-preview--') ||
    host.includes('lovableproject.com') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}
