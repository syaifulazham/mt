"use client";

/**
 * Minimal WHIP (publish) and WHEP (play) clients for Cloudflare Stream WebRTC.
 * Non-trickle: the offer is sent once ICE gathering finishes (or after 2 s).
 */

const ICE = [{ urls: "stun:stun.cloudflare.com:3478" }];

function gathered(pc: RTCPeerConnection, ms = 2000) {
  return new Promise<void>(resolve => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", done); resolve(); } };
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, ms);
  });
}

async function negotiate(pc: RTCPeerConnection, url: string) {
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/sdp" }, body: pc.localDescription!.sdp,
  });
  if (!res.ok) throw new Error(`WebRTC ${res.status}`);
  const resource = res.headers.get("Location");
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  // The resource URL may be relative to the endpoint.
  return resource ? new URL(resource, url).toString() : null;
}

export type WebRtcSession = { pc: RTCPeerConnection; stop: () => Promise<void> };

function closer(pc: RTCPeerConnection, resource: string | null) {
  return async () => {
    pc.close();
    if (resource) await fetch(resource, { method: "DELETE" }).catch(() => null);
  };
}

/** Broadcast a camera stream to a WHIP URL. */
export async function publishWhip(url: string, stream: MediaStream): Promise<WebRtcSession> {
  const pc = new RTCPeerConnection({ iceServers: ICE, bundlePolicy: "max-bundle" });
  for (const track of stream.getTracks()) pc.addTransceiver(track, { direction: "sendonly" });
  try {
    const resource = await negotiate(pc, url);
    return { pc, stop: closer(pc, resource) };
  } catch (e) { pc.close(); throw e; }
}

/** Watch a WHEP URL; `onStream` gets the remote media to put in a <video>. */
export async function playWhep(url: string, onStream: (s: MediaStream) => void): Promise<WebRtcSession> {
  const pc = new RTCPeerConnection({ iceServers: ICE, bundlePolicy: "max-bundle" });
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  const media = new MediaStream();
  pc.ontrack = e => { media.addTrack(e.track); onStream(media); };
  try {
    const resource = await negotiate(pc, url);
    return { pc, stop: closer(pc, resource) };
  } catch (e) { pc.close(); throw e; }
}

/** A recorder type the browser supports (Safari: mp4, Chrome/Android: webm). */
export function recorderMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}
