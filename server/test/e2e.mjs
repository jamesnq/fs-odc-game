// Kiểm thử tích hợp: node server/test/e2e.mjs [url]
// Mô phỏng nhiều người chơi kết nối qua Socket.IO tới server đang chạy.
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const URL = process.argv[2] || 'http://localhost:3001';
const PASSWORD = process.env.APP_PASSWORD || '';
// Mật khẩu của một server khác (khi chạy với APP_SERVERS) để kiểm tra các server tách biệt
const OTHER_PASSWORD = process.env.OTHER_PASSWORD || '';

function client(name, password = PASSWORD) {
  const s = io(URL, { transports: ['websocket'], forceNew: true, auth: { password } });
  const c = { s, name, state: null, user: null };
  s.on('room:state', (st) => { c.state = st; });
  c.req = (ev, p = {}) => new Promise((res, rej) => s.timeout(5000).emit(ev, p, (err, r) => (err ? rej(err) : r.ok ? res(r) : rej(new Error(`${name} ${ev}: ${r.error}`)))));
  c.ready = new Promise((res) => s.on('connect', async () => { const r = await c.req('hello', { name }); c.user = r.user; c.token = r.token; res(c); }));
  c.act = (a) => c.req('game:action', a);
  return c;
}
/** Kiểm chứng xáo bài commit–reveal như trình duyệt làm; trả về số lá được công bố. */
const sha256 = (x) => crypto.createHash('sha256').update(x).digest('hex');
function verifyFair(seenCommit, f) {
  assert.ok(seenCommit, 'phải nhận commit lúc đầu ván');
  assert.equal(f.commit, seenCommit, 'commit không đổi');
  assert.equal(f.leaves.length, f.total);
  assert.equal(sha256(f.leaves.join('')), seenCommit, 'leaves băm ra commit');
  for (const { i, card, salt } of f.cards) assert.equal(sha256(`${i}:${card}:${salt}`), f.leaves[i], `lá ${card} khớp`);
  assert.equal(new Set(f.cards.map((x) => x.card)).size, f.cards.length, 'không lá nào trùng');
  return f.cards.length;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await wait(20); }
  throw new Error('timeout chờ điều kiện');
};

// ---------- Auth gate ----------
if (PASSWORD) {
  const tryConnect = (auth) => new Promise((res) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false, auth });
    s.on('connect', () => { s.close(); res('ok'); });
    s.on('connect_error', (e) => { s.close(); res(e.message); });
  });
  assert.equal(await tryConnect({}), 'AUTH_REQUIRED');
  assert.equal(await tryConnect({ password: PASSWORD + 'x' }), 'AUTH_FAILED');
  assert.equal(await tryConnect({ password: PASSWORD }), 'ok');
  console.log('✔ Auth gate OK');

  // Phiên đăng nhập: hello trả session, lần sau vào bằng session không cần mật khẩu
  const session = await new Promise((res, rej) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false, auth: { password: PASSWORD } });
    s.on('connect', () => s.emit('hello', { name: 'Phiên' }, (r) => { s.close(); r.ok ? res(r.session) : rej(new Error(r.error)); }));
  });
  assert.match(session, /^[\w-]+\.\d+\.[\w-]+$/);
  assert.equal(await tryConnect({ session }), 'ok');
  assert.equal(await tryConnect({ session: session.slice(0, -2) + 'xx' }), 'AUTH_REQUIRED', 'session bị sửa không dùng được');
  const [sid, , sig] = session.split('.');
  assert.equal(await tryConnect({ session: `${sid}.${Date.now() + 1e12}.${sig}` }), 'AUTH_REQUIRED', 'không tự gia hạn được');
  console.log('✔ Phiên đăng nhập OK');

  // X-Forwarded-For giả không vượt được giới hạn đoán mật khẩu (server CI chạy với TRUST_PROXY=1)
  if (process.env.TRUST_PROXY) {
    const spoof = (i, real = '203.0.113.7') => ({ 'X-Forwarded-For': `10.0.${i}.${i}, ${real}` });
    const tryXff = (headers, auth) => new Promise((res) => {
      const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false, auth, extraHeaders: headers });
      s.on('connect', () => { s.close(); res('ok'); });
      s.on('connect_error', (e) => { s.close(); res(e.message); });
    });
    const got = [];
    for (let i = 0; i < 11; i++) got.push(await tryXff(spoof(i), { password: 'sai-' + i }));
    assert.equal(got.at(-1), 'AUTH_LOCKED', 'đổi phần đầu XFF vẫn bị khóa: ' + got.join(','));
    assert.equal(await tryXff(spoof(99), { password: PASSWORD }), 'AUTH_LOCKED', 'IP đã khóa thì mật khẩu đúng cũng phải chờ');
    assert.equal(await tryXff(spoof(1, '203.0.113.8'), { password: PASSWORD }), 'ok', 'IP khác không bị ảnh hưởng');
    console.log('✔ Chống giả X-Forwarded-For OK');
  }
}

// ---------- Header bảo mật & Origin ----------
{
  const r = await fetch(URL + '/health');
  assert.match(r.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
  const body = await r.json();
  assert.equal(body.users, undefined, '/health không lộ số người dùng');
  const tryOrigin = (origin) => new Promise((res) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false, auth: { password: PASSWORD }, extraHeaders: { Origin: origin } });
    s.on('connect', () => { s.close(); res('ok'); });
    s.on('connect_error', (e) => { s.close(); res('ERR ' + e.message); });
  });
  assert.notEqual(await tryOrigin('https://evil.example'), 'ok', 'trang lạ không mở được socket');
  assert.equal(await tryOrigin(new globalThis.URL(URL).origin), 'ok', 'cùng origin thì được');
  console.log('✔ Header bảo mật & kiểm tra Origin OK');
}

