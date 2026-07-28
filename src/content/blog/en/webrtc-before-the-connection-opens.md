---
title: What actually happens before a WebRTC connection opens
description: Signaling state machines, ICE candidate matrices, TURN fallback overhead, and JSEP glare resolution — diagnosing why WebRTC connections fail before media flows.
date: 2026-07-24
tag: WebRTC
featured: false
---

The most common misconception about WebRTC is that connection failures are caused by media encoding or network jitter. In production environments, over 80% of failed calls collapse during the negotiation phase—before a single SRTP audio or video packet is transmitted. 

On `localhost` or a single local area network, WebRTC connections appear deceptively robust. RTT is near zero, NAT traversal is trivial, and signaling messages arrive instantaneously. In real-world networks across cellular carriers and enterprise firewalls, connection establishment requires navigating strict JSEP state machines, candidate race conditions, symmetric NAT mappings, and TURN allocation protocol overheads.

Here is the exact operational mechanics of the pre-media phase, how it breaks in practice, and how to debug it.

## The JSEP State Machine and Glare Collisions

WebRTC uses the JavaScript Session Establishment Protocol (JSEP) to negotiate session parameters. The negotiating peers exchange SDP (Session Description Protocol) blobs containing codec capabilities, encryption fingerprints (DTLS), transport parameters (ICE Ufrag/Pwd), and media direction attributes (`sendrecv`, `recvonly`, `sendonly`).

### The Signaling State Trap
The `RTCPeerConnection` maintains a strict internal state machine exposed via `pc.signalingState`:

```
              +------------------------------------+
              |               stable               |
              +------------------------------------+
                 /                            \
   setLocalDescription(offer)             setRemoteDescription(offer)
               /                                \
              v                                  v
   +--------------------+              +---------------------+
   |  have-local-offer  |              |  have-remote-offer  |
   +--------------------+              +---------------------+
              \                                  /
   setRemoteDescription(answer)           setLocalDescription(answer)
               \                                /
                v                              v
              +------------------------------------+
              |               stable               |
              +------------------------------------+
```

A common failure occurs when a remote candidate or answer arrives when the local peer is in an invalid state for that message. For example, calling `pc.addIceCandidate(candidate)` before `pc.setRemoteDescription(desc)` has resolved will throw an `InvalidStateError` or silently fail in older browser implementations.

### Resolving Glare with Perfect Negotiation
When both peers attempt to send an offer simultaneously—a condition known as **glare**—both state machines transition to `have-local-offer`. Without explicit collision handling, both peers reject the incoming remote offer and negotiation deadlocks.

The standard solution is the **Perfect Negotiation** pattern, which assigns a deterministic `polite` and `impolite` role to the peers:

```typescript
export class WebRTCSession {
  private pc: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(
    private isPolite: boolean,
    private signalChannel: (msg: any) => void,
    iceServers: RTCIceServer[]
  ) {
    this.pc = new RTCPeerConnection({ iceServers });
    this.setupListeners();
  }

  private setupListeners(): void {
    // 1. Handle negotiation needed automatically
    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        this.signalChannel({ description: this.pc.localDescription });
      } catch (err) {
        console.error("Negotiation error:", err);
      } finally {
        this.makingOffer = false;
      }
    };

    // 2. Trickle ICE candidates
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.signalChannel({ candidate });
      }
    };
  }

  // 3. Process incoming signaling messages with race protection
  public async handleSignal(data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }): Promise<void> {
    try {
      if (data.description) {
        const description = data.description;
        const offerCollision =
          description.type === "offer" &&
          (this.makingOffer || this.pc.signalingState !== "stable");

        // Glare resolution: impolite peer ignores incoming offer during collision; polite peer rolls back
        this.ignoreOffer = !this.isPolite && offerCollision;
        if (this.ignoreOffer) {
          return;
        }

        if (offerCollision && this.isPolite) {
          // Rollback local offer state to accept remote offer
          await Promise.all([
            this.pc.setLocalDescription({ type: "rollback" }),
            this.pc.setRemoteDescription(description),
          ]);
        } else {
          await this.pc.setRemoteDescription(description);
        }

        if (description.type === "offer") {
          await this.pc.setLocalDescription();
          this.signalChannel({ description: this.pc.localDescription });
        }

        // Drain candidate queue after remote description is applied
        await this.drainPendingCandidates();
      } else if (data.candidate) {
        if (!this.pc.remoteDescription) {
          // Queue candidates arriving before remote description
          this.pendingCandidates.push(data.candidate);
        } else {
          await this.pc.addIceCandidate(data.candidate);
        }
      }
    } catch (err) {
      console.error("Signal handling failed:", err);
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    const candidates = this.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      await this.pc.addIceCandidate(candidate);
    }
  }
}
```

