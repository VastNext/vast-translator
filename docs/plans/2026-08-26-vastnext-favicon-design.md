# VastNext 品牌图标设计

## 目标

Vast Translator 使用 VastNext 官方品牌图标替换 Next.js 模板 favicon，使浏览器标签页与 `vastnext.com` 保持统一。

## 方案

- 将 `https://vastnext.com/favicon.svg` 复制为项目本地 `src/app/icon.svg`。
- 删除模板生成的 `src/app/favicon.ico`，避免浏览器或 Next.js 优先使用旧图标。
- 不引用远程资源，确保主站不可用时翻译站图标仍能加载。

## 验证

- Next.js 生产构建成功。
- 首页元数据引用 `/icon.svg`。
- `/icon.svg` 返回 SVG 图标，页面不再引用 `/favicon.ico`。
