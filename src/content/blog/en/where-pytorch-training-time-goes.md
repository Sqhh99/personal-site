---
title: Where PyTorch training time actually goes
description: Your GPU is probably idle. Profiling a training loop usually finds the bottleneck somewhere other than the model.
date: 2026-07-20
tag: PyTorch
featured: false
---

When a training run is slower than expected, the instinct is to look at the model. It is
almost never the model. In practice the GPU spends a surprising share of its time waiting —
for data, for synchronisation, for the Python interpreter.

The first job is to find out which.

## Measure before you touch anything

Wall-clock timing around a training step is misleading, because CUDA operations are
asynchronous. `loss.backward()` returns long before the work finishes; the Python line that
looks slow is often just the one that happened to block.

Anything that reads a tensor's value on the CPU forces a sync:

```python
# Forces the CPU to wait for every queued kernel.
running_loss += loss.item()
```

Do that every step and you have serialised your pipeline. Accumulate on-device instead and
read once per epoch:

```python
running_loss += loss.detach()          # stays on the GPU
...
print(f"loss={(running_loss / steps).item():.4f}")  # one sync, per epoch
```

For real numbers, use the profiler rather than a stopwatch:

```python
from torch.profiler import profile, ProfilerActivity, schedule

with profile(
    activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
    schedule=schedule(wait=1, warmup=1, active=3),
    record_shapes=True,
) as prof:
    for step, batch in enumerate(loader):
        train_step(batch)
        prof.step()
        if step >= 8:
            break

print(prof.key_averages().table(sort_by="cuda_time_total", row_limit=15))
```

The number to look at first is not any individual kernel. It is the ratio of total CUDA time
to total wall time. If the GPU is busy 40% of the time, no kernel-level optimisation will
help you — the problem is upstream.

## The data loader is the usual suspect

The default `DataLoader` runs in the main process. Every batch is decoded, augmented and
collated while the GPU sits idle.

```python
loader = DataLoader(
    dataset,
    batch_size=64,
    num_workers=8,          # overlap loading with compute
    pin_memory=True,        # enables async host→device copies
    persistent_workers=True,  # don't respawn workers every epoch
    prefetch_factor=4,
)
```

`pin_memory=True` matters more than it looks. Pageable host memory cannot be copied to the
device asynchronously, so without it every transfer is a synchronisation point, and the
`num_workers` you just added buys you much less than you expected.

A caveat on `num_workers`: each worker is a process with its own copy of the dataset object.
If your dataset holds a large in-memory structure, you have just multiplied your RAM
footprint by eight. And on datasets of many small files, the bottleneck is filesystem
syscalls, not decoding — packing into shards helps far more than adding workers.

## Mixed precision, correctly

On any recent GPU, `bfloat16` autocast is close to free performance:

```python
scaler = torch.amp.GradScaler("cuda")

for batch in loader:
    optimizer.zero_grad(set_to_none=True)

    with torch.autocast("cuda", dtype=torch.bfloat16):
        loss = criterion(model(batch.x), batch.y)

    scaler.scale(loss).backward()
    scaler.step(optimizer)
    scaler.update()
```

Two details that are easy to get wrong. `set_to_none=True` frees the gradient buffers instead
of filling them with zeros — cheaper, and now the default in recent versions. And the loss
computation belongs *inside* the autocast block while `backward()` belongs *outside* it;
autocast governs the forward pass, and the backward pass follows the dtypes the forward pass
chose.

With `bfloat16` you can usually skip the `GradScaler` entirely, since its dynamic range
matches `float32`. It is `float16` that needs the scaling to keep small gradients from
flushing to zero.

## Small things that add up

- `torch.backends.cudnn.benchmark = True` lets cuDNN autotune convolution algorithms. Worth it
  when input shapes are fixed; actively harmful when they vary, because it re-tunes constantly.
- `model = torch.compile(model)` fuses pointwise operations and cuts launch overhead. The first
  step pays a compilation cost of tens of seconds; anything shape-dynamic triggers recompiles.
- Move the host→device copy off the critical path with `.to(device, non_blocking=True)`, which
  only does anything if the source memory is pinned.

## The pattern

Nearly every slow training loop I have profiled fell into one of three buckets: a hidden
synchronisation in the logging path, a data loader that could not keep up, or a model small
enough that kernel launch overhead dominated the actual arithmetic.

None of those are found by staring at the model definition. Profile the loop, look at GPU
utilisation before anything else, and fix the largest gap.
