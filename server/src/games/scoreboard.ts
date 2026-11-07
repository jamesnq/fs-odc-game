import type { Identity } from '@game/shared/contracts';

interface ScorePlayer extends Identity {
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

interface MatchPlayer extends Identity { side: string }
interface MatchResult {
  no: number;
  ts: number;
  players: MatchPlayer[];
  winnerId: string | null;
  reason: string;
  moves: number;
}

// Bảng điểm cho các game đối kháng 2 người (Cờ tướng, Cờ caro).
// Điểm tính theo người chơi (không theo màu quân), cộng dồn qua các ván trong phòng:
// thắng 1 điểm, hòa ½ điểm, thua 0 điểm.

const HISTORY_MAX = 30;

export class Scoreboard {
  declare players: Map<string, ScorePlayer>;
  declare history: MatchResult[];
  declare gameNo: number;

  constructor() {
    this.players = new Map(); // id -> { id, name, games, wins, draws, losses }
    this.history = []; // { no, ts, players: [{ id, name, side }], winnerId, reason, moves }
    this.gameNo = 0;
  }

  _get({ id, name }: Identity) {
    let p = this.players.get(id);
    if (!p) {
      p = { id, name, games: 0, wins: 0, draws: 0, losses: 0 };
      this.players.set(id, p);
    }
    p.name = name;
    return p;
  }

  rename(id: string, name: string) {
    const p = this.players.get(id);
    if (p) p.name = name;
  }

  /**
   * Ghi kết quả một ván.
   * @param players [{ id, name, side }] — hai người chơi
   * @param winnerId id người thắng, null nếu hòa
   */
  record(players: readonly (MatchPlayer | null | undefined)[], winnerId: string | null, reason: string, moves: number) {
    if (players.length !== 2 || players.some((p) => !p)) return;
    const participants = players.filter((p) => p != null);
    this.gameNo++;
    for (const pl of participants) {
      const p = this._get(pl);
      p.games++;
      if (!winnerId) p.draws++;
      else if (winnerId === pl.id) p.wins++;
      else p.losses++;
    }
    this.history.push({ no: this.gameNo, ts: Date.now(), players: participants.map(({ id, name, side }) => ({ id, name, side })), winnerId, reason, moves });
    if (this.history.length > HISTORY_MAX) this.history.shift();
  }

  /** Chuỗi tỉ số ngắn cho tin nhắn hệ thống, vd "An 2 – 1 Bình". */
  line(a: Identity, b: Identity) {
    const pa = this.players.get(a.id), pb = this.players.get(b.id);
    return `${a.name} ${fmtPoints(points(pa))} – ${fmtPoints(points(pb))} ${b.name}`;
  }

  reset() {
    this.players.clear();
    this.history = [];
    this.gameNo = 0;
  }

  view() {
    const rows = [...this.players.values()]
      .map((p) => ({ ...p, points: points(p) }))
      .sort((x, y) => y.points - x.points || y.wins - x.wins || x.games - y.games);
    return { rows, history: this.history.slice().reverse(), gameNo: this.gameNo };
  }
}

const points = (p: ScorePlayer | undefined) => (p ? p.wins + p.draws / 2 : 0);
const fmtPoints = (n: number) => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ''}½`);
