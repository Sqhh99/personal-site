---
title: WebRTC 建立连接前真正发生的事
description: 信令状态机、ICE Candidate 拓扑矩阵、TURN 转发开销与 JSEP 冲突协商——深度诊断为什么 WebRTC 连接在媒体流传输前就已崩溃。
date: 2026-07-24
tag: WebRTC
featured: false
---

关于 WebRTC 最常见的误解，是认为连接失败主要是由媒体编码或网络抖动导致的。然而在真实的生产环境中，超过 80% 失败的通话在协商阶段就已崩溃——此时甚至还没有传输任何一帧 SRTP 音视频数据包。

在 `localhost` 或单一局域网环境中，WebRTC 连接显得极其稳健：RTT 接近于零，NAT 穿透轻而易举，信令消息瞬时到达。然而在跨越移动运营商网络和企业防火墙的真实网络拓扑中，连接建立过程需要穿过严格的 JSEP 状态机限制、Candidate 竞态条件、对称型 NAT 映射以及 TURN 协议分配开销。

本文将详细剖析媒体传输前阶段的底层运行机制、生产环境中的常见崩溃点以及排错诊断方法。

## JSEP 状态机与 Glare 冲突协商

WebRTC 依赖 JavaScript 会话建立协议（JSEP）来协商会话参数。协商双方通过交换 SDP（Session Description Protocol）文本块来达成共识，其中包含了编解码器能力、加密指纹（DTLS）、传输参数（ICE Ufrag/Pwd）以及媒体方向属性（`sendrecv`, `recvonly`, `sendonly`）。

### 信令状态机陷阱
`RTCPeerConnection` 内部维护着一个严格的状态机，通过 `pc.signalingState` 暴露：

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
               /                                /
                v                              v
              +------------------------------------+
              |               stable               |
              +------------------------------------+
```

生产环境中最常见的故障原因，是远端 Candidate 或 Answer 消息到达时，本地 Peer 正处于无法处理该消息的非法状态。例如，在 `pc.setRemoteDescription(desc)` 尚未 resolve 之前调用 `pc.addIceCandidate(candidate)`，在旧版本浏览器中会抛出 `InvalidStateError` 或直接静默丢弃。

### 完美协商模式（Perfect Negotiation）解决 Glare 冲突
当对等双方同时发起 Offer 时（即 **Glare 冲突**），双方的状态机都会进入 `have-local-offer`。如果不做显式的冲突处理，双方都会拒绝来自对方的远端 Offer，导致信令协商死锁。

标准的解决方案是 W3C **Perfect Negotiation** 模式，它为对等节点确定性地分配 `polite`（礼貌）与 `impolite`（非礼貌）角色：

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
    // 1. 自动处理 negotiationneeded 事件
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

    // 2. Trickle ICE Candidate 发送
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.signalChannel({ candidate });
      }
    };
  }

  // 3. 处理带竞态保护的信令消息
  public async handleSignal(data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }): Promise<void> {
    try {
      if (data.description) {
        const description = data.description;
        const offerCollision =
          description.type === "offer" &&
          (this.makingOffer || this.pc.signalingState !== "stable");

        // Glare 冲突解决：Impolite 节点在冲突时忽略远端 Offer；Polite 节点回滚本地 Offer
        this.ignoreOffer = !this.isPolite && offerCollision;
        if (this.ignoreOffer) {
          return;
        }

        if (offerCollision && this.isPolite) {
          // 回滚本地 Offer 以接受远端 Offer
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

        // 远端 Description 应用完成后，清空并处理暂存的 Candidate
        await this.drainPendingCandidates();
      } else if (data.candidate) {
        if (!this.pc.remoteDescription) {
          // 暂存提前到达的 Candidate
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

## ICE 穿透与 NAT 拓扑矩阵

交互式连接建立（ICE, RFC 8445）负责在 Peer 之间寻找有效的网络路径。浏览器会收集四种类型的 ICE Candidate：

1. **Host (`host`)**: 本机物理或虚拟网络接口的直接 IP 地址（例如 `192.168.1.50`, `10.0.0.12`）。
2. **Server Reflexive (`srflx`)**: 通过查询 STUN 服务端获得的由 NAT 设备分配的公网 IP 和端口。
3. **Peer Reflexive (`prflx`)**: 在 ICE 連通性检查期间由对端直接发现的地址（通常在 Binding Request 期间 NAT 动态变更端口时产生）。
4. **Relay (`relay`)**: 在 TURN 服务端上分配的用于中继代理所有媒体流量的公网 IP 和端口。

### NAT 类型兼容性矩阵

对等双方能否通过 STUN (`srflx`) 实现直连，还是必须依赖 TURN (`relay`) 转发，完全取决于双方 NAT 的映射与过滤行为：

| 端 A NAT 类型 | 端 B NAT 类型 | 穿透机制 | 连接结果 |
| :--- | :--- | :--- | :--- |
| **完全圆锥型 (Full Cone)** | **完全圆锥型 (Full Cone)** | 直连 STUN (`srflx` <-> `srflx`) | 直连 P2P 成功 |
| **地址限制型 (Address Restricted)** | **端口限制型 (Port Restricted)** | 直连 STUN (`srflx` <-> `srflx`) | 直连 P2P 成功 |
| **端口限制型 (Port Restricted)** | **对称型 (Symmetric NAT)** | STUN 尝试失败 | **必须依赖 TURN 中继** |
| **对称型 (Symmetric NAT)** | **对称型 (Symmetric NAT)** | STUN 尝试失败 | **必须依赖 TURN 中继** |
| **企业防火墙** (UDP 封禁) | **任意类型** | TURN Over TCP / TLS (`relay`) | **必须依赖 443 端口的 TURN** |

### TURN 分配协议开销
对称型 NAT 为每一个不同的目标 IP 和端口分配独特的公网映射端口。因此，通过向 STUN 服务器 `stun.l.google.com:19302` 发送数据包所获得的公网映射，在直接发送给对端 IP 和端口时是完全无效的。

TURN 穿透遵循 RFC 5766 规定的显式分配握手流程：

```
Client                                                  TURN Server
  |                                                          |
  |--- ALLOCATE request (UDP/TCP/TLS) ---------------------->|
  |<-- 401 Unauthorized (Stun Nonce / Realm Challenge) ------|
  |                                                          |
  |--- ALLOCATE request (带 HMAC-SHA1 认证) ----------------->|
  |<-- 200 OK (XOR-RELAYED-ADDRESS: 198.51.100.15:45231) -----|
  |                                                          |
  |--- CREATE-PERMISSION (端 B 公网地址) -------------------->|
  |<-- 200 OK -----------------------------------------------|
  |                                                          |
  |=== ChannelData / SendIndication (中继媒体流量) =========>|
