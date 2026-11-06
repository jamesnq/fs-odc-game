import 'react';

declare module 'react' {
  interface CSSProperties { [variable: `--${string}`]: string | number | undefined }
  interface HTMLAttributes<T> { inert?: string }
}
declare global {
  interface Window { webkitAudioContext: typeof AudioContext }
}
