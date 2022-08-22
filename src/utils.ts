import { Context } from 'telegraf';
import { COMMON_ERROR_TEXT } from './text';

export function replyWithError(ctx: Context, e: unknown): Promise<unknown> {
	console.error('Starting message error: ' + e);
	return ctx.reply(COMMON_ERROR_TEXT).catch(console.error);
}
