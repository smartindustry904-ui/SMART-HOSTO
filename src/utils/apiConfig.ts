export const BACKEND_URL =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? ''
    : 'https://smart-hosto.onrender.com';

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${cleanPath}`;
}
