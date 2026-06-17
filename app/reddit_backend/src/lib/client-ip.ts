let requestIpResolver: any = null;

export function setRequestIpResolver(server: any) {
  requestIpResolver = server;
}

export const getClientIp = (request: Request) => {
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    let ip = cfConnectingIp.trim();
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    return ip;
  }

  const clientIpHeader = request.headers.get('x-client-ip');
  if (clientIpHeader) {
    let ip = clientIpHeader.trim();
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    return ip;
  }

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    let firstIp = forwarded.split(',')[0].trim();
    if (firstIp) {
      if (firstIp.startsWith('::ffff:')) firstIp = firstIp.substring(7);
      return firstIp;
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    let ip = realIp.trim();
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    return ip;
  }

  const trueClientIp = request.headers.get('true-client-ip');
  if (trueClientIp) {
    let ip = trueClientIp.trim();
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    return ip;
  }

  try {
    if (requestIpResolver) {
      const socketAddr = requestIpResolver.requestIP(request);
      if (socketAddr?.address) {
        let ip = socketAddr.address;
        if (ip.startsWith('::ffff:')) ip = ip.substring(7);
        return ip;
      }
    }
  } catch {}

  return '127.0.0.1';
};
