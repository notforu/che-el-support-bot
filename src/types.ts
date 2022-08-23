import { Context } from 'telegraf';

export interface SessionData {
	text: string;
	fileId?: string;
}

export interface BotContext extends Context {
	session?: SessionData;
}