// ---------- Giới hạn tần suất ----------
{
  const z = await client('Spam').ready;
  const { roomId } = await z.req('room:create', { name: 'Spam', game: 'caro', options: {} });
  const res = await Promise.all(Array.from({ length: 12 }, (_, i) => z.req('room:chat', { text: 'x' + i }).then(() => 'ok', (e) => e.message)));
  assert.ok(res.filter((x) => x === 'ok').length <= 6, 'chat bị giới hạn');
  assert.ok(res.some((x) => /quá nhanh/.test(x)));
  await assert.rejects(z.req('room:create', { name: 'x', game: 'toString' }), /không hợp lệ/);
  await z.req('room:delete', { roomId });
  z.s.close();
  console.log('✔ Giới hạn tần suất OK');
}

// ---------- Phiên bản (báo bản deploy mới) ----------
{
  const health = await (await fetch(URL + '/health')).json();
  const got = await new Promise((res) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false, auth: { password: PASSWORD } });
    s.on('app:version', (v) => { s.close(); res(v.version); });
    s.on('connect_error', (e) => { s.close(); res('ERR ' + e.message); });
  });
  assert.equal(got, health.version, 'server gửi phiên bản khi kết nối, khớp với /health');
  console.log(`✔ Phiên bản OK (${got || 'chưa build client'})`);
}

const [a, b, c, d] = await Promise.all(['An', 'Bình', 'Chi', 'Dũng'].map((n) => client(n).ready));

// ---------- Cờ tướng ----------
{
  const { roomId } = await a.req('room:create', { name: 'Cờ test', game: 'xiangqi', options: { minutes: 8 } });
  await b.req('room:join', { roomId, mode: 'play' });
  await c.req('room:join', { roomId, mode: 'watch' });
  await until(() => c.state?.members.length === 3);
  assert.equal(c.state.state.myColor, null, 'người xem không có màu');
  await a.act({ type: 'ready' });
  await b.act({ type: 'ready' });
  await until(() => a.state.state.status === 'playing');
  const red = a.state.state.myColor === 'r' ? a : b;
  const black = red === a ? b : a;
  await red.act({ type: 'move', from: 7 * 9 + 7, to: 7 * 9 + 4 }); // P2-5
  await assert.rejects(red.act({ type: 'move', from: 7 * 9 + 1, to: 7 * 9 + 4 }), /lượt/);
  await assert.rejects(c.act({ type: 'resign' }), /xem/);
  // xin đi lại -> đối thủ đồng ý
  await red.act({ type: 'requestUndo' });
  await black.act({ type: 'respond', accept: true });
  await until(() => red.state.state.moves.length === 0 && red.state.state.turn === 'r');
  await red.act({ type: 'move', from: 7 * 9 + 7, to: 7 * 9 + 4 });
  // cầu hòa -> từ chối
  await black.act({ type: 'offerDraw' });
  await red.act({ type: 'respond', accept: false });
  await until(() => !red.state.state.pending);
  await until(() => c.state.state.moves.length === 1);
  assert.ok(c.state.state.clocks.r <= 8 * 60000 && c.state.state.clocks.r > 7 * 60000);
  await black.act({ type: 'resign' });
  await until(() => a.state.state.status === 'over');
  assert.equal(a.state.state.result.winner, 'r');
  // Mỗi người nhận trạng thái riêng: chờ chính người xem (c) nhận xong rồi mới đọc
  await until(() => c.state.state.score.gameNo === 1);
  const sc = c.state.state.score;
  assert.equal(sc.gameNo, 1);
  assert.equal(sc.rows[0].id, red.user.id, 'người thắng đứng đầu bảng điểm');
  assert.deepEqual([sc.rows[0].wins, sc.rows[0].points, sc.rows[1].losses, sc.rows[1].points], [1, 1, 1, 0]);
  await assert.rejects(b.act({ type: 'resetScore' }), /chủ phòng/);
  await a.act({ type: 'rematch' });
  await b.act({ type: 'rematch' });
  await until(() => a.state.state.status === 'playing');
  assert.notEqual(red.state.state.myColor, 'r', 'đổi màu khi chơi lại');
  await c.req('room:leave');
  await a.req('room:delete', { roomId });
  await until(() => b.state === null || true);
  console.log('✔ Cờ tướng OK');
}

