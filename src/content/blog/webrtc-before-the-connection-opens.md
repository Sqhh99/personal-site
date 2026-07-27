---
title: What actually happens before a WebRTC connection opens
description: Signalling, SDP and ICE do most of the work before a single media packet moves — and most failed calls fail right here.
date: 2026-07-24
tag: WebRTC
featured: false
---

The first thing that surprises people about WebRTC is how little of it is about media. By the
time audio is flowing, the hard part is over. Everything interesting — and almost everything
that breaks — happens in the negotiation that precedes it.

Here is the sequence, and where each step tends to fail.

## Signalling is your problem, not WebRTC's

The specification deliberately does not say how two peers find each other. You need a channel
of your own — WebSocket, HTTP long-poll, a message queue, carrier pigeon — to carry offers,
answers and candidates between them.

This is the first place a design goes wrong. Signalling has to be reliable and ordered. If
your transport can drop or reorder messages, a candidate can arrive before the remote
description that gives it meaning, and the connection will simply never come up.

## The offer/answer exchange

The caller creates an offer, which is a session description: codecs it supports, media
directions, encryption fingerprints, transport parameters.

```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});

pc.addTrack(audioTrack, stream);

const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
signal.send({ type: 'offer', sdp: pc.localDescription });
```

The callee applies that as its *remote* description, generates an answer, applies that as its
*local* description, and sends it back. Both sides now agree on what the session looks like.

The ordering constraint is strict and it is the source of a lot of confusion. You cannot call
`addIceCandidate` before `setRemoteDescription` has resolved. Candidates that arrive early
must be queued:

```js
const pending = [];

async function onRemoteCandidate(candidate) {
  if (!pc.remoteDescription) {
    pending.push(candidate);
    return;
  }
  await pc.addIceCandidate(candidate);
}

async function onRemoteDescription(description) {
  await pc.setRemoteDescription(description);
  await Promise.all(pending.splice(0).map((c) => pc.addIceCandidate(c)));
}
```

Nearly every "works locally, fails in production" report I have looked at came down to some
version of this race. On localhost the round trip is so fast that the ordering never inverts.

## ICE: finding a path that actually works

Meanwhile the browser is gathering **candidates** — concrete addresses it might be reachable
on. There are three kinds, and the distinction matters:

- **Host** candidates are the machine's own interfaces. They work when both peers are on the
  same network and nowhere else.
- **Server-reflexive** candidates come from asking a STUN server "what address did this packet
  appear to come from?" This is the public side of your NAT, and it is what lets two peers
  behind ordinary home routers talk directly.
- **Relay** candidates come from a TURN server, which forwards traffic on your behalf. This
  always works and always costs you bandwidth and latency.

ICE takes the two candidate lists, forms every plausible pair, and runs connectivity checks
across all of them at once — STUN binding requests in both directions. The first pair that
succeeds in both directions wins. This is why WebRTC connects fast when it connects at all:
it is not probing sequentially, it is racing.

## STUN is not enough, and you will find out at the worst time

STUN works by discovering the mapping your NAT created for an outbound packet. Whether an
inbound packet can then use that mapping depends on the NAT's behaviour.

Symmetric NATs — common on corporate networks and mobile carriers — allocate a *different*
external port per destination. The mapping you discovered by talking to the STUN server is
useless for talking to your peer. No amount of STUN fixes this.

This is what TURN is for, and the practical consequence is blunt: **if you do not run a TURN
server, some percentage of your calls will never connect**, and you will not be able to
reproduce it on your own network. Budget for somewhere in the range of 10–20% of sessions
needing relay, higher on mobile and enterprise networks.

## Watching it happen

Two events tell you almost everything. `onicecandidate` fires as candidates are gathered — a
`null` candidate signals gathering is complete:

```js
pc.onicecandidate = ({ candidate }) => {
  if (candidate) signal.send({ type: 'candidate', candidate });
};

pc.onconnectionstatechange = () => {
  console.log(pc.connectionState);
};
```

`connectionState` moves through `new` → `connecting` → `connected`. If it reaches `failed`,
ICE exhausted every candidate pair without a working path. When that happens, the useful
question is not "why did the media break" — no media was ever attempted. It is "which
candidate types did each side actually gather", and the answer is usually that one side only
produced host candidates, or that relay was never configured.

## The short version

Media is the easy part. Get signalling ordering right, queue candidates until the remote
description lands, and run a TURN server before you need it. Almost every connection failure
I have debugged reduces to one of those three.
