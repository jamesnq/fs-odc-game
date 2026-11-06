import 'react';

declare module 'react' {
  interface CSSProperties { [variable: `--${string}`]: string | number | undefined }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- React declaration merging requires this exact generic parameter.
  interface HTMLAttributes<T> { inert?: string }
}
declare global {
  interface Window { webkitAudioContext: typeof AudioContext }
}
