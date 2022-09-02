import { Context } from 'telegraf';
import { Message } from 'typegram';

export interface SessionData {
	text: string;
	fileId?: string;
	fileIds?: string[];
}

export interface BotContext extends Context {
	session?: SessionData;
}

export interface MediaGroupContext extends BotContext {
	mediaGroup: Array<(Message.VideoMessage | Message.PhotoMessage)>;
}