// ---------- Cờ caro ----------
{
  a.state = b.state = c.state = null;
  const { roomId } = await a.req('room:create', { name: 'Caro test', game: 'caro', options: { size: 15, minutes: 5, blockTwoEnds: true } });
  await b.req('room:join', { roomId, mode: 'play' });
  await c.req('room:join', { roomId, mode: 'watch' });
  await until(() => c.state?.members.length === 3);
  await a.act({ type: 'ready' });
  await b.act({ type: 'ready' });
  await until(() => a.state.state.status === 'playing');
  assert.equal(a.state.state.size, 15);
  const x = a.state.state.myColor === 'x' ? a : b;
  const o = x === a ? b : a;
  await x.act({ type: 'move', cell: 7 * 15 + 7 });
  await assert.rejects(x.act({ type: 'move', cell: 0 }), /lượt/);
  await assert.rejects(o.act({ type: 'move', cell: 7 * 15 + 7 }), /đã có quân/);
  await assert.rejects(o.act({ type: 'requestUndo' }), /Không có nước/); // O chưa đi
  await x.act({ type: 'requestUndo' });
  await o.act({ type: 'respond', accept: true });
  await until(() => x.state.state.moves.length === 0 && x.state.state.turn === 'x');
  for (let k = 0; k < 4; k++) {
    await x.act({ type: 'move', cell: 7 * 15 + 3 + k });
    await o.act({ type: 'move', cell: 9 * 15 + 3 + k });
  }
  await x.act({ type: 'move', cell: 7 * 15 + 7 });
  await until(() => c.state.state.status === 'over');
  assert.equal(c.state.state.result.winner, 'x');
  assert.equal(c.state.state.result.line.length, 5);
  await a.act({ type: 'rematch' });
  await b.act({ type: 'rematch' });
  await until(() => a.state.state.status === 'playing');
  assert.equal(o.state.state.myColor, 'x', 'đổi lượt đi khi chơi lại');
  await o.act({ type: 'offerDraw' });
  await x.act({ type: 'respond', accept: true });
  await until(() => c.state.state.status === 'over');
  const sc = c.state.state.score;
  const row = (u) => sc.rows.find((r) => r.id === u.user.id);
  assert.deepEqual([row(x).wins, row(x).draws, row(x).points], [1, 1, 1.5], 'điểm cộng theo người, không theo màu');
  assert.deepEqual([row(o).losses, row(o).draws, row(o).points], [1, 1, 0.5]);
  assert.equal(sc.history.length, 2);
  await a.act({ type: 'resetScore' });
  await until(() => c.state.state.score.rows.length === 0);
  await c.req('room:leave');
  await a.req('room:delete', { roomId });
  console.log('✔ Cờ caro OK');
}

// ---------- Poker ----------
{
  a.state = b.state = c.state = null;
  const { roomId } = await a.req('room:create', { name: 'Poker test', game: 'poker', options: { smallBlind: 5, bigBlind: 20, buyIn: 1000, maxSeats: 6 } });
  await b.req('room:join', { roomId, mode: 'play' });
  await c.req('room:join', { roomId, mode: 'play' });
  await until(() => a.state?.state.hand?.street === 'preflop', 5000);
  assert.deepEqual([a.state.state.smallBlind, a.state.state.bigBlind], [5, 20], 'small blind nhập riêng');
  const players = [a, b, c];
  let acted = 0;
  // Chơi vài hành động: ai tới lượt thì call
  while (acted < 12) {
    await until(() => players.some((p) => p.state.state.options) || a.state.state.hand.street === 'done', 8000);
    if (a.state.state.hand.street === 'done') break;
    const p = players.find((x) => x.state.state.options);
    await p.act({ type: 'act', action: 'call' });
    acted++;
    await wait(30);
  }
  const total = a.state.state.seats.filter(Boolean).reduce((s, x) => s + x.chips + x.bet, 0) + (a.state.state.hand.street === 'done' ? 0 : a.state.state.hand.pot - a.state.state.seats.filter(Boolean).reduce((s, x) => s + x.bet, 0));
  assert.equal(total, 3000);
  // Người xem không thấy bài tẩy người khác
  const hidden = a.state.state.seats.filter((x) => x && x.id !== a.user.id).every((x) => !x.hole || x.hole.every((h) => h === '??') || a.state.state.hand.street === 'done');
  assert.ok(hidden, 'không lộ bài');
  // Hands log: chơi tiếp cho hết ván (người đầu tiên tới lượt bỏ bài, còn lại theo/check)
  let folded = false;
  while (!a.state.state.handLogCount) {
    await until(() => players.some((p) => p.state.state.options) || a.state.state.handLogCount, 8000);
    if (a.state.state.handLogCount) break;
    const p = players.find((x) => x.state.state.options);
    await p.act({ type: 'act', action: folded ? 'call' : 'fold' }).catch(() => {});
    folded = true;
    await wait(30);
  }
  for (const p of players) {
    const { data } = await p.req('game:query', { type: 'handLog' });
    assert.equal(data.length, 1);
    const e = data[0];
    assert.equal(e.no, 1);
    assert.equal(e.players.reduce((s, x) => s + x.net, 0), 0, 'tổng lời/lỗ bằng 0');
    assert.ok(e.actions.length >= 3);
    for (const x of e.players) {
      const visible = x.id === p.user.id || !!e.shown[x.seat];
      assert.equal(!!x.hole, visible, `${p.name} chỉ thấy bài của mình và bài đã lật`);
    }
    assert.ok(e.players.some((x) => x.folded && x.id !== p.user.id ? x.hole === null : true));
  }
  // Đổi blind: chỉ chủ phòng; giữa ván thì chờ ván sau
  await assert.rejects(b.act({ type: 'setBlinds', smallBlind: 5, bigBlind: 10 }), /chủ phòng/);
  await assert.rejects(a.act({ type: 'setBlinds', smallBlind: 40, bigBlind: 30 }), /Small blind/);
  await a.act({ type: 'setBlinds', smallBlind: 15, bigBlind: 30 });
  await until(() => c.state.state.bigBlind === 30 || c.state.state.nextBlinds?.bigBlind === 30);
  await until(() => c.state.state.hand?.no === 2 && c.state.state.bigBlind === 30, 10000);
  assert.equal(c.state.state.smallBlind, 15);
  await a.req('room:delete', { roomId });
  console.log('✔ Poker OK (Hands log, đổi blind)');
}

