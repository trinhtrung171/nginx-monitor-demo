export function detectPlatform(url: string) {
  const u = url.toLowerCase();
  const ytMatch = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-z0-9_-]{11})/);
  if (ytMatch) {
    return { id: 'youtube', videoId: ytMatch[1], embedHtml: true };
  }
  if (u.includes('twitter.com') || u.includes('x.com')) {
    return { id: 'twitter', embedHtml: true };
  }
  if (u.includes('facebook.com') || u.includes('fb.com')) {
    return { id: 'facebook', embedHtml: true };
  }
  return null;
}

export async function fetchLinkPreview(url: string) {
  const platform = detectPlatform(url);
  if (platform?.embedHtml) {
    return { url, ...platform };
  }

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DevShareBot/1.0)' }, signal: AbortSignal.timeout(4000) });
    const html = await res.text();
    const getMeta = (prop: string) => {
      const match = html.match(new RegExp(`<meta\\s+(?:property|name)=["']${prop}["']\\s+content=["']([^"']+)["']`, 'i')) ||
                    html.match(new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${prop}["']`, 'i'));
      return match ? match[1] : null;
    };
    const title = getMeta('og:title') || getMeta('twitter:title') || html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description');
    const image = getMeta('og:image') || getMeta('twitter:image');
    const siteName = getMeta('og:site_name') || getMeta('al:android:app_name') || '';

    if (title || description || image) {
      return { url, platform: platform?.id || 'website', title, description, image, siteName };
    }
  } catch {}

  return { url, platform: 'website', title: url };
}
