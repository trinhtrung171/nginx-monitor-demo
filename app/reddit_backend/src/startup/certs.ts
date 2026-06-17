import { existsSync, mkdirSync, writeFileSync } from 'fs';

export function setupMtlsCerts() {
  const certDir = '/tmp/mtls-certs';
  if (!existsSync(certDir)) {
    mkdirSync(certDir, { recursive: true });
  }

  const certs: Record<string, string | undefined> = {
    'ca.crt': process.env.CA_CERT_B64,
    'client.crt': process.env.CLIENT_CERT_B64,
    'client.key': process.env.CLIENT_KEY_B64,
  };

  for (const [filename, b64value] of Object.entries(certs)) {
    if (!b64value) {
      console.warn(`[mTLS] ${filename} not found in environment, skipping`);
      continue;
    }
    writeFileSync(`${certDir}/${filename}`, Buffer.from(b64value, 'base64'));
  }

  console.log('[mTLS] Certificates written to /tmp/mtls-certs/');
}