// ---------- Poker: rabbit hunt ----------
{
  a.state = b.state = c.state = null;
  const { roomId } = await a.req('room:create', { name: 'Rabbit test', game: 'poker', options: { bigBlind: 20, buyIn: 1000, maxSeats: 2 } });
  await b.req('room:join', { roomId, mode: 'play' });
  await c.req('room:join', { roomId, mode: 'watch' });
  await until(() => a.state?.state.hand?.street === 'preflop' && b.state?.state.hand?.street === 'preflop', 5000);
  await until(() => c.state?.state.fair?.commit);
  const commitSeen = c.state.state.fair.commit;
  assert.equal(c.state.state.fair.leaves, undefined, 'đang chơi thì chưa công bố bộ bài');
  const p = [a, b].find((x) => x.state.state.options);
  await p.act({ type: 'act', action: 'fold' });
  await until(() => a.state.state.canRabbit && c.state?.state.hand?.street === 'done');
  assert.equal(c.state.state.canRabbit, false, 'người xem không được lật rabbit');
  assert.equal(c.state.state.hand.rabbit, null, 'chưa lật thì không lộ bài');
  await assert.rejects(c.act({ type: 'rabbit' }), /xem/);
  await b.act({ type: 'rabbit' });
  await until(() => c.state.state.hand.rabbit);
  assert.equal(c.state.state.hand.rabbit.length, 5, 'bỏ bài preflop → lật đủ 5 lá');
  await assert.rejects(a.act({ type: 'rabbit' }), /rồi/);
  const { data } = await c.req('game:query', { type: 'handLog' });
  assert.deepEqual(data[0].rabbit, c.state.state.hand.rabbit, 'Hands log ghi rabbit');
  await until(() => c.state.state.fair?.leaves && b.state.state.fair?.leaves);
  assert.equal(verifyFair(commitSeen, c.state.state.fair), 5, 'người xem chỉ thấy 5 lá rabbit, bài bỏ vẫn kín');
  assert.equal(verifyFair(commitSeen, b.state.state.fair), 7, 'người chơi thấy thêm 2 lá tẩy của mình');
  await a.req('room:delete', { roomId });
  // Bàn tắt rabbit hunt
  const { roomId: r2 } = await a.req('room:create', { name: 'No rabbit', game: 'poker', options: { bigBlind: 20, buyIn: 1000, maxSeats: 2, rabbitHunt: false } });
  await b.req('room:join', { roomId: r2, mode: 'play' });
  await until(() => a.state?.state.hand?.street === 'preflop' && a.state.state.hand && b.state?.state.hand?.street === 'preflop', 5000);
  await [a, b].find((x) => x.state.state.options).act({ type: 'act', action: 'fold' });
  await until(() => a.state.state.hand.street === 'done');
  assert.equal(a.state.state.canRabbit, false);
  await assert.rejects(a.act({ type: 'rabbit' }), /không cho/);
  await a.req('room:delete', { roomId: r2 });
  console.log('✔ Poker rabbit hunt OK');
}

// ---------- Nhiều server: sảnh và phòng tách biệt ----------
if (OTHER_PASSWORD) {
  const x = await client('Xuân', OTHER_PASSWORD).ready;
  const hx = await x.req('hello', { token: x.token });
  const ha = await a.req('hello', { token: a.token });
  assert.equal(ha.user.id, a.user.id);
  assert.notEqual(hx.server.id, ha.server.id, 'hai mật khẩu vào hai server khác nhau');
  const { roomId: rx } = await x.req('room:create', { name: 'Phòng bên B', game: 'caro', options: {} });
  const { roomId: ra } = await a.req('room:create', { name: 'Phòng bên A', game: 'caro', options: {} });
  const listA = (await a.req('lobby:list')).rooms.map((r) => r.id);
  const listX = (await x.req('lobby:list')).rooms.map((r) => r.id);
  assert.ok(listA.includes(ra) && !listA.includes(rx), 'sảnh A không thấy phòng của B');
  assert.ok(listX.includes(rx) && !listX.includes(ra), 'sảnh B không thấy phòng của A');
  await assert.rejects(x.req('room:join', { roomId: ra, mode: 'watch' }), /không tồn tại/);
  await assert.rejects(a.req('room:join', { roomId: rx, mode: 'watch' }), /không tồn tại/);
  await a.req('room:delete', { roomId: ra });
  await x.req('room:delete', { roomId: rx });
  // Token của server A không dùng được ở server B → thành người dùng mới
  const hx2 = await x.req('hello', { tokens: { [hx.server.id]: ha.token }, token: ha.token, name: 'Xuân' });
  assert.notEqual(hx2.user.id, ha.user.id, 'không mượn được danh tính của server khác');
  x.s.close();
  console.log(`✔ Nhiều server OK (${ha.server.name} / ${hx.server.name})`);
}

