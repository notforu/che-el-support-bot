import { Markup, Scenes, session, Telegraf } from 'telegraf';
import { ADMIN_ID, BOT_TOKEN, CHANNEL_ID, DISPATCH_CRON_PATTERN, DISPATCH_QUEUE_REDIS_KEY } from './constants';
import { replyWithError } from './utils';
import { BotContext, MediaGroupContext } from './types';
import { redisClient } from './redis';
import { canPost, logPost } from './post-limit';
import schedule from 'node-schedule'

const mediaGroup = require('telegraf-media-group');

require('dotenv').config();

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

async function sendMediaGroup(chatId: number, text: string, fileIds: string[]): Promise<string | undefined> {
	const res = await bot.telegram.sendMediaGroup(chatId, fileIds.map((fileId, index) => ({
		type: 'photo',
		media: fileId,
		caption: index === 0 ? (text || '') : '',
	})));
	return res[0].media_group_id;
}

bot.on('media_group' as any, async (c: any) => {
	const ctx: MediaGroupContext = c;
	try {
		ctx.session = {
			text: ctx.mediaGroup[0].caption || '',
			fileIds: ctx.mediaGroup.map((message: any) => message.photo[0].file_id),
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
		if (!ctx.chat || !ctx.session || !ctx.from || !ctx.callbackQuery.data) return;
		if (!await canPost(ctx.from.id)) {
			return ctx.reply('Вы превысили лимит постов на сегодня - в день можно публиковать только 5. Приходите завтра!');
		}
		const isAnonymous = Boolean(Number(ctx.callbackQuery.data));
		const ensuredText = ctx.session.text || '';
		let text = (isAnonymous || !ctx.from.username) ? (ensuredText) : `${ensuredText}

@${ctx.from.username}`;
		text += `

#че_ел_подписчик`;

		let action: any
		if (ctx.session.fileIds) {
			const fileIds = ctx.session.fileIds;
			const mediaGroupId = await sendMediaGroup(ADMIN_ID, text, fileIds);
			if (!mediaGroupId) throw new Error('No media group ID for album!');
			await redisClient.set(mediaGroupId, JSON.stringify({ fileIds, text }));
			action = { mediaGroupId };
		} else if (ctx.session.fileId) {
			const res = await ctx.telegram.sendPhoto(
				ADMIN_ID,
				ctx.session.fileId,
				{caption: text},
			);
			action = { messageId: res.message_id }
		} else {
			const res = await ctx.telegram.sendMessage(
				ADMIN_ID,
				text,
			);
			action = { messageId: res.message_id };
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
		await logPost(ctx.from.id);

		return ctx.telegram.sendMessage(ADMIN_ID, 'Постим такое?', {
			reply_markup: {
				inline_keyboard: [
					[
						Markup.button.callback('Да', JSON.stringify({ type: 'post', ...action })),
						Markup.button.callback('Нет', JSON.stringify({type: 'delete'})),
					],
					[
						Markup.button.callback('В начало', JSON.stringify({ type: 'push_front', ...action })),
						Markup.button.callback('В конец', JSON.stringify({ type: 'push_back', ...action })),
					]
				],
			},
		});
	} catch (e) {
		return replyWithError(ctx, e);
	}
});

bot.command('/start', (ctx) => (ctx as any).scene.enter('startScene'));
bot.on('message', onMessage);

type QueueItem = MediaGroupQueueItem | MessageIdQueueItem

interface MediaGroupQueueItem {
	type: 'mediaGroup',
	mediaGroupId: string
}

interface MessageIdQueueItem {
	type: 'messageId',
	messageId: number
}

async function post(params: QueueItem): Promise<void> {
	if (params.type === 'mediaGroup') {
		const { mediaGroupId } = params;
		const payload = await redisClient.get(mediaGroupId);
		if (!payload) throw new Error('No payload in cache for mediaGroupId: ' + mediaGroupId);
		const parsed = JSON.parse(payload) as { fileIds: string[]; text: string };
		await sendMediaGroup(CHANNEL_ID, parsed.text, parsed.fileIds);
		await redisClient.del(mediaGroupId);
	} else {
		await bot.telegram.copyMessage(
			CHANNEL_ID,
			ADMIN_ID,
			params.messageId,
		);
	}
}

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
				await post({
					type: mediaGroupId ? 'mediaGroup' : 'messageId',
					messageId,
					mediaGroupId
				})
				await ctx.editMessageText('Сообщение опубликовано', emptyExtra);
				break;
			case 'push_back':
			case 'push_front':
				const enqueue = (type === 'push_back' ? redisClient.lPush: redisClient.rPush).bind(redisClient);
				await enqueue(DISPATCH_QUEUE_REDIS_KEY, JSON.stringify({
					type: mediaGroupId ? 'mediaGroup' : 'messageId',
					messageId,
					mediaGroupId
				}));
				await ctx.editMessageText(`Сообщение добавлено в ${type === 'push_front' ? 'начало' : 'конец'} очереди`, emptyExtra);
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

schedule.scheduleJob('dispatch', DISPATCH_CRON_PATTERN, async () => {
	try {
		const item = await redisClient.rPop(DISPATCH_QUEUE_REDIS_KEY);
		if (!item) return;
		await post(JSON.parse(item) as QueueItem)
	} catch (e) {
		bot.telegram.sendMessage(ADMIN_ID, `Не удалось отправить сообщение: ${e}`);
	}
})

Promise.all([bot.launch(), redisClient.connect()])
	.then(() => console.log('bot started'))
	.catch((e) => console.error('Launch error: ' + e));

bot.catch((e) => console.error('Common error: ' + e));
redisClient.on('error', (err) => console.log('Redis error:', err));

function shutdown() {
	redisClient.disconnect();
	schedule.gracefulShutdown()
	process.exit();
}

// Enable graceful stop
process.once('SIGTERM', () => {
	bot.stop('SIGTERM');
	shutdown();
});
process.once('SIGINT', () => {
	bot.stop('SIGINT');
	shutdown();
});
