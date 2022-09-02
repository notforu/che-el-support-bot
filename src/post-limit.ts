import { redisClient } from './redis';

const MAX_POSTS_PER_DAY = 5;

export async function canPost(userId: number): Promise<boolean> {
	const current = await redisClient.get(String(userId));
	if (!current) return true;
	const timestamps: number[] = JSON.parse(current);
	return timestamps.filter(isLessThan24HoursAgo).length < MAX_POSTS_PER_DAY;
}

export async function logPost(userId: number): Promise<string | null> {
	let posts: number[] = [];
	const current = await redisClient.get(String(userId));
	if (current) {
		posts = JSON.parse(current);
		if (posts.length === MAX_POSTS_PER_DAY) posts.pop();
	}
	posts.unshift(Date.now());
	return redisClient.set(String(userId), JSON.stringify(posts));
}

function isLessThan24HoursAgo(timestamp: number): boolean {
	const day = 60 * 60 * 24 * 1000;
	return Date.now() - timestamp < day;
}