```

在全球生产环境数据中：
- **15% 至 22%** 的 C 端消费级网络会话因对称型 NAT 或蜂窝网络防火墙限制而必须依赖 TURN 中继；
- **30% 至 45%** 的企业内网会话需要基于 TCP/TLS 443 端口的 TURN 中继，因为企业安全策略拦截了出站 UDP 流量（1024–65535 端口）。

如果你的 WebRTC 系统没有部署支持 443 端口的 TURN 中继服务，将会有近三分之一的用户遭遇无法建立连接的问题。

## Trickle ICE 与 Non-Trickle 时序

Candidate 收集过程是异步的。在 **Non-Trickle ICE** 模式下，Peer 会一直等待直到所有 Candidate 收集完毕（由 `onicecandidate` 返回 `null` 触发），才发送 SDP Offer/Answer。这会导致连接建立增加 1,000ms 至 3,000ms 的延迟。

在 **Trickle ICE** 模式下，初始 SDP Offer 在 `setLocalDescription()` 调用后立即发出，而 Candidate 则在 `onicecandidate` 触发时增量独立发送。

### Candidate 竞态条件
由于信令通道（WebSocket、HTTP 长轮询、MQTT）与 ICE Candidate 收集是异步运行的，Candidate 常常比远端 SDP Description 更早到达接收端。

如果在 `pc.setRemoteDescription(desc)` 完成前就调用 `pc.addIceCandidate(c)`：
- Chromium 会抛出 Unhandled Promise Rejection；
- Firefox 会静默丢弃该 Candidate，导致 ICE 检查无限期卡死。

代码中必须维护一个显式的 `pendingCandidates` 暂存数组（如上文 `WebRTCSession` 代码所示），直到 `remoteDescription` 不为空时再按序清空。

## 使用 `chrome://webrtc-internals` 进行排错诊断

当出现连接建立失败时，在 Chrome 地址栏打开 `chrome://webrtc-internals`（或 Firefox 的 `about:webrtc`），找到对应目标 `RTCPeerConnection` 的诊断面板：

