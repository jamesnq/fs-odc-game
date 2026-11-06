// Keep incoming SDP/ICE in order, including candidates received before the SDP.
import type { VoiceSignal } from '@game/shared/contracts';

export function voiceNegotiation(pc: RTCPeerConnection, polite: boolean, send: (data: VoiceSignal) => unknown) {
  let makingOffer = false;
  let ignoreOffer = false;
  let settingAnswer = false;
  let pendingCandidates: (RTCIceCandidateInit | undefined)[] = [];
  let incoming = Promise.resolve();
  const description = (): VoiceSignal => ({ description: { type: pc.localDescription!.type as 'offer' | 'answer', sdp: pc.localDescription!.sdp } });

  return {
    async negotiate() {
      try {
        makingOffer = true;
        await pc.setLocalDescription();
        if (pc.signalingState !== 'closed') await send(description());
      } finally { makingOffer = false; }
    },
    receive(data: VoiceSignal) {
      const next = incoming.then(async () => {
        if (pc.signalingState === 'closed') return;
        if (data.description) {
          const d = data.description;
          const ready = !makingOffer && (pc.signalingState === 'stable' || settingAnswer);
          ignoreOffer = !polite && d.type === 'offer' && !ready;
          if (ignoreOffer) { pendingCandidates = []; return; }
          settingAnswer = d.type === 'answer';
          try { await pc.setRemoteDescription(d); }
          finally { settingAnswer = false; }
          for (const candidate of pendingCandidates.splice(0)) await pc.addIceCandidate(candidate);
          if (d.type === 'offer') {
            await pc.setLocalDescription();
            await send(description());
          }
        } else if ('candidate' in data && !ignoreOffer) {
          const candidate = data.candidate || undefined;
          if (!pc.remoteDescription) {
            if (pendingCandidates.length < 256) pendingCandidates.push(candidate);
          } else await pc.addIceCandidate(candidate);
        }
      });
      // A failed packet must not prevent processing subsequent packets.
      incoming = next.catch(() => {});
      return next;
    },
  };
}
