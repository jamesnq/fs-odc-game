export {};
declare global {
  interface Window {
    voicePCs: RTCPeerConnection[];
    voiceDisconnects: string[];
    voiceSignalErrors: string[];
    voiceSignalCount: number;
  }
}
