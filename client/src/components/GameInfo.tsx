import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Khung phòng chơi (RoomView) cấp cho các trò:
 *  - infoNode: chỗ đặt các bảng phụ (bảng điểm, biên bản, luật, hands log…) — nằm trong ngăn "Thông tin"
 *  - openPanel(tab): mở ngăn bên ('info' | 'chat' | 'people')
 */
export const RoomUICtx = createContext<{ infoNode: Element | null; openPanel: (tab: string | null) => void }>({ infoNode: null, openPanel: () => {} });
export const useRoomUI = () => useContext(RoomUICtx);

/** Đưa nội dung phụ của trò chơi vào ngăn "Thông tin" thay vì chiếm chỗ cạnh bàn chơi. */
export default function GameInfo({ children }: { children: ReactNode }) {
  const { infoNode } = useRoomUI();
  return infoNode ? createPortal(children, infoNode) : null;
}
