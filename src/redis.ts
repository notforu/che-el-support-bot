import { createClient } from 'redis';

export const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://0.0.0.0:6379' });


