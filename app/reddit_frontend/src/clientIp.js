let clientIp = '';

export async function initClientIp() {
  if (clientIp) return clientIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    clientIp = data.ip;
    localStorage.setItem('client_ip', clientIp);
  } catch {
    clientIp = localStorage.getItem('client_ip') || '';
  }
  return clientIp;
}

export function getIp() {
  return clientIp;
}
