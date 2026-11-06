// Tiện ích chung cho người chơi máy (bot). Bot không phải người dùng thật: không có socket, không là
// thành viên phòng; id bắt đầu bằng "bot:" (id người dùng thật không bao giờ chứa dấu ":").
export const BOT_LEVELS = ['easy', 'medium', 'hard'];
export const BOT_LEVEL_NAMES = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' };

export const isBot = (id: any) => typeof id === 'string' && id.startsWith('bot:');
export const botLevel = (v: any, def: any = null) => (BOT_LEVELS.includes(v) ? v : def);

/** Thời gian "suy nghĩ" ngẫu nhiên trong [min, max] ms cho tự nhiên. */
export const thinkMs = (min: any, max: any) => Math.round(min + Math.random() * (max - min));

/** Chỉ người đang ngồi chơi hoặc chủ phòng mới được thêm / bỏ máy. */
export function requireBotManager(handler: any, id: any) {
  if (!handler.playerIds().includes(id) && handler.room.ownerId !== id) {
    throw new Error('Chỉ người đang ngồi chơi hoặc chủ phòng mới được thêm / bỏ máy');
  }
}

let botSeq = 0;
/** Id duy nhất cho một máy (dùng khi một bàn có nhiều máy). */
export const newBotId = () => `bot:${(++botSeq).toString(36)}`;
