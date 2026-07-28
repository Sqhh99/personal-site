---
title: PyTorch 训练时间究竟花在了哪里
description: 你的 GPU 很可能处于闲置状态。对训练循环进行性能剖析，通常会发现瓶颈在模型之外的其他地方。
date: 2026-07-20
tag: PyTorch
featured: false
---

当训练运行速度慢于预期时，直觉通常是去检查模型。但问题几乎从来不在模型上。在实践中，GPU 花费了惊人比例的时间在等待——等待数据、等待同步、等待 Python 解释器。

首要任务是找出究竟是哪一个。

## 在动手修改任何代码之前先进行测量

围绕训练步骤进行墙上时间（Wall-clock time）计时具有误导性，因为 CUDA 操作是异步的。`loss.backward()` 在工作完成很久之前就已返回；看起来很慢的那行 Python 代码，往往只是恰好触发了阻塞同步的那一行。

任何在 CPU 上读取 Tensor 值的操作都会强制进行同步：

```python
# 强制 CPU 等待队列中的每一个 Kernel 完成。
running_loss += loss.item()
```

如果每个 step 都这样做，你就将管线串行化了。改为在设备端累加，每个 Epoch 只读取一次：

```python
running_loss += loss.detach()          # 保留在 GPU 上
...
print(f"loss={(running_loss / steps).item():.4f}")  # 每个 Epoch 仅同步一次
```

要获得真实的数据，请使用 Profiler 而不是秒表：

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

首先看的数据不是任何单个 Kernel，而是总 CUDA 时间与总墙上时间的比例。如果 GPU 仅在 40% 的时间内处于忙碌状态，那么任何 Kernel 级别的优化都救不了你——问题出在上游。

## DataLoader 是最常见的嫌疑人

默认的 `DataLoader` 在主进程中运行。当 GPU 闲置时，每一个 Batch 都在被解码、增强和整理。

```python
loader = DataLoader(
    dataset,
    batch_size=64,
    num_workers=8,          # 重叠数据加载与计算
    pin_memory=True,        # 启用异步 host→device 复制
    persistent_workers=True,  # 不要在每个 Epoch 重新创建 worker 进程
    prefetch_factor=4,
)
```

`pin_memory=True` 比看起来更重要。可分页的宿主内存无法异步复制到设备，因此如果没有设置它，每次传输都是一个同步点，你刚添加的 `num_workers` 带来的收益会远低于预期。

关于 `num_workers` 的注意事项：每个 worker 都是一个拥有 dataset 对象独立副本的进程。如果你的 dataset 在内存中持有一个大型结构，你刚刚将内存占用翻了八倍。此外，在包含许多小文件的数据集上，瓶颈是文件系统系统调用而非解码——分块归档（Sharding）比增加 worker 帮助大得多。

## 正确使用混合精度

在任何较新的 GPU 上，`bfloat16` 自动混合精度（autocast）几乎是免费的性能提升：

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

有两个容易弄错的细节。`set_to_none=True` 会释放梯度缓冲区而不是用零填充——更轻量，且已成为近期的默认设置。另外，loss 计算属于 autocast 块 *内部*，而 `backward()` 属于 *外部*；autocast 控制前向传播，后向传播遵循前向传播选择的 dtype。

对于 `bfloat16`，通常可以完全跳过 `GradScaler`，因为它的动态范围与 `float32` 匹配。是 `float16` 需要 Scaling 来防止小梯度下溢清零。

## 积少成多的细节

- `torch.backends.cudnn.benchmark = True` 让 cuDNN 自动微调卷积算法。输入形状固定时非常值得；输入形状动态变化时反而有害，因为它会频繁重新微调。
- `model = torch.compile(model)` 融合逐元素操作并减少 Launch 开销。首个 Step 会付出数秒到数十秒的编译代价；任何动态 Shape 都会触发重新编译。
- 使用 `.to(device, non_blocking=True)` 将 host→device 复制移出关键路径，注意这仅在源内存已 Pin 的情况下才有效。

## 模式总结

我剖析过的几乎每个缓慢的训练循环都可以归为以下三类之一：日志路径中的隐式同步、无法跟上进度的 DataLoader，或者模型太小导致 Kernel Launch 开销主导了实际的算术运算。

盯着模型定义看是发现不了这些问题的。剖析循环，在做其他任何事情之前先看 GPU 利用率，然后修复最大的那处空隙。
