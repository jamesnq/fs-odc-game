import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWord } from '@game/shared/wordchain';
import { isKnownWord } from '../src/games/wordchain.js';

const known = (w) => isKnownWord(parseWord(w));

test('từ điển nối từ có các từ ghép thông dụng', () => {
  for (const w of [
    'con mèo', 'con bò', 'con chó', 'con gà', 'con trâu', 'con vịt', 'con lợn',
    'quả cam', 'trái xoài', 'cây dừa', 'hoa hồng', 'cái bàn', 'cái ghế',
    'đạp xe', 'hành lá', 'ăn cơm', 'uống nước', 'con người', 'hòa bình', 'hoà bình',
  ]) assert.ok(known(w), `"${w}" phải có trong từ điển`);
});

test('từ vô nghĩa vẫn bị coi là không có trong từ điển', () => {
  for (const w of ['mèo bàn', 'ghế trâu', 'cơm xoài']) assert.equal(known(w), false, w);
});