// ---------- Sâm lốc ----------
{
  a.state = b.state = c.state = d.state = null;
  const { roomId } = await a.req('room:create', { name: 'Sâm test', game: 'samloc', options: { maxSeats: 3, unit: 10 } });
  await b.req('room:join', { roomId, mode: 'play' });
  await c.req('room:join', { roomId, mode: 'play' });
  await d.req('room:join', { roomId, mode: 'watch' });
  await until(() => d.state?.state.seats.filter(Boolean).length === 3);
  await assert.rejects(d.act({ type: 'start' }), /xem/);
  await a.act({ type: 'start' });
  await until(() => [a, b, c, d].every((p) => p.state?.state.game));
  const samCommit = d.state.state.fair.commit;
  const players = [a, b, c];
  const g0 = d.state.state.game;
  assert.ok(g0.players.every((p) => p.hand === null) || g0.result, 'người xem không thấy bài');
  if (!g0.result) {
    assert.equal(a.state.state.game.players[a.state.state.game.me].hand.length, 10);
    for (const p of players) await p.act({ type: 'sam', yes: false }).catch(() => {});
    await until(() => d.state.state.game.phase !== 'sam');
    // Đánh tới khi có người hết bài: đi đầu thì thử lá nhỏ nhất hợp lệ, không thì bỏ lượt
    for (let guard = 0; guard < 200 && !d.state.state.game.result; guard++) {
      const turn = d.state.state.game.turn;
      const p = players.find((x) => x.state.state.game.me === turn);
      await until(() => p.state.state.game.turn === turn && p.state.state.game.phase === 'play' || d.state.state.game.result);
      if (d.state.state.game.result) break;
      const pg = p.state.state.game;
      const hand = pg.players[pg.me].hand;
      if (pg.lastPlay) await p.act({ type: 'pass' });
      else {
        let ok = false;
        for (const card of hand) { try { await p.act({ type: 'play', cards: [card] }); ok = true; break; } catch { /* báo 1 */ } }
        assert.ok(ok, 'phải đánh được 1 lá');
      }
      await until(() => d.state.state.game.turn !== turn || d.state.state.game.result);
    }
  }
  await until(() => d.state.state.game.result);
  const r = d.state.state.game.result;
  assert.equal(r.scores.reduce((x, y) => x + y, 0), 0, 'tổng thắng thua bằng 0');
  assert.ok(d.state.state.game.players.every((p) => Array.isArray(p.hand)), 'hết ván lật bài');
  assert.equal(verifyFair(samCommit, d.state.state.fair), 52, 'hết ván công bố cả bộ bài');
  const totals = d.state.state.seats.filter(Boolean).map((x) => x.total);
  assert.equal(totals.reduce((x, y) => x + y, 0), 0);
  await a.req('room:delete', { roomId });
  console.log('✔ Sâm lốc OK —', r.text);
}

// ---------- Nối từ ----------
{
  a.state = b.state = c.state = d.state = null;
  const { roomId } = await a.req('room:create', { name: 'Nối từ test', game: 'wordchain', options: { turnSeconds: 15, lives: 1 } });
  await b.req('room:join', { roomId, mode: 'play' });
  await c.req('room:join', { roomId, mode: 'play' });
  await d.req('room:join', { roomId, mode: 'watch' });
  await until(() => d.state?.state.seats.length === 3);
  for (const p of [a, b, c]) await p.act({ type: 'ready' });
  await until(() => d.state.state.status === 'playing');
  // Người ra từ đầu tiên là ngẫu nhiên: xếp lại x/y/z theo thứ tự lượt thực tế
  const order = [a, b, c];
  const fi = order.findIndex((p) => p.user.id === d.state.state.game.currentId);
  assert.ok(fi >= 0, 'người đi đầu là một trong các người chơi');
  const [x, y, z] = [order[fi], order[(fi + 1) % 3], order[(fi + 2) % 3]];
  await assert.rejects(y.act({ type: 'word', text: 'đắng cay' }), /lượt/);
  await assert.rejects(x.act({ type: 'word', text: 'mèo' }), /2 chữ/);
  await assert.rejects(x.act({ type: 'word', text: 'con xyzq' }), /từ điển/);
  await assert.rejects(x.act({ type: 'word', text: 'tành mui' }), /"tành mui" không có trong từ điển/);
  await assert.rejects(d.act({ type: 'word', text: 'đắng cay' }), /xem/);
  await x.act({ type: 'word', text: 'Đắng Cay' });
  await until(() => d.state.state.game.required === 'cay');
  await assert.rejects(y.act({ type: 'word', text: 'con chó' }), /bắt đầu bằng "cay"/);
  await y.act({ type: 'word', text: 'cay đắng' });
  await assert.rejects(z.act({ type: 'word', text: 'đắng cay' }), /đã được dùng/);
  // Phản đối: x và z cùng phản đối "cay đắng" → gỡ, lượt về y
  await x.act({ type: 'object' });
  await z.act({ type: 'object' });
  await until(() => d.state.state.game.total === 1 && d.state.state.game.currentId === y.user.id);
  await y.act({ type: 'word', text: 'cay cực' });
  await z.act({ type: 'word', text: 'cực khổ' });
  // Chịu thua dần → người cuối thắng
  await x.act({ type: 'giveup' });
  await y.act({ type: 'giveup' });
  await until(() => d.state.state.status === 'over');
  assert.equal(d.state.state.game.result.winner, z.user.id);
  assert.deepEqual(d.state.state.game.result.ranking, [z.user.id, y.user.id, x.user.id]);
  assert.equal(d.state.state.wins[0].id, z.user.id);
  assert.deepEqual(d.state.state.history[0].words.map((w) => w.s.join(' ')), ['đắng cay', 'cay cực', 'cực khổ'], 'lịch sử lưu cả chuỗi từ của ván');
  await a.req('room:delete', { roomId });
  console.log('✔ Nối từ OK');
}

