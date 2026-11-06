import { XiangqiHandler } from './xiangqi.js';
import { PokerHandler } from './poker.js';
import { TalaHandler } from './tala.js';
import { CaroHandler } from './caro.js';
import { SamLocHandler } from './samloc.js';
import { WordChainHandler } from './wordchain.js';
import { ScribbleHandler } from './scribble.js';
import { TelephoneHandler } from './telephone.js';
import { OnetHandler } from './onet.js';

/**
 * Các trò chơi. Mỗi Handler điều khiển một bàn trong một phòng và cần có:
 *   options, maxPlayers, playerIds(), isPlaying(), sit(user, seat?), stand(id), onLeave(id),
 *   rename(id, name), action(id, payload), view(viewerId), dispose()
 * và tùy chọn query(viewerId, q) cho dữ liệu lớn lấy theo yêu cầu, stream(id, payload) cho dữ liệu
 * gửi liên tục (nét vẽ) chuyển thẳng cho người khác, censorChat(id, text) để chặn tin nhắn lộ đáp án.
 */
export const GAMES = {
  xiangqi: { name: 'Cờ tướng', Handler: XiangqiHandler },
  poker: { name: 'Poker', Handler: PokerHandler },
  tala: { name: 'Tá lả', Handler: TalaHandler },
  caro: { name: 'Cờ caro', Handler: CaroHandler },
  samloc: { name: 'Sâm lốc', Handler: SamLocHandler },
  wordchain: { name: 'Nối từ', Handler: WordChainHandler },
  scribble: { name: 'Vẽ đoán', Handler: ScribbleHandler },
  telephone: { name: 'Tam sao thất bản', Handler: TelephoneHandler },
  onet: { name: 'Nối thú', Handler: OnetHandler },
};

export const isGame = (game) => typeof game === 'string' && Object.hasOwn(GAMES, game);