## ICE Traversal & NAT Topology Matrix

Interactive Connectivity Establishment (ICE, RFC 8445) finds a valid network path between peers. Browsers gather four types of ICE candidates:

1. **Host (`host`)**: Direct IP addresses of physical or virtual network interfaces on the local machine (e.g., `192.168.1.50`, `10.0.0.12`).
2. **Server Reflexive (`srflx`)**: The public IP address and port allocated by a NAT device, discovered by querying a STUN (Session Traversal Utilities for NAT) server.
3. **Peer Reflexive (`prflx`)**: An address discovered directly by a peer during ICE connectivity checks (often produced when a NAT alters port bindings during binding requests).
4. **Relay (`relay`)**: A public IP and port allocated on a TURN (Traversal Using Relays around NAT) server that proxies all media traffic.

### NAT Type Compatibility Matrix

Whether two peers can connect directly via STUN (`srflx`) or require TURN (`relay`) depends entirely on the NAT filtering and mapping behaviors on both sides:

| Peer A NAT Type | Peer B NAT Type | Traversal Mechanism | Connectivity Outcome |
| :--- | :--- | :--- | :--- |
| **Full Cone** | **Full Cone** | Direct STUN (`srflx` <-> `srflx`) | Direct Peer-to-Peer Success |
| **Address Restricted** | **Port Restricted** | Direct STUN (`srflx` <-> `srflx`) | Direct Peer-to-Peer Success |
| **Port Restricted** | **Symmetric NAT** | STUN attempt fails | **Requires TURN Relay** |
| **Symmetric NAT** | **Symmetric NAT** | STUN attempt fails | **Requires TURN Relay** |
| **Enterprise Firewall** (UDP Blocked) | **Any** | TURN over TCP / TLS (`relay`) | **Requires TURN over Port 443** |

### The TURN Allocation Overhead
Symmetric NATs allocate a unique external port for every distinct destination IP and port. The public mapping returned by a STUN server for `stun.l.google.com:19302` is invalid when communicating with the peer's IP and port.

TURN traversal follows an explicit RFC 5766 allocation handshake:

```
Client                                                  TURN Server
  |                                                          |
  |--- ALLOCATE request (UDP/TCP/TLS) ---------------------->|
  |<-- 401 Unauthorized (Stun Nonce / Realm Challenge) ------|
  |                                                          |
  |--- ALLOCATE request (with HMAC-SHA1 Auth) --------------->|
  |<-- 200 OK (XOR-RELAYED-ADDRESS: 198.51.100.15:45231) -----|
  |                                                          |
  |--- CREATE-PERMISSION (Peer B Public Address) ------------>|
  |<-- 200 OK -----------------------------------------------|
  |                                                          |
  |=== ChannelData / SendIndication (Proxied Media) ========>|
```

In global production deployments:
- **15% to 22%** of consumer sessions require TURN relay due to Symmetric NATs or strict cellular firewalls.
- **30% to 45%** of enterprise network sessions require TURN over TCP/TLS (port 443) because outbound UDP traffic (ports 1024–65535) is dropped by firewall policies.

If you operate WebRTC without TURN relays on port 443, up to a third of your user base will experience immediate connection failures.

## Trickle ICE vs Non-Trickle Timing

Candidate gathering is asynchronous. Under **Non-Trickle ICE**, the peer waits until all candidates are gathered (signaled by `onicecandidate` returning a `null` candidate) before sending the SDP offer/answer. This adds 1,000ms to 3,000ms of latency to connection setup.

Under **Trickle ICE**, the initial SDP offer is sent immediately after `setLocalDescription()`, and candidates are sent individually as `onicecandidate` fires.

### The Candidate Race Condition
Because signaling channels (WebSockets, HTTP long-polling, MQTT) operate asynchronously from ICE candidate gathering, candidates frequently arrive at the remote peer *before* the remote SDP description is received and processed. 

If `pc.addIceCandidate(c)` is called before `pc.setRemoteDescription(desc)` finishes:
- Chromium throws an unhandled promise rejection.
- Firefox drops the candidate without error, causing ICE checks to stall indefinitely.

