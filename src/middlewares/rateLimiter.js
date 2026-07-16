import Bottleneck from 'bottleneck';

export const limiters = new Map();

const MAX_REQUESTS = 10;
const PERIOD_MS = 60 * 1000;

function getLimiter(jid) {
  if (!limiters.has(jid)) {
    const limiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 0,
      reservoir: MAX_REQUESTS,
      reservoirRefreshAmount: MAX_REQUESTS,
      reservoirRefreshInterval: PERIOD_MS,
    });

    limiter.on('failed', async (error, info) => {
      return false;
    });

    limiters.set(jid, limiter);

    setTimeout(() => {
      limiters.delete(jid);
    }, PERIOD_MS * 2);
  }

  return limiters.get(jid);
}

export async function checkRateLimit(jid) {
  const limiter = getLimiter(jid);

  return new Promise((resolve) => {
    limiter.schedule(async () => {
      resolve(true);
    }).catch(() => {
      resolve(false);
    });
  });
}

export function getRemainingRequests(jid) {
  const limiter = limiters.get(jid);
  if (!limiter) return MAX_REQUESTS;

  const reservoir = limiter.redis ? null : limiter._reservoir;
  return reservoir ?? MAX_REQUESTS;
}

export function getRateLimitMessage() {
  return 'Jangan spam, tunggu sebentar ya! ⏳\nBatas: 10 command per menit.';
}