// ---------- Voice chat: vào/rời kênh, chuyển tín hiệu WebRTC, tắt mic ----------
{
  const h = await fetch(URL + '/health');
  assert.match(h.headers.get('permissions-policy') || '', /microphone=\(self\)/, 'cho phép micro trên trang mình');
  // Chỉ server có tên trong VOICE_SERVERS mới có voice chat (CI: VOICE_SERVERS="Bên A")
  if (OTHER_PASSWORD) {
    const o = client('Ngoài', OTHER_PASSWORD);
    await o.ready;
    const hello = await o.req('hello', { name: 'Ngoài' });
    assert.equal(hello.voice.enabled, false, 'server không có trong VOICE_SERVERS thì không có voice');
    const r = await o.req('room:create', { name: 'x', game: 'caro' });
    await assert.rejects(() => o.req('voice:join', {}), /không bật/);
    await o.req('room:delete', { roomId: r.roomId });
    o.s.close();
  }
  a.state = b.state = c.state = null;
  const { roomId } = await a.req('room:create', { name: 'Voice test', game: 'caro' });
  await b.req('room:join', { roomId, mode: 'watch' });
  await c.req('room:join', { roomId, mode: 'watch' });
  const ja = await a.req('voice:join', { muted: false });
  assert.ok(Array.isArray(ja.iceServers) && ja.iceServers.length, 'có ICE server');
  assert.deepEqual(ja.peers, []);
  const jb = await b.req('voice:join', { muted: true });
  assert.deepEqual(jb.peers, [a.user.id]);
  await until(() => c.state?.voice?.length === 2);
  assert.equal(c.state.voice.find((v) => v.id === b.user.id).muted, true);
  // Tín hiệu đi đúng người nhận
  const got = new Promise((res) => b.s.once('voice:signal', res));
  await a.req('voice:signal', { to: b.user.id, data: { description: { type: 'offer', sdp: 'v=0' } } });
  const sig = await got;
  assert.equal(sig.from, a.user.id);
  assert.equal(sig.data.description.type, 'offer');
  // Người ngoài kênh thoại không gửi / nhận được; dữ liệu rác bị từ chối
  let leaked = false;
  c.s.once('voice:signal', () => { leaked = true; });
  await c.req('voice:signal', { to: a.user.id, data: { candidate: null } });
  await assert.rejects(() => a.req('voice:signal', { to: b.user.id, data: { evil: 1 } }));
  await a.req('voice:signal', { to: c.user.id, data: { candidate: null } });
  await wait(100);
  assert.equal(leaked, false, 'người ngoài kênh không nhận tín hiệu');
  await b.req('voice:mute', { muted: false });
  await until(() => c.state.voice.find((v) => v.id === b.user.id)?.muted === false);
  await b.req('voice:leave');
  await until(() => c.state.voice.length === 1);
  // Rời phòng → tự ra khỏi kênh thoại
  await a.req('room:leave');
  await until(() => c.state.voice.length === 0);
  console.log('✔ Voice chat OK (kênh thoại, chuyển tín hiệu, tắt mic)');
  await b.req('room:leave');
  await c.req('room:leave');
}

// ---------- Tá lả ----------
{
  a.state = b.state = c.state = d.state = null;
  const { roomId } = await a.req('room:create', { name: 'Phỏm test', game: 'tala', options: { maxSeats: 4, unit: 10 } });
  for (const p of [b, c, d]) await p.req('room:join', { roomId, mode: 'play' });
  await until(() => a.state?.state.seats.filter(Boolean).length === 4);
  await a.act({ type: 'start' });
  const all = [a, b, c, d];
  await until(() => a.state.state.game);
  let guard = 0;
  while (!a.state.state.game.result && guard++ < 80) {
    const g = a.state.state.game;
    const p = all.find((x) => x.user.id === g.players[g.turn].id);
    await until(() => p.state?.state.game?.turn === g.turn);
    const pg = p.state.state.game;
    const me = pg.players[pg.me];
    if (pg.phase === 'draw') { await p.act({ type: pg.canEat ? 'eat' : 'draw' }); }
    await until(() => p.state.state.game.phase !== 'draw' || p.state.state.game.result);
    if (p.state.state.game.result) break;
    if (p.state.state.game.canU) { await p.act({ type: 'u' }); break; }
    if (p.state.state.game.phase === 'lay') await p.act({ type: 'autoLay' });
    await wait(30);
    const g2 = p.state.state.game;
    const mine = g2.players[g2.me];
    // đánh lá: thử từng lá đến khi hợp lệ
    let ok = false;
    for (const card of mine.hand.filter((x) => !mine.eaten.includes(x))) {
      try { await p.act({ type: 'discard', card }); ok = true; break; } catch { /* thử lá khác */ }
    }
    assert.ok(ok, 'phải đánh được 1 lá');
    await wait(30);
    void me;
  }
  await until(() => a.state.state.game.result);
  const r = a.state.state.game.result;
  assert.equal(r.scores.reduce((x, y) => x + y, 0), 0);
  console.log('✔ Tá lả OK —', r.type === 'u' ? 'Ù' : 'Nhất: ' + a.state.state.game.players[r.winner].name);
  await a.req('room:delete', { roomId });
}