The implementation must maintain an explicit `pendingCandidates` array (as shown in the `WebRTCSession` code above) to buffer incoming candidates until `remoteDescription` is non-null.

## Diagnostic Inspection with `chrome://webrtc-internals`

When debugging connection failures, open `chrome://webrtc-internals` in Chrome (or `about:webrtc` in Firefox). Look for the specific section corresponding to the target `RTCPeerConnection`.

```
=================================================================================
CHROME://WEBRTC-INTERNALS DIAGNOSTIC GUIDE
=================================================================================

1. STATS TABLE: RTCIceCandidatePair
   ------------------------------------------------------------------------------
   Metric                      | Normal Range          | Failure Indicator
   ------------------------------------------------------------------------------
   state                       | "succeeded"           | "failed" / "in-progress"
   currentRoundTripTime        | 0.01s - 0.15s         | > 0.50s or null
   requestsReceived            | > 1                   | 0 (Remote unreachable)
   responsesReceived           | > 1                   | 0 (Firewall dropping UDP)
   bytesSent / bytesReceived   | Monotonically rising  | bytesSent > 0, bytesRecv = 0

2. API CALL TRACE (Signaling Log)
   ------------------------------------------------------------------------------
   Expected Sequence:
   - setLocalDescription(offer)
   - setRemoteDescription(answer)
   - addIceCandidate(srflx/relay)
   
   Red Flags:
   - addIceCandidate called prior to setRemoteDescription
   - InvalidStateError: Failed to set remote offer in state have-local-offer
   - iceConnectionStateChanged: checking -> failed (No candidate pair succeeded)
=================================================================================
```

### Command-Line Diagnostics
For deeper logging, launch Chromium from the terminal with verbose WebRTC logging enabled:

```bash
google-chrome --enable-logging=stderr --v=1 --vmodule=*webrtc*=2,rtc_*=2 > webrtc_debug.log 2>&1
```

Grep the log for `ICE candidate pair` or `P2PTransportChannel` to observe raw STUN binding request timeouts (`STUN binding request timed out after 500ms`).

## Failure Modes & Diagnostic Matrix

| Failure Mode | Observed Symptom | `webrtc-internals` Event / Metric | Root Cause & Remediation |
| :--- | :--- | :--- | :--- |
| **Unbuffered Candidate Race** | Connection hangs at `connecting`; media never starts. | `addIceCandidate` error: `Remote description is null`. | Incoming candidate arrived before `setRemoteDescription`. Implement candidate queueing. |
| **Glare Collision** | Both peers throw `InvalidStateError`; signaling state gets stuck in `have-local-offer`. | `setRemoteDescription` rejected: `Failed to set remote offer in state have-local-offer`. | Simultaneous offers sent. Implement W3C Perfect Negotiation with rollback. |
| **UDP Blocked (Corporate Firewall)** | `connectionState` moves to `failed` after ~10 seconds in `checking`. | `responsesReceived = 0` on all `srflx` candidate pairs. | Network blocks outbound UDP traffic. Add TURN server listening on TCP/TLS port 443. |
| **Symmetric NAT without TURN** | `iceConnectionState` transitions `checking` -> `failed`. | Candidate pairs formed (`srflx` <-> `srflx`), STUN binding requests time out. | Symmetric NAT mapped different external ports for STUN vs peer traffic. Configure TURN `relay` candidates. |
| **STUN Gathering Timeout** | Initial call setup takes > 5 seconds before SDP is sent. | Long gap between `createOffer` and `onicecandidate` completion. | STUN server endpoint is offline or unresponsive. Set a candidate gathering timeout (e.g., 2000ms) or use Trickle ICE. |

## Pre-Flight Connection Checklist

- [ ] **Signaling Ordering**: Ensure candidate messages arriving prior to `setRemoteDescription` are buffered in an array and drained sequentially after description application.
- [ ] **Perfect Negotiation**: Implement polite/impolite role handling with `pc.setLocalDescription({ type: 'rollback' })` to handle glare collisions.
- [ ] **TURN Cluster Setup**: Configure at least two distinct TURN endpoints operating on both UDP (port 3478) and TCP/TLS (port 443).
- [ ] **Candidate Type Auditing**: Verify during staging tests that `relay` candidates are correctly generated when forcing `iceTransportPolicy: 'relay'`.
- [ ] **ICE Timeout Monitoring**: Implement an explicit timer (e.g., 10 seconds) on `connectionState === 'connecting'`. If connection fails to transition to `connected`, trigger ICE restart via `pc.restartIce()`.
