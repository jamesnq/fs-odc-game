// Socket.IO client có kiểu cho các script kiểm thử tích hợp (cùng contracts với trình duyệt).
import type { Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, RequestEvent, Requests, Response, ServerToClientEvents } from '@game/shared/contracts';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type Accepted<E extends RequestEvent> = Extract<Ack<E>, { ok: true }>;

/** Gửi một yêu cầu và chờ ack; server trả lỗi thì reject. Kết quả có thể là lệnh chuyển máy chủ. */
export function send<E extends RequestEvent>(socket: TestSocket, event: E, payload: Requests[E], ms = 5000): Promise<Accepted<E>> {
  return new Promise((resolve, reject) => {
    const timed = socket.timeout(ms);
    // Socket.IO's mapped tuple cannot preserve the correlation of generic E here.
    const emit = timed.emit.bind(timed) as (event: E, payload: Requests[E], ack: (error: Error | null, result: Ack<E>) => void) => void;
    emit(event, payload, (error, result) => {
      if (error) reject(error);
      else if (!result?.ok) reject(new Error(result?.error));
      else resolve(result);
    });
  });
}

/** Như `send` nhưng không chấp nhận chuyển máy chủ: trả về đúng kiểu phản hồi của sự kiện. */
export async function request<E extends RequestEvent>(socket: TestSocket, event: E, payload: Requests[E], ms = 5000): Promise<Response<E>> {
  const result = await send(socket, event, payload, ms);
  if (result.redirect) throw new Error(`${event}: không mong đợi chuyển sang máy chủ ${result.redirect.nodeId}`);
  return result;
}
