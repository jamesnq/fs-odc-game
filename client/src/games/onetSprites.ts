// 36 quái thú pixel 16×16 tự vẽ, phong cách game cầm tay cổ điển (tự sáng tác, không dùng hình có bản quyền).
// Chỉ số 1..36 khớp với giá trị ô trên server (giống danh sách emoji).
//
// Mỗi hình là 16 hàng. Hàng 8 ký tự = nửa trái, tự lật gương sang phải; hàng 16 ký tự = vẽ nguyên hàng.
// Ký tự: '.' trống · k viền tối · w trắng · p má hồng · a/b/c/d màu riêng của từng con (pal).

const BASE = { k: '#1d1b2b', w: '#ffffff', p: '#ff8fab' };

const RAW = [
  // 1 Thạch nhầy
  { pal: { a: '#63b4ff', b: '#2f6fd6', c: '#d4ecff' }, rows: [
    '........', '........', '........', '.......k', '.....kka', '...kkaaa', '..kaacaa', '..kacaaa',
    '.kaaakwa', '.kaaakka', '.kaaaaaa', '.kapaaak', 'kbaaaaaa', 'kbbaaaaa', '.kbbbbbb', '..kkkkkk'] },
  // 2 Gà lửa
  { pal: { a: '#ffc04a', b: '#e8861a', c: '#ff5a2a', d: '#fff0b0' }, rows: [
    '.......c', '......cc', '.....cdc', '....kccc', '...kaaaa', '..kaaaaa', '.kaaaaaa', '.kaaakwa',
    '.kaaakka', '.kapaaac', 'kbaaaadd', 'kbaaaddd', '.kbaaddd', '..kbbbbb', '...kkkkk', '....cc..'] },
  // 3 Mầm lá
  { pal: { a: '#7ed957', b: '#3fa34d', c: '#2e7d32', d: '#c8f7a0' }, rows: [
    '........', '...ccc..', '..cddcc.', '...ccc.c', '.......c', '....kkkk', '..kkaaaa', '.kaaaaaa',
    '.kaaakwa', 'kaaaakka', 'kapaaaaa', 'kaaaaaak', 'kbaaaaaa', '.kbbaaaa', '..kbbbbb', '...kkkkk'] },
  // 4 Dơi tím
  { pal: { a: '#9b6bd6', b: '#6a3fa8', c: '#ff6b8a' }, rows: [
    '........', '....k...', '....kk..', '....kakk', 'k...kaaa', 'kk.kaaaa', 'kakkakwa', 'kaakakka',
    'kaabkaaa', 'kabbkaac', 'kbbbbkaa', 'kk.kbkaa', 'k...kbbb', '.....kkk', '........', '........'] },
  // 5 Ma trơi
  { pal: { a: '#ece8ff', b: '#b8b0e8', c: '#7a6fd0' }, rows: [
    '........', '........', '.....kkk', '....kaaa', '...kaaaa', '..kaaaaa', '..kaakka', '..kaakka',
    '..kaaaaa', '..kpaaak', '..kaaaaa', '.kaaaaaa', '.kbaaaaa', '.kbbbbbb', '.kbk.kbk', '..k...k.'] },
  // 6 Người đá
  { pal: { a: '#a8a29e', b: '#78716c', d: '#f5c542' }, rows: [
    '........', '........', '....kkkk', '..kkaaaa', '.kaaabaa', '.kaaaaaa', 'kaaaddaa', 'kbaaddab',
    'kaaaaaaa', 'kaabakkk', 'kaaaaaaa', 'kbaaabaa', 'kbbaaaaa', '.kbbbbbb', '..kkkkkk', '........'] },
  // 7 Cá vây cam
  { pal: { a: '#4fc3f7', b: '#0288d1', c: '#ffb74d' }, rows: [
    '................', '................', '......kkkkk.....', '.....kccccck....',
    '....kkaaaaaakk..', 'k..kaaaaaaaaaak.', 'kk.kaaaaaaaakwak', 'kckaaaaaaaaakkak',
    'kcckaaaaaaaaaaak', 'kckbaaaaaaaaapk.', 'kk.kbbaaaaaaaak.', 'k...kbbbbbbbbk..',
    '.....kkcckkkk...', '......kcck......', '.......kk.......', '................'] },
  // 8 Bí ngô
  { pal: { a: '#ff9a3c', b: '#d9661a', c: '#5a9e2e' }, rows: [
    '........', '.......c', '.......c', '...kkkkk', '..kabaab', '.kaabaab', '.kabkwab', 'kaabkkab',
    'kaabaaab', 'kapbaaab', 'kaabakkk', 'kaabaaab', 'kbabaaab', '.kbbbbbb', '..kkkkkk', '........'] },
  // 9 Nấm đỏ
  { pal: { a: '#e53935', b: '#b71c1c', c: '#fff3e0', d: '#ffffff' }, rows: [
    '........', '.....kkk', '...kkaaa', '..kaddaa', '.kaaddaa', '.kaaaaad', 'kaddaaad', 'kaddaaaa',
    'kbbaaaab', '.kkkkkkk', '...kcccc', '...kckwc', '...kckkc', '...kpccc', '...kcccc', '....kkkk'] },
  // 10 Thỏ hồng
  { pal: { a: '#ffc1d9', b: '#f08cb4', d: '#ff5c8a' }, rows: [
    '...kk...', '..kadk..', '..kadk..', '..kadk..', '..kadk..', '..kaakkk', '.kaaaaaa', 'kaaaaaaa',
    'kaaakwaa', 'kaaakkaa', 'kapaaaad', 'kaaaaaak', '.kaaaaaa', '.kbaaaaa', '..kbbbbb', '...kkkkk'] },
  // 11 Mèo vằn
  { pal: { a: '#ffe0a3', b: '#e0a85a', c: '#ff9eb0', d: '#b4793d' }, rows: [
    '........', '..k.....', '..kk....', '..kck...', '..kcakkk', '.kaaaaaa', '.kdaaaaa', 'kaaaaaaa',
    'kdaakwaa', 'kaaakkaa', 'kpaaaaac', 'kdaaaaak', '.kaaaaaa', '.kbaaaaa', '..kbbbbb', '...kkkkk'] },
  // 12 Cú mèo
  { pal: { a: '#a1764a', b: '#6d4c2f', c: '#f5deb3', d: '#ffb300' }, rows: [
    '........', '..k.....', '..kk....', '..kakkkk', '.kaaaaaa', 'kaccccca', 'kacwwwca', 'kacwkwca',
    'kacwwwcd', 'kaccccad', 'kaacacaa', 'kbacacaa', 'kbaaaaaa', '.kbbbbbb', '..kkkkkk', '....d.d.'] },
  // 13 Rùa xanh
  { pal: { a: '#8bc34a', b: '#558b2f', c: '#a1887f', d: '#5d4037' }, rows: [
    '................', '................', '................', '....kkkkkk......',
    '...kcccdcck.....', '..kcdcccdcck.kk.', '.kccdcccdccckaak', '.kddddddddddkawk',
    '.kccdcccdccckaak', '.kkkkkkkkkkkkaak', '.kaakbbbbbkaak..', '.kaak.....kaak..',
    '..kk.......kk...', '................', '................', '................'] },
  // 14 Cua đỏ
  { pal: { a: '#ff6f4f', b: '#d84315' }, rows: [
    '........', '.kk.....', 'kaak....', 'ka.k.kk.', 'kaak.kwk', '.kak.kk.', '..kak.k.', '...kkkkk',
    '..kaaaaa', '.kaaaaaa', 'kapaaaaa', 'kaaaaakk', '.kbbbbbb', 'k.kkkkkk', '.k.k.k..', '........'] },
  // 15 Ong vàng
  { pal: { a: '#ffd54f', b: '#3e2723', c: '#e3f2fd' }, rows: [
    '........', '...k....', '....k...', '.kk..kkk', 'kcck.kaa', 'kccckaaa', '.kckakwa', '..kkakka',
    '...kapaa', '...kbbbb', '..kaaaaa', '..kbbbbb', '..kaaaaa', '...kbbbb', '....kkkk', '.......k'] },
  // 16 Chim cánh cụt
  { pal: { a: '#2c3e70', b: '#1b2850', c: '#ffffff', d: '#ffa726' }, rows: [
    '........', '........', '.....kkk', '...kkaaa', '..kaaaaa', '..kaaccc', '.kaacwkc', '.kaackkc',
    '.kaacccd', 'kbaccccc', 'kbaccccc', 'kbaccccc', '.kaacccc', '..kaaccc', '...kkkkk', '....dd..'] },
  // 17 Ếch cười
  { pal: { a: '#66bb6a', b: '#388e3c', c: '#ffffff', d: '#c5e1a5' }, rows: [
    '........', '........', '..kkkk..', '.kcccck.', '.kcckck.', '.kcckckk', 'kakkkkaa', 'kaaaaaaa',
    'kpaaaaaa', 'kaakkkkk', 'kaaaaaaa', '.kaddddd', '.kbddddd', 'kbbkbbbb', '.kkk.kkk', '........'] },
  // 18 Cầu gai điện
  { pal: { a: '#fff176', b: '#fbc02d', c: '#42a5f5' }, rows: [
    '.c....kk', '..k..kaa', '..kkkaaa', '...kaaaa', 'kkkaaaaa', '.kaaaaaa', '..kakwaa', 'kkkakkaa',
    '.kaaaaaa', '..kpaaak', 'kkkaaaaa', '.kbaaaaa', '...kbbbb', '..kkkbbb', '..k..kbb', '......kk'] },
  // 19 Tinh linh băng
  { pal: { a: '#b3e5fc', b: '#4fc3f7', c: '#ffffff', d: '#0277bd' }, rows: [
    '.......k', '......kc', '.....kca', '....kcaa', '...kcaaa', '..kaaaaa', '.kaaakwa', 'kaaaakka',
    'kaaaaaaa', '.kbapaak', '..kbaaaa', '...kbaaa', '....kbba', '.....kbb', '......kd', '.......k'] },
  // 20 Rắn cuộn
  { pal: { a: '#9ccc65', b: '#689f38', c: '#ff5252', d: '#e6ee9c' }, rows: [
    '........', '.....kkk', '....kaaa', '...kaaaa', '...kakwa', '...kakka', '...kaaaa', '....kaac',
    '.....kaa', '...kkkaa', '.kkaaaaa', 'kaaabbbb', 'kaabdddd', 'kbaaaaaa', '.kbbbbbb', '..kkkkkk'] },
  // 21 Sứa hồng
  { pal: { a: '#f48fb1', b: '#c2185b', d: '#fce4ec' }, rows: [
    '........', '.....kkk', '...kkaaa', '..kaaada', '.kaadaaa', '.kaaaaaa', '.kaakwaa', '.kaakkaa',
    '.kpaaaak', '.kbbbbbb', '..kakaka', '..kakaka', '..kak.ka', '...kak.k', '...k...k', '........'] },
  // 22 Rồng con
  { pal: { a: '#4db6ac', b: '#00796b', c: '#fff176', d: '#ffcc80' }, rows: [
    '........', '..c.....', '..cc....', '...ckkkk', '..kaaaaa', '.kaaaaaa', 'kaakwaaa', 'kaakkaaa',
    'kaaaaaaa', 'kaaaaaka', '.kaaaaaa', '.kbkaddd', 'kbbkaddd', '.kbbaddd', '..kkkkkk', '........'] },
  // 23 Gấu con
  { pal: { a: '#a1887f', b: '#6d4c41', c: '#efe5df' }, rows: [
    '........', '........', '..kkk...', '.kacak..', '.kaaakkk', '..kaaaaa', '.kaaaaaa', '.kaakwaa',
    'kaaakkaa', 'kaaaaccc', 'kapaccck', 'kaaaaccc', '.kaaaaaa', '.kbaaaaa', '..kbbbbb', '...kkkkk'] },
  // 24 Trứng đốm
  { pal: { a: '#fff8e1', b: '#e0d4b0', c: '#8bc34a' }, rows: [
    '........', '......kk', '.....kaa', '....kaca', '...kaaaa', '...kacaa', '..kaaaaa', '..kaakwa',
    '.kaaakka', '.kcpaaaa', '.kaaaaak', 'kaaaaaaa', 'kbaaacaa', '.kbbaaaa', '..kbbbbb', '...kkkkk'] },
  // 25 Cừu mây
  { pal: { a: '#ffffff', b: '#cfd8dc', c: '#5d4037', d: '#ffab91' }, rows: [
    '........', '...kk.kk', '..kaakaa', '.kaaaaaa', 'kaaaakkk', 'kaaakccc', '.kaakcwc', '.kaakccc',
    'kaaakccd', 'kaaaakkk', 'kaaaaaaa', '.kaaaaaa', 'kbaaaaaa', '.kbbkbbb', '..kk.kkk', '...cc...'] },
  // 26 Xương rồng
  { pal: { a: '#81c784', b: '#388e3c', c: '#ff80ab', d: '#d97b4a' }, rows: [
    '......cc', '.....cwc', '......cc', '.....kkk', '....kaaa', '.kk.kaaa', 'kaakkaka', 'kaakkaka',
    'kaaaaaaa', '.kkkkaak', '....kaba', '....kaba', '....kbaa', '...kkkkk', '...kdddd', '....kkkk'] },
  // 27 Sao vàng
  { pal: { a: '#ffd740', b: '#ffab00' }, rows: [
    '.......k', '......ka', '......ka', '.....kaa', 'kkkkkaaa', '.kaaaaaa', '..kaakwa', '...kakka',
    '...kapak', '...kaaaa', '..kaaaaa', '..kaabbb', '.kaabkkk', '.kabk...', 'kbbk....', 'kkk.....'] },
  // 28 Bướm đêm
  { pal: { a: '#e1bee7', b: '#ab47bc', c: '#fff9c4', d: '#6a1b9a' }, rows: [
    '........', '.....k..', '......kk', '.kkkk.kd', 'kccccckw', 'kcbbcckd', 'kcbbcckd', 'kccccckd',
    '.kccckkd', '.kacckkd', 'kaaaakkd', 'kaabakkd', '.kaaakkd', '..kkk.kk', '........', '........'] },
  // 29 Bọ sừng
  { pal: { a: '#5c6bc0', b: '#283593', c: '#9fa8da' }, rows: [
    '.......k', '......kc', '......kc', '....kkkc', '...kaaaa', '..kaakwa', '..kaakka', 'k.kbbbbk',
    '.kkkkkkk', 'kkaacaak', '.kaacaak', 'kkacaaak', '.kaaaaak', 'kkbaaaak', '..kbbbbk', '...kkkk.'] },
  // 30 Heo hồng
  { pal: { a: '#ffc4cf', b: '#f48fb1', c: '#ff7a9a' }, rows: [
    '........', '........', '..kk....', '..kbk...', '..kbbkkk', '.kaaaaaa', 'kaaaaaaa', 'kaaakwaa',
    'kaaakkaa', 'kaaakkkk', 'kpaakckc', 'kaaakkkk', '.kaaaaaa', '.kbaaaaa', '..kbbbbb', '...kk.kk'] },
  // 31 Vịt con
  { pal: { a: '#fff176', b: '#fbc02d', c: '#ff9800' }, rows: [
    '........', '........', '.....kkk', '....kaaa', '...kaaaa', '...kkwaa', '...kkkaa', '...kaacc',
    '...kaccc', '..kaakkk', '.kaaaaaa', 'kbaaaaaa', 'kbaaaaaa', '.kbbaaaa', '..kkkkkk', '....cc..'] },
  // 32 Khỉ nâu
  { pal: { a: '#8d6e63', b: '#5d4037', c: '#ffe0b2' }, rows: [
    '........', '........', '.....kkk', '...kkaaa', '..kaaaaa', 'kkkacccc', 'kckackwc', 'kckackkc',
    '.kkacccc', '..kaccck', '..kacccc', '..kaaaaa', '.kbaaaaa', '.kbbaaaa', '..kkkkkk', '........'] },
  // 33 Bướm cam
  { pal: { a: '#ff9800', b: '#e65100', c: '#fff3e0', d: '#4fc3f7' }, rows: [
    '........', '.kkk..k.', 'kaaakk.k', 'kacaaakk', 'kaccaaak', 'kacaadak', 'kaaaddak', '.kaaaakk',
    '..kkkkkk', '.kbbbakk', 'kbbdbakk', 'kbbbbakk', '.kbbkk.k', '..kk...k', '........', '........'] },
  // 34 Nhím gai
  { pal: { a: '#8d6e63', b: '#5d4037', c: '#ffe0b2' }, rows: [
    '........', '...k.k.k', '..kbkbkb', '.kbbbbbb', 'kbbbbbbb', '.kbbkkkk', 'kbbkcccc', 'kbkcckwc',
    '.kkcckkc', 'kbkcpccc', 'kbkcccck', '.kbkcccc', 'kbbbkkkk', '.kbbbbbb', '..kkkkkk', '....kk..'] },
  // 35 Bọ rùa
  { pal: { a: '#e53935', b: '#b71c1c' }, rows: [
    '........', '....k...', '.....k..', '....kkkk', '...kkwkk', '...kkkkk', '..kaaaak', '.kaakkak',
    '.kaakkak', 'kaaaaaak', 'kakkaaak', 'kakkaaak', 'kaaaakak', '.kaaaaak', '..kbbbkk', '...kkkkk'] },
  // 36 Đốm lửa
  { pal: { a: '#ff7043', b: '#e64a19', c: '#ffeb3b' }, rows: [
    '.......k', '......ka', '....k.ka', '...kakaa', '...kaaaa', '..kaacaa', '..kacccc', '.kaccccc',
    '.kacckwc', '.kacckkc', 'kaccccck', 'kacccccc', 'kbaccccc', '.kbacccc', '..kbbbbb', '...kkkkk'] },
];

