import type { ClientToServerEvents, ServerToClientEvents } from '../src/contracts.js';
import type { Socket } from 'socket.io-client';
import { request } from '../../client/src/socket.js';

declare const socket: Socket<ServerToClientEvents, ClientToServerEvents>;
socket.emit('room:join', { roomId: 'room', mode: 'watch' }, () => {});
socket.on('voice:signal', ({ from, data }) => { from.toUpperCase(); void data; });
// @ts-expect-error unknown event names are rejected
socket.emit('room:typo', {}, () => {});
// @ts-expect-error roomId must be a string
socket.emit('room:join', { roomId: 123 }, () => {});
// @ts-expect-error voice mute requires a boolean
request('voice:mute', { muted: 'yes' });
// @ts-expect-error room join requires its payload
request('room:join');
// @ts-expect-error game actions have a finite discriminated event vocabulary
request('game:action', { type: 'teleport' });
request('hello').then((response) => {
  response.user.id.toUpperCase();
  // @ts-expect-error response fields are correlated with the request
  void response.iceServers;
});
