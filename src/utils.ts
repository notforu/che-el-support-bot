import { Context } from 'telegraf';

export function replyWithError(ctx: Context, e: unknown): Promise<unknown> {
	console.error('Error occurred: ' + e);
	return ctx.reply('Произошла ошибка, попробуйте еще раз.').catch(console.error);
}
