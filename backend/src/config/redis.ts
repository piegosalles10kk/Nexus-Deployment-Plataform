import { createClient, RedisClientType } from 'redis';
import { env } from './env';

let redisClient: RedisClientType | null = null;

export const getRedisClient = async (): Promise<RedisClientType> => {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({
    url: env.REDIS_URL,
  });

  redisClient.on('error', (err) => console.error('Redis Client Error', err));

  await redisClient.connect();
  return redisClient;
};

export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};
