---
title: Backpressure is the whole problem
description: Every realtime pipeline eventually produces faster than it consumes. What you do at that moment defines the system.
date: 2026-07-16
tag: Systems
featured: false
---

A camera produces 30 frames a second whether or not anything downstream is ready for them. An
encoder consumes them at whatever rate the CPU allows. A network accepts bytes at whatever
rate the path allows, which changes constantly and without warning.

Three independent rates in a row. They will not match. The interesting question is not how to
make them match — you cannot — but what the system does during the intervals when they don't.

## A queue is a decision, not a buffer

The reflexive fix is to put a queue between the stages. This feels like it solves the problem
and mostly it defers it.

An unbounded queue does not prevent overload; it converts a throughput problem into a latency
problem, and hides it. Memory climbs slowly, everything appears to work, and the frames coming
out the far end are steadily more stale. For a file transfer that is fine. For a video call it
is the worst possible outcome: you have traded the one property the user actually cares about
in order to preserve one they cannot perceive.

So bound the queue. Now you have to answer the real question: what happens when it is full?

## Four honest answers

**Block the producer.** Correct for pipelines where the source can slow down — reading a file,
draining a socket. Useless for a camera, which is not going to stop.

**Drop the oldest.** For live media this is usually right. The newest frame is the one with
information in it; the one from 400 ms ago is only useful for making the queue longer.

**Drop the newest.** Rarely what you want for media, but correct when earlier items are
prerequisites for later ones — an ordered event log, say.

**Degrade.** The most useful option and the one that takes real work: keep accepting input but
reduce what each item costs. Drop the encoder bitrate, halve the frame rate, shrink the
resolution. WebRTC does exactly this, continuously, which is why a call degrades to something
blurry instead of freezing.

The failure mode to avoid is having no policy, which in practice means "grow until something
crashes".

## Ring buffers make the policy explicit

A fixed-capacity ring that overwrites the oldest entry encodes drop-oldest directly into the
data structure — there is no code path where it can grow:

```ts
class FrameRing<T> {
  #items: (T | undefined)[];
  #head = 0;
  #size = 0;
  dropped = 0;

  constructor(readonly capacity: number) {
    this.#items = new Array(capacity);
  }

  push(item: T): void {
    if (this.#size === this.capacity) {
      // Full: overwrite the oldest and record it. The count is the point —
      // a drop you don't measure is a drop you'll argue about later.
      this.#head = (this.#head + 1) % this.capacity;
      this.#size -= 1;
      this.dropped += 1;
    }
    this.#items[(this.#head + this.#size) % this.capacity] = item;
    this.#size += 1;
  }

  shift(): T | undefined {
    if (this.#size === 0) return undefined;
    const item = this.#items[this.#head];
    this.#items[this.#head] = undefined;
    this.#head = (this.#head + 1) % this.capacity;
    this.#size -= 1;
    return item;
  }
}
```

The `dropped` counter is not incidental. A system that drops frames silently is
indistinguishable from one that is working, right up until someone complains about quality
and there is no data to reason from.

## Depth is a latency budget

Queue capacity is not a tuning knob you turn until things stop crashing. It is a latency
budget, and you can compute it: at 30 fps a frame is 33 ms, so a four-slot queue is 133 ms of
worst-case delay sitting in that stage. Add up every stage and you have your pipeline's
contribution to end-to-end latency.

Work backwards from what the application needs. Conversational audio wants the total under
about 150 ms, which does not leave room for deep queues anywhere. Live streaming with a
several-second buffer can afford to be far more relaxed.

Pick the depth from the budget, not from whatever number made the warnings stop.

## Measure the gap, not the rate

Throughput counters will tell you a struggling pipeline is fine — it is still processing 30
frames a second, just each one 800 ms late. The number that matters is the age of what comes
out: timestamp at ingest, measure at egress, watch the distribution.

That single number distinguishes the two failure modes that look identical from the outside —
a pipeline that is dropping work, and one that is silently accumulating delay. They need
opposite fixes, and only one of them is visible in a throughput graph.
