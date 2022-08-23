require('dotenv').config();

if (!process.env.BOT_TOKEN) {
	throw new Error('No bot token provided');
}

if (!process.env.ADMIN_ID) {
	throw new Error('No ADMIN_ID provided');
}

if (!process.env.CHANNEL_ID) {
	throw new Error('No CHANNEL_ID provided');
}

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const ADMIN_ID = parseInt(process.env.ADMIN_ID);
export const CHANNEL_ID = parseInt(process.env.CHANNEL_ID);
