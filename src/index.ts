import { Markup, Scenes, session, Telegraf } from 'telegraf';
import { createClient } from 'redis';
import { ADMIN_ID, BOT_TOKEN, CHANNEL_ID } from './constants';
import { replyWithError } from './utils';
import { BotContext } from './types';

const mediaGroup = require('telegraf-media-group');

require('dotenv').config();

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://0.0.0.0:6379' });

const bot = new Telegraf<BotContext>(BOT_TOKEN);

const startScene = new Scenes.BaseScene<BotContext>('startScene');
const anonScene = new Scenes.BaseScene<BotContext>('anonScene');
const stage = new Scenes.Stage([startScene, anonScene] as any);
bot.use(session());
bot.use(mediaGroup());
bot.use(stage.middleware() as any);

startScene.enter(async (ctx) => {
	try {
		return ctx.reply(`Хай! Че ел(а) сегодня?
Принимается текст, фотографии, или всё вместе:`);
	} catch (e) {
		return replyWithError(ctx, e);
	}
});

async function onMessage(ctx: BotContext) {
	try {
		const message: any = ctx.message;
		if (message.text === '/start') return (ctx as any).scene.enter('startScene');
		if (message.photo) {
			ctx.session = {text: message.caption || '', fileId: message.photo[0].file_id};
		} else {
			ctx.session = {text: message.text};
		}
		return (ctx as any).scene.enter('anonScene');
	} catch (e) {
		return replyWithError(ctx, e);
	}
}

async function sendMediaGroup(ctx: BotContext, chatId: number, text: string, fileIds: string[]): Promise<string | undefined> {
	const res = await ctx.telegram.sendMediaGroup(chatId, fileIds.map((fileId, index) => ({
		type: 'photo',
		media: fileId,
		caption: index === 0 ? (text || '') : '',
	})));
	return res[0].media_group_id;
}

bot.on('media_group' as any, async ctx => {
	try {
		console.log('mediagroup', (ctx as any).mediaGroup);
		ctx.session = {
			text: (ctx as any).mediaGroup[0].caption,
			fileIds: (ctx as any).mediaGroup.map((message: any) => message.photo[0].file_id),
		};
		return (ctx as any).scene.enter('anonScene');
	} catch (e) {
		return replyWithError(ctx, e);
	}
});


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
		const ensuredText = ctx.session.text || '';
		let text = (isAnonymous || !ctx.from?.username) ? (ensuredText) : `${ensuredText}

@${ctx.from.username}`;
		text += `

#че_ел_подписчик`;

		let postAction: string;
		if (ctx.session.fileIds) {
			const fileIds = ctx.session.fileIds;
			const mediaGroupId = await sendMediaGroup(ctx, ADMIN_ID, text, fileIds);
			if (!mediaGroupId) throw new Error('No media group ID for album!');
			await redisClient.set(mediaGroupId, JSON.stringify({ fileIds, text }));
			postAction = JSON.stringify({
				type: 'post',
				mediaGroupId,
			});
		} else if (ctx.session.fileId) {
			const res = await ctx.telegram.sendPhoto(
				ADMIN_ID,
				ctx.session.fileId,
				{caption: text},
			);
			postAction = JSON.stringify({
				type: 'post',
				messageId: res.message_id,
			});
		} else {
			const res = await ctx.telegram.sendMessage(
				ADMIN_ID,
				text,
			);
			postAction = JSON.stringify({
				type: 'post',
				messageId: res.message_id,
			});
		}

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
						Markup.button.callback('Нет', JSON.stringify({type: 'delete'})),
					],
				],
			},
		});
	} catch (e) {
		return replyWithError(ctx, e);
	}
});

bot.command('/start', (ctx) => (ctx as any).scene.enter('startScene'));
bot.on('message', onMessage);

bot.on('callback_query', async (ctx) => {
	try {
		if (ctx.callbackQuery.data === 'publish_again') return (ctx as any).scene.enter('startScene');
		if (ADMIN_ID !== ctx.from?.id) throw Error('Permission denied');
		if (!ctx.callbackQuery.data) throw Error('Incorrect answer');
		const action = JSON.parse(ctx.callbackQuery.data);
		const {type, messageId, mediaGroupId} = action;
		const emptyExtra = {reply_markup: {inline_keyboard: []}};
		switch (type) {
			case 'post':
				if (mediaGroupId) {
					const payload = await redisClient.get(mediaGroupId);
					if (!payload) throw new Error('No payload in cache for mediaGroupId: ' + mediaGroupId);
					const parsed = JSON.parse(payload) as { fileIds: string[]; text: string };
					await sendMediaGroup(ctx, CHANNEL_ID, parsed.text, parsed.fileIds);
					await redisClient.del(mediaGroupId);
				} else {
					await ctx.telegram.copyMessage(
						CHANNEL_ID,
						ADMIN_ID,
						messageId,
					);
				}
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

Promise.all([bot.launch(), redisClient.connect()])
	.then(() => console.log('bot started'))
	.catch((e) => console.error('Launch error: ' + e));

bot.catch((e) => console.error('Common error: ' + e));
redisClient.on('error', (err) => console.log('Redis error:', err));

// Enable graceful stop
process.once('SIGTERM', () => {
	bot.stop('SIGTERM');
	redisClient.disconnect();
	process.exit();
});
process.once('SIGINT', () => {
	bot.stop('SIGINT');
	redisClient.disconnect();
	process.exit();
});