/** Biến hình thành danh sách { fill, d } — gộp các điểm liền nhau trên cùng hàng thành một đoạn. */
function compile({ pal, rows }: {pal?: Record<string, string | undefined>; rows: string[]}) {
  const colors: Record<string, string | undefined> = { ...BASE, ...pal };
  const byColor: Record<string, string[]> = {};
  rows.forEach((row, y) => {
    const full = row.length === 16 ? row : row + [...row].reverse().join('');
    let x = 0;
    while (x < 16) {
      const ch = full[x];
      let n = 1;
      while (x + n < 16 && full[x + n] === ch) n++;
      if (ch !== '.' && colors[ch]) (byColor[ch] ||= []).push(`M${x} ${y}h${n}v1h-${n}z`);
      x += n;
    }
  });
  return Object.entries(byColor).map(([ch, parts]) => ({ fill: colors[ch], d: parts.join('') }));
}

export const SPRITES = RAW.map(compile);
export const SPRITE_NAMES = ['Thạch nhầy', 'Gà lửa', 'Mầm lá', 'Dơi tím', 'Ma trơi', 'Người đá', 'Cá vây cam', 'Bí ngô',
  'Nấm đỏ', 'Thỏ hồng', 'Mèo vằn', 'Cú mèo', 'Rùa xanh', 'Cua đỏ', 'Ong vàng', 'Chim cánh cụt', 'Ếch cười',
  'Cầu gai điện', 'Tinh linh băng', 'Rắn cuộn', 'Sứa hồng', 'Rồng con', 'Gấu con', 'Trứng đốm', 'Cừu mây',
  'Xương rồng', 'Sao vàng', 'Bướm đêm', 'Bọ sừng', 'Heo hồng', 'Vịt con', 'Khỉ nâu', 'Bướm cam', 'Nhím gai',
  'Bọ rùa', 'Đốm lửa'];
