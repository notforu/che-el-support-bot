import { Scenes, session, Telegraf } from 'telegraf';
import { startScene } from './scenes';
import { replyWithError } from './utils';

require('dotenv').config();

console.log(JSON.stringify(process.env));

if (!process.env.BOT_TOKEN) {
	throw new Error('No bot token provided');
}

const bot = new Telegraf(process.env.BOT_TOKEN);

const stage = new Scenes.Stage([startScene] as any);
bot.use(session());
bot.use(stage.middleware() as any);

bot.command('/start', async (ctx) => {
	try {
		return (ctx as any).scene.enter('startScene');
	} catch (e) {
		replyWithError(ctx, e);
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