// ---------- Chơi với máy: Cờ caro ----------
{
  a.state = null;
  const { roomId } = await a.req('room:create', { name: 'Caro máy', game: 'caro', options: { minutes: 5, bot: 'hard' } });
  await until(() => a.state?.state.seats.o?.bot === 'hard');
  assert.equal(a.state.state.myColor, 'x', 'người tạo bàn ngồi X, máy ngồi O');
  assert.equal(a.state.state.ready.o, true, 'máy luôn sẵn sàng');
  const list = await a.req('lobby:list');
  assert.ok(list.rooms.find((r) => r.id === roomId).playerNames.some((n) => n.includes('Máy')), 'sảnh hiện tên máy');
  await assert.rejects(a.act({ type: 'addBot', level: 'easy' }), /đã có máy/);
  await a.act({ type: 'ready' });
  await until(() => a.state.state.status === 'playing');
  await a.act({ type: 'move', cell: 7 * 15 + 7 });
  await until(() => a.state.state.moves.length === 2, 4000);
  assert.equal(a.state.state.turn, 'x', 'máy đã đi, tới lượt người');
  await a.act({ type: 'requestUndo' }); // máy đồng ý cho đi lại
  await until(() => a.state.state.moves.length === 0, 4000);
  await a.act({ type: 'move', cell: 7 * 15 + 7 });
  await until(() => a.state.state.moves.length === 2, 4000);
  await a.act({ type: 'offerDraw' }); // máy từ chối cầu hòa
  await until(() => !a.state.state.pending, 4000);
  assert.equal(a.state.state.status, 'playing');
  await a.act({ type: 'resign' });
  await until(() => a.state.state.status === 'over');
  assert.equal(a.state.state.result.winner, 'o');
  await a.act({ type: 'rematch' }); // máy luôn đồng ý chơi lại, đổi lượt: máy đi trước
  await until(() => a.state.state.status === 'playing' && a.state.state.moves.length === 1, 4000);
  assert.equal(a.state.state.myColor, 'o');
  await a.act({ type: 'resign' });
  await until(() => a.state.state.status === 'over');
  await a.act({ type: 'removeBot' });
  await until(() => !a.state.state.seats.x);
  await a.act({ type: 'addBot', level: 'easy' });
  await until(() => a.state.state.seats.x?.bot === 'easy');
  await a.req('room:delete', { roomId });
  console.log('✔ Cờ caro chơi với máy OK');
}

// ---------- Chơi với máy: Nối từ ----------
{
  a.state = null;
  const { roomId } = await a.req('room:create', { name: 'Nối từ máy', game: 'wordchain', options: { turnSeconds: 10, bot: 'medium', bots: 2 } });
  await until(() => a.state?.state.seats.length === 3);
  assert.equal(a.state.state.seats.filter((x) => x.bot).length, 2);
  await a.act({ type: 'ready' });
  await until(() => a.state.state.status === 'playing');
  await assert.rejects(a.act({ type: 'removeBot', id: a.state.state.seats.find((x) => x.bot).id }), /đang diễn ra/);
  const g = () => a.state.state.game;
  // Tới lượt mình thì nối, chờ đủ 2 từ của máy
  const start = Date.now();
  while (g().chain.filter((w) => w.by.startsWith('bot:')).length < 2 && Date.now() - start < 20000) {
    if (g().currentId === a.user.id && !a.busy) {
      a.busy = true;
      const req = g().required;
      await a.act({ type: 'word', text: req ? `${req} ${req}` : 'học tập' }).catch(() => a.act({ type: 'giveup' }));
      a.busy = false;
    }
    if (a.state.state.status !== 'playing') break;
    await wait(50);
  }
  const botWords = g().chain.filter((w) => w.by.startsWith('bot:'));
  assert.ok(botWords.length >= 1, 'máy đã nối từ');
  await a.req('room:delete', { roomId });
  console.log('✔ Nối từ chơi với máy OK —', botWords.map((w) => w.text).join(', '));
}

// ---------- Đố vui ----------
{
  a.state = b.state = c.state = null;
  const { roomId } = await a.req('room:create', { name: 'Đố vui test', game: 'quiz', options: { questions: 3, seconds: 5 } });
  await b.req('room:join', { roomId, mode: 'play' });
  await c.req('room:join', { roomId, mode: 'watch' });
  await until(() => c.state?.state.seats.length === 2);
  assert.equal(c.state.state.source.type, 'builtin');
  assert.ok(c.state.state.bankSize >= 100, 'có bộ câu hỏi soạn sẵn');
  await assert.rejects(b.act({ type: 'loadQuiz', text: '? Hỏi\n- a\n- b' }), /đúng 1 đáp án đúng/);
  await assert.rejects(c.act({ type: 'loadQuiz', text: '? Hỏi\n* a\n- b' }), /người đang chơi hoặc chủ phòng/);
  const QUIZ = '# Bộ của Bình\n? Một cộng một bằng mấy?\n* 2\n- 3\n- 11\n? Mèo kêu thế nào?\n* Meo meo\n- Gâu gâu\n? Nước sôi ở bao nhiêu độ C?\n- 50\n* 100\n- 0\n- 200\n';
  const RIGHT = { 'Một cộng một bằng mấy?': '2', 'Mèo kêu thế nào?': 'Meo meo', 'Nước sôi ở bao nhiêu độ C?': '100' };
  await b.act({ type: 'loadQuiz', text: QUIZ });
  await until(() => c.state.state.source.type === 'custom');
  assert.equal(c.state.state.source.title, 'Bộ của Bình');
  await a.act({ type: 'ready' });
  await b.act({ type: 'ready' });
  await until(() => c.state.state.status === 'playing');
  for (let k = 0; k < 3; k++) {
    await until(() => a.state.state.game.phase === 'question' && a.state.state.game.index === k, 5000);
    const g = a.state.state.game;
    assert.equal(g.reveal, null, 'client không biết đáp án khi đang hỏi');
    const right = g.question.choices.indexOf(RIGHT[g.question.q]);
    const wrong = right === 0 ? 1 : 0;
    await a.act({ type: 'answer', choice: right });
    await assert.rejects(a.act({ type: 'answer', choice: wrong }), /đã trả lời/);
    await b.act({ type: 'answer', choice: k === 1 ? right : wrong }); // cả hai đã trả lời → hiện đáp án ngay
    await until(() => a.state.state.game.phase === 'reveal' || a.state.state.status === 'over');
    if (a.state.state.status === 'over') break;
    assert.equal(a.state.state.game.reveal.answer, right);
    assert.ok(a.state.state.game.me.last.points > 500, 'trả lời đúng và nhanh được trên 500 điểm');
    if (k < 2) await a.act({ type: 'next' });
  }
  await until(() => c.state.state.status === 'over', 8000);
  const lb = c.state.state.game.leaderboard;
  assert.equal(lb[0].id, a.user.id, 'An đúng cả 3 câu đứng đầu');
  assert.equal(lb[0].correct, 3);
  assert.equal(lb[1].correct, 1);
  assert.ok(lb[0].score > 3 * 900 + 100 + 200, 'có thưởng chuỗi');
  assert.equal(c.state.state.wins[0].wins, 1);
  assert.equal(c.state.state.history[0].title, 'Bộ của Bình');
  // Quay về bộ có sẵn, đổi chủ đề
  await a.act({ type: 'useBuiltin', category: 'Lịch sử', questions: 5 });
  await until(() => c.state.state.source.type === 'builtin' && c.state.state.options.category === 'Lịch sử');
  await c.req('room:leave');
  await a.req('room:delete', { roomId });
  console.log('✔ Đố vui OK');
}

