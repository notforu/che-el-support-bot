import { Markup, Scenes, session, Telegraf } from 'telegraf';
import { ADMIN_ID, BOT_TOKEN, CHAT_ID } from './constants';
import { START_TEXT } from './text';
import { replyWithError } from './utils';

require('dotenv').config();

console.log(JSON.stringify(process.env));

const bot = new Telegraf(BOT_TOKEN);

const stage = new Scenes.Stage();
bot.use(session());
bot.use(stage.middleware() as any);

bot.command('/start', async (ctx) => {
	try {
		return ctx.reply(START_TEXT);
	} catch (e) {
		replyWithError(ctx, e);
	}
});

bot.on('message', async (ctx) => {
	try {
		await ctx.telegram.forwardMessage(
			ADMIN_ID,
			ctx.chat.id,
			ctx.message.message_id
		)
		const payload = {
			chatId: ctx.message.chat.id,
			messageId: ctx.message.message_id
		}
		const postAction = JSON.stringify({
			type: 'post',
			...payload
		})
		const deleteAction = JSON.stringify({
			type: 'delete',
			...payload
		})
		return ctx.telegram.sendMessage(ADMIN_ID, 'Постим такое?', {
			reply_markup: {
				inline_keyboard: [
					[
						Markup.button.callback('Да', postAction),
						Markup.button.callback('Нет', deleteAction)
					]
				]
			}
		})
	} catch (e) {
		return replyWithError(ctx, e)
	}
})

bot.on('callback_query', async (ctx) => {
	try {
		if (ctx.from?.id !== ADMIN_ID) throw Error('Permission denied');
		if (!ctx.callbackQuery.data) throw Error('Incorrect answer');
		const action = JSON.parse(ctx.callbackQuery.data)
		switch (action.type) {
			case 'post':
				await ctx.telegram.copyMessage(
					CHAT_ID,
					action.chatId,
					action.messageId
				)
				await ctx.telegram.deleteMessage(action.chatId, action.messageId)
			case 'delete':
				await ctx.telegram.deleteMessage(action.chatId, action.messageId)
			default:
				throw Error('Unsupported action')
		}
	} catch (e) {
		return replyWithError(ctx, e)
	} finally {
		await ctx.telegram.answerCbQuery(ctx.callbackQuery.id)
	}
})

bot.launch().then(() => console.log('bot started')).catch((e) => console.error('Launch error: ' + e));

bot.catch((e) => console.error('Common error: ' + e));

// Enable graceful stop
process.once('SIGTERM', () => {
	bot.stop('SIGTERM');
	process.exit();
});
process.once('SIGINT', () => {
	bot.stop('SIGINT');
	process.exit();
});
