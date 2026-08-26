# VastNext 产品家族导航设计

## 目标

在 Vast Translator 中明确产品归属于 VastNext，并为 Findry AI、Password Generator 等产品提供稳定但不干扰翻译工作的入口。

## 信息架构

- 顶部品牌区显示 `Vast Translator · by VastNext`。
- `VastNext` 链接到 `https://vastnext.com`，作为清晰的主站 backlink。
- 页脚提供 VastNext、Findry AI、Password Generator 和 GitHub 四个产品家族链接。
- 外部链接使用新标签页打开，并设置安全的 `rel` 属性。

## 视觉与交互

- 延续现有浅色工具界面，不增加推广卡片、弹窗或动画。
- 顶部归属文字弱于产品名称，避免争夺主品牌层级。
- 页脚链接采用紧凑的文字导航和现有蓝色 hover 状态。
- 移动端允许页脚换行，所有链接保持可读、可点击。

## 验证

- 组件测试确认主站 backlink 和三个产品入口的 URL、标签页行为与安全属性。
- 桌面和移动端检查顶部、页脚布局无溢出。
- 完整测试、TypeScript、ESLint 和生产构建通过。
