/**
 * Endpoint pour surveiller le rate limiting
 */

import { traktRateLimiter } from './rateLimiter.js';

export function getRateLimitStats(req, res) {
  const stats = traktRateLimiter.getStats();
  
  res.json({
    ok: true,
    rateLimits: {
      GET: {
        used: stats.GET.current,
        limit: stats.GET.limit,
        remaining: stats.GET.limit - stats.GET.current,
        percentage: stats.GET.percentage.toFixed(2) + '%',
        resetIn: '5 minutes'
      },
      POST: {
        used: stats.POST.current,
        limit: stats.POST.limit,
        remaining: stats.POST.limit - stats.POST.current,
        percentage: stats.POST.percentage.toFixed(2) + '%',
        resetIn: '1 second'
      },
      queueLength: stats.queueLength,
      timestamp: new Date().toISOString()
    }
  });
}