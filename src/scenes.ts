import { Context, Scenes } from 'telegraf';
import { COMMON_ERROR_TEXT } from './text';
import { replyWithError } from './utils';

const DESC_MAX_LENGTH = 500;

export const startScene = new Scenes.BaseScene('startScene');
startScene.enter(async (ctx) => {
	try {
		const userId = ctx.from?.id;
		if (!userId) {
			return ctx.reply(COMMON_ERROR_TEXT);
		}
		return (ctx as any).scene.enter('menuScene');
	} catch (e) {
		return replyWithError(ctx, e);
	}
});

startScene.on('text', async ctx => {
	try {

	} catch (e) {
		return replyWithError(ctx, e);
	}
})