```
=================================================================================
CHROME://WEBRTC-INTERNALS 诊断指南
=================================================================================

1. 统计数据表：RTCIceCandidatePair
   ------------------------------------------------------------------------------
   指标名称                    | 正常范围              | 故障指示器
   ------------------------------------------------------------------------------
   state                       | "succeeded"           | "failed" / "in-progress"
   currentRoundTripTime        | 0.01s - 0.15s         | > 0.50s 或 null
   requestsReceived            | > 1                   | 0 (远端无法到达)
   responsesReceived           | > 1                   | 0 (防火墙丢弃了 UDP 包)
   bytesSent / bytesReceived   | 单调递增              | bytesSent > 0, bytesRecv = 0

2. API 调用轨迹（信令日志）
   ------------------------------------------------------------------------------
   期望的正常时序：
   - setLocalDescription(offer)
   - setRemoteDescription(answer)
   - addIceCandidate(srflx/relay)
   
   危险信号：
   - addIceCandidate 在 setRemoteDescription 之前被调用
   - InvalidStateError: Failed to set remote offer in state have-local-offer
   - iceConnectionStateChanged: checking -> failed (无可用 Candidate 对成功)
=================================================================================
```

### 命令行日志提取
如需提取更深层次的底层日志，可在终端中带详细 WebRTC 参数启动 Chrome：

```bash
google-chrome --enable-logging=stderr --v=1 --vmodule=*webrtc*=2,rtc_*=2 > webrtc_debug.log 2>&1
```

在导出的日志中搜索 `ICE candidate pair` 或 `P2PTransportChannel`，可以观察到原生的 STUN Binding Request 超时错误（`STUN binding request timed out after 500ms`）。

## 故障模式与诊断矩阵

| 故障模式 | 观察到的异常现象 | `webrtc-internals` 事件 / 指标 | 根因与修复方案 |
| :--- | :--- | :--- | :--- |
| **Candidate 提前到达未暂存** | 连接卡在 `connecting`；媒体流从未开始。 | `addIceCandidate` 抛出错误：`Remote description is null`。 | 接收 Candidate 时远端 Description 尚未应用。实现 Candidate 暂存队列机制。 |
| **Glare 冲突协商失败** | 双方均抛出 `InvalidStateError`；信令状态卡在 `have-local-offer`。 | `setRemoteDescription` 被拒绝：`Failed to set remote offer in state have-local-offer`。 | 双方同时发送 Offer。实现带 Rollback 的 W3C Perfect Negotiation。 |
| **UDP 被封禁（企业内网）** | `connectionState` 在 `checking` 状态卡顿 ~10 秒后转为 `failed`。 | 所有 `srflx` Candidate 对的 `responsesReceived = 0`。 | 内网防火墙拦截出站 UDP 流量。部署监听在 TCP/TLS 443 端口的 TURN 服务器。 |
| **无 TURN 的对称型 NAT** | `iceConnectionState` 从 `checking` 变为 `failed`。 | 已生成 Candidate 对 (`srflx` <-> `srflx`)，但 STUN Binding 请求全部超时。 | 对称型 NAT 为 STUN 与对端流量映射了不同的公网端口。配置 TURN `relay` Candidate。 |
| **STUN 收集超时** | 建立呼叫前耗时 > 5 秒才发出 SDP。 | `createOffer` 与 `onicecandidate` 收集完成之间存在长延时。 | STUN 服务器节点宕机或无响应。设置 Candidate 收集超时上限（如 2000ms）或改用 Trickle ICE。 |

## 上线前连接检查清单

- [ ] **信令顺序控制**: 确保在 `setRemoteDescription` 前到达的 Candidate 被安全暂存到数组中，并在 Description 应用完成后按序消费。
- [ ] **Perfect Negotiation 实现**: 实现基于 `isPolite` 角色的冲突处理逻辑，并在 Glare 时使用 `pc.setLocalDescription({ type: 'rollback' })` 进行状态回滚。
- [ ] **TURN 集群部署**: 部署至少两个独立节点的 TURN 服务端，同时开启 UDP (3478) 和 TCP/TLS (443) 监听。
- [ ] **Candidate 收集审计**: 在测试环境中强制使用 `iceTransportPolicy: 'relay'`，验证 `relay` Candidate 能否被正常生成与连通。
- [ ] **ICE 超时监控机制**: 在 `connectionState === 'connecting'` 状态上设置显式定时器（如 10 秒），若未能按时转为 `connected`，则自动调用 `pc.restartIce()` 发起重连。
