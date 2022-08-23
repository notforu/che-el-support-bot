import { Markup, Scenes, session, Telegraf } from 'telegraf';
import { ADMIN_ID, BOT_TOKEN, CHANNEL_ID } from './constants';
import { replyWithError } from './utils';
import { BotContext } from './types';

require('dotenv').config();

const bot = new Telegraf<BotContext>(BOT_TOKEN);

const startScene = new Scenes.BaseScene<BotContext>('startScene');
startScene.enter(async (ctx) => {
	try {
		return ctx.reply(`Хай, че ел(а) сёдня?
Принимается текст, фото, или всё вместе:`);
	} catch (e) {
		return replyWithError(ctx, e);
	}
});

startScene.on('message', async ctx => {
	try {
		const message: any = ctx.message;
		if (message.text === '/start') return (ctx as any).scene.enter('startScene');
		if (message.caption) {
			ctx.session = {text: message.caption, fileId: message.photo[0].file_id};
		} else {
			ctx.session = {text: message.text};
		}
		return (ctx as any).scene.enter('anonScene');
	} catch (e) {
		return replyWithError(ctx, e);
	}
});

const anonScene = new Scenes.BaseScene<BotContext>('anonScene');
anonScene.enter(async (ctx) => {
	try {
		return ctx.reply(`Опубликовать анонимно?`, {
			reply_markup: {
				inline_keyboard: [
					[
						Markup.button.callback('Нет', '0'),
						Markup.button.callback('Да', '1'),
					],
					[
						Markup.button.callback('◀️ Назад', 'publish_again'),
					],
				],
			},
		});
	} catch (e) {
		return replyWithError(ctx, e);
	}
});

anonScene.on('callback_query', async (ctx) => {
	try {
		if (ctx.callbackQuery.data === 'publish_again') return (ctx as any).scene.enter('startScene');
		if (!ctx.chat || !ctx.session) return;
		if (!ctx.callbackQuery.data) throw Error('Incorrect answer');
		const isAnonymous = Boolean(Number(ctx.callbackQuery.data));
		let text = (isAnonymous || !ctx.from?.username) ? ctx.session.text : `${ctx.session.text}

@${ctx.from?.username}`;
		text += `

#че_ел_подписчик`;
		let res;
		if (ctx.session.fileId) {
			res = await ctx.telegram.sendPhoto(
				ADMIN_ID,
				ctx.session.fileId,
				{caption: text},
			);
		} else {
			res = await ctx.telegram.sendMessage(
				ADMIN_ID,
				text,
			);
		}
		const postAction = JSON.stringify({
			type: 'post',
			messageId: res.message_id,
		});
		const deleteAction = JSON.stringify({
			type: 'delete',
			messageId: res.message_id,
		});
		await ctx.editMessageText('Ваш пост отправлен на модерацию', {
			reply_markup: {
				inline_keyboard: [
					[
						Markup.button.callback('Опубликовать еще', 'publish_again'),
					],
				],
			},
		});
		return ctx.telegram.sendMessage(ADMIN_ID, 'Постим такое?', {
			reply_markup: {
				inline_keyboard: [
					[
						Markup.button.callback('Да', postAction),
						Markup.button.callback('Нет', deleteAction),
					],
				],
			},
		});
	} catch (e) {
		return replyWithError(ctx, e);
	}
});

const stage = new Scenes.Stage([startScene, anonScene] as any);
bot.use(session());
bot.use(stage.middleware() as any);

bot.command('/start', (ctx) => (ctx as any).scene.enter('startScene'));
bot.on('message', (ctx) => (ctx as any).scene.enter('startScene'));

bot.on('callback_query', async (ctx) => {
	try {
		if (ADMIN_ID !== ctx.from?.id) throw Error('Permission denied');
		if (!ctx.callbackQuery.data) throw Error('Incorrect answer');
		const action = JSON.parse(ctx.callbackQuery.data);
		const {type, messageId} = action;
		const emptyExtra = {reply_markup: {inline_keyboard: []}};
		switch (type) {
			case 'post':
				await ctx.telegram.copyMessage(
					CHANNEL_ID,
					ADMIN_ID,
					messageId,
				);
				await ctx.editMessageText('Сообщение опубликовано', emptyExtra);
				break;
			case 'delete':
				await ctx.editMessageText('Сообщение не опубликовано', emptyExtra);
				break;
			default:
				throw Error('Unsupported action');
		}
	} catch (e) {
		return replyWithError(ctx, e);
	} finally {
		await ctx.telegram.answerCbQuery(ctx.callbackQuery.id);
	}
});

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
