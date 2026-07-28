---
title: 在 WebRTC 连接建立之前究竟发生了什么
description: 信令、SDP 和 ICE 在单粒媒体包传输之前完成了绝大部分工作——绝大多数失败的通话都在这里折戟。
date: 2026-07-24
tag: WebRTC
featured: false
---

关于 WebRTC，最让人惊讶的第一件事就是它与媒体传输本身的关系竟然如此之少。当音频开始流动时，最艰难的部分已经结束了。所有有趣的细节——以及几乎所有导致失败的原因——都发生在在此之前的协商阶段。

以下是具体的流程以及每个步骤容易失败的地方。

## 信令是你自己的问题，而不是 WebRTC 的问题

规范故意没有规定两个 Peer 如何找到彼此。你需要建立自己的通道——WebSocket、HTTP 长轮询、消息队列、甚至信鸽——来在它们之间传递 Offer、Answer 和 Candidate。

这是设计最容易出错的第一处。信令传输必须可靠且有序。如果你的传输层会丢包或打乱消息顺序，Candidate 可能会先于赋予其意义的 Remote Description 到达，导致连接永远无法建立。

## Offer/Answer 交换

呼叫方创建一个 Offer，这是一个会话描述（SDP）：它支持的编解码器、媒体方向、加密指纹、传输参数。

```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});

pc.addTrack(audioTrack, stream);

const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
signal.send({ type: 'offer', sdp: pc.localDescription });
```

被呼叫方将其应用为 *Remote* 描述，生成 Answer，将其应用为 *Local* 描述，然后发送回去。现在双方对会话的结构达成了一致。

顺序约束非常严格，也是许多困惑的根源。在 `setRemoteDescription` 完成之前，你绝不能调用 `addIceCandidate`。早到的 Candidate 必须先入队列：

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

在我排查过的几乎所有“本地正常、生产失败”的报告中，归根结底都是这种竞态条件的变体。在 localhost 上，往返延迟太短，顺序几乎从不颠倒。

## ICE：寻找真正可用的路径

与此同时，浏览器正在收集 **Candidate**——即它可能被连通的具体地址。一共有三种类型，它们之间的区别至关重要：

- **Host** Candidate 是机器自身的网络接口地址。仅当两个 Peer 处于同一个局域网时有效。
- **Server-reflexive** Candidate 来自向 STUN 服务器询问：“这个数据包看起来是从什么地址发出的？”这是 NAT 的公网出口地址，也是让普通家用路由器后面的两个 Peer 实现直连的关键。
- **Relay** Candidate 来自 TURN 服务器，它代表你转发流量。这总是能成功，但总是会消耗带宽和增加延迟。

ICE 拿到两边的 Candidate 列表，配对所有合理的组合，并同时在所有组合上运行连通性检查——双向发送 STUN Binding 请求。第一对双向成功的组合获胜。这就是为什么 WebRTC 在能够连接时连接速度极快的原因：它不是顺序探测，而是在进行竞速。

## STUN 是不够的，你会在最糟糕的时刻发现这一点

STUN 的工作原理是发现 NAT 为出站数据包创建的映射。入站数据包能否使用该映射取决于 NAT 的行为。

对称型 NAT（Symmetric NAT）——常见于企业网络和移动运营商——会为每个目的地分配 *不同的* 外网端口。你通过与 STUN 服务器交谈发现的映射对于与 Peer 交谈来说毫无用处。再多的 STUN 也无法解决这个问题。

这正是 TURN 的用武之地，其现实结论非常直接：**如果你不运行 TURN 服务器，一定有一定比例的通话永远无法连接**，而且你无法在自己的局域网中复现它。预算大约 10%–20% 的会话需要中继，在移动和企业网络中比例更高。

## 观察连接过程

两个事件能告诉你几乎一切。`onicecandidate` 在收集 Candidate 时触发——`null` Candidate 表示收集完成：

```js
pc.onicecandidate = ({ candidate }) => {
  if (candidate) signal.send({ type: 'candidate', candidate });
};

pc.onconnectionstatechange = () => {
  console.log(pc.connectionState);
};
```

`connectionState` 依次经历 `new` → `connecting` → `connected`。如果到达 `failed`，说明 ICE 穷尽了所有 Candidate 组合也没能找到可用路径。当这种情况发生时，有用的问题不是“为什么媒体断了”——因为根本没有尝试传输媒体；而是“每边究竟收集到了哪些 Candidate 类型”，答案通常是一边只收集到了 Host Candidate，或者 TURN 中继根本没有配置。

## 精简总结

媒体传输是简单的部分。确保信令顺序正确，在 Remote Description 到达之前排队 Candidate，并在需要之前就部署好 TURN 服务器。我调试过的几乎每个连接故障都可以归结为这三条之一。
