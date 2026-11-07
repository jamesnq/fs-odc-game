import type { GameAction, GameQuery, Identity, Requests } from '@game/shared/contracts';
import type { Room } from '../lobby.js';

/** Payload của một loại hành động game; dữ liệu vẫn đến từ client nên handler phải tự kiểm tra lúc chạy. */
export type ActionOf<T extends GameAction['type']> = Extract<GameAction, { type: T }>;
export type MoveAction = ActionOf<'move'>;

/** Ghế ngồi: người dùng thật hoặc máy (`bot` là cấp độ máy). */
export interface Seat extends Identity { bot?: string }

/** Giao diện chung mà phòng dùng để điều khiển mọi trò chơi (xem `games/index.ts`). */
export interface GameHandler {
  room: Room;
  readonly options: object;
  readonly maxPlayers: number;
  playerIds(): string[];
  isPlaying(): boolean;
  sit(user: Identity, seat?: string | number): void;
  stand(id: string): void;
  onLeave(id: string): void;
  rename(id: string, name: string): void;
  action(id: string, action: GameAction): void;
  view(viewerId: string): object;
  dispose(): void;
  botName?(id: string): string | undefined;
  query?(viewerId: string, query: GameQuery): unknown;
  stream?(id: string, payload: Requests['game:stream']): Record<string, unknown> | null | undefined | false;
  censorChat?(id: string, text: string): void;
}