// ---------- Đoán chữ ----------
{
  a.state = b.state = null;
  const { roomId } = await a.req('room:create', { name: 'Đoán chữ test', game: 'wordguess', options: { mode: 'race', minutes: 3 } });
  await b.req('room:join', { roomId, mode: 'play' });
  await until(() => a.state?.state.seats.length === 2);
  await a.act({ type: 'ready' });
  await b.act({ type: 'ready' });
  await until(() => a.state.state.status === 'playing');
  assert.equal(a.state.state.game.secret, null, 'không lộ từ bí mật');
  await assert.rejects(a.act({ type: 'guess', text: 'mèo' }), /2 chữ/);
  await assert.rejects(a.act({ type: 'guess', text: 'tành mui' }), /không có trong từ điển/);
  await a.act({ type: 'guess', text: 'học sinh' });
  await assert.rejects(a.act({ type: 'guess', text: 'Học Sinh' }), /Đã đoán/);
  await until(() => a.state.state.game.mine.count === 1);
  const m = a.state.state.game.mine.guesses[0].marks;
  assert.equal(m.length, 2);
  assert.ok(['g', 'y', 'x'].includes(m[0].onset));
  await until(() => b.state.state.game.others[0]?.count === 1);
  assert.equal(b.state.state.game.others[0].guesses[0].text, undefined, 'đang đua: không thấy chữ của người khác');
  await a.act({ type: 'giveup' });
  await b.act({ type: 'giveup' });
  await until(() => a.state.state.status === 'over');
  const secret = a.state.state.game.secret;
  assert.ok(secret && secret.split(' ').length === 2, 'hết ván thì hiện từ bí mật');
  assert.equal(b.state.state.game.others[0].guesses[0].text, 'học sinh', 'hết ván thì thấy chữ');
  // Cùng đoán: chung một bàn, đoán trúng là cả đội thắng
  await a.act({ type: 'setMode', mode: 'coop' });
  await until(() => a.state.state.options.mode === 'coop');
  await a.act({ type: 'ready' });
  await b.act({ type: 'ready' });
  await until(() => a.state.state.status === 'playing');
  await a.act({ type: 'guess', text: 'học sinh' }).catch(() => {});
  await b.act({ type: 'guess', text: secret }).catch(() => {}); // có thể trùng từ cũ hoặc không trúng: chỉ kiểm tra bàn chung
  await until(() => a.state.state.game.shared.count >= 1);
  assert.equal(b.state.state.game.shared.guesses[0].name, 'An', 'bàn chung thấy ai đoán');
  await a.act({ type: 'giveup' }).catch(() => {});
  await until(() => a.state.state.status === 'over');
  await a.req('room:delete', { roomId });
  console.log('✔ Đoán chữ OK — từ bí mật ván 1:', secret);
}

// ---------- Dọn phòng trống ----------
{
  const p = await client('Chủ').ready;
  const q = await client('Khách').ready;
  const r = await client('Xem').ready;
  const has = async (id) => (await p.req('lobby:list')).rooms.some((x) => x.id === id);

  // Chủ phòng rời khi vẫn còn người → phòng còn, quyền chủ chuyển cho người đang kết nối
  const { roomId } = await p.req('room:create', { name: 'Dọn', game: 'caro', options: {} });
  await q.req('room:join', { roomId, mode: 'play' });
  await r.req('room:join', { roomId, mode: 'watch' });
  r.s.close(); // Xem mất kết nối (vẫn được giữ chỗ để vào lại)
  await until(() => q.state?.members.find((m) => m.id === r.user.id)?.online === false);
  await p.req('room:leave');
  await until(() => q.state?.ownerId === q.user.id);
  assert.ok(await has(roomId), 'còn người thì phòng vẫn còn');

  // Người cuối cùng đang kết nối rời → xóa phòng ngay, kể cả khi còn người đang mất kết nối
  const closed = new Promise((res) => q.s.once('room:left', res));
  await q.req('room:leave');
  await closed;
  assert.equal(await has(roomId), false, 'không còn ai kết nối thì phòng bị xóa');
  const back = await client('Xem').ready; // người mất kết nối vào lại: không còn ở phòng cũ
  const again = await back.req('hello', { token: r.token });
  assert.equal(again.user.id, r.user.id);
  assert.equal(again.roomId, null);
  for (const x of [p, q, back]) x.s.close();
  console.log('✔ Dọn phòng trống OK');
}

for (const p of [a, b, c, d]) p.s.close();
console.log('Tất cả kiểm thử tích hợp đều qua');
process.exit(0);
