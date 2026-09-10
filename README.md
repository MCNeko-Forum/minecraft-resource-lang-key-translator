# 基岩版语言键值翻译器

纯前端网页工具：上传 Minecraft 基岩版资源包或语言键值文件，自动识别 `texts` 文件夹并翻译成目标语言。所有文件处理均在浏览器本地完成，不上传服务器。

**在线使用**：直接用浏览器打开 `index.html` 即可（需联网加载 CDN 依赖与翻译服务）。

## 功能

- **整包模式**：上传 `.mcpack` / `.mcaddon` / `.zip`，自动识别任意层级的 `texts` 文件夹，支持多目标语言翻译、翻译结果校对、`languages.json` 自动同步，导出保留原包结构
- **整包模式（批量）**：一次上传多个资源包，逐包独立处理，支持一键翻译、逐包下载与统一打包下载
- **单语言文件模式**：上传单个 `.lang` / `.txt`，多目标语言翻译，结果累积、打包下载（含源文件）
- **单语言文件模式（批量）**：一次上传多个语言文件，独立翻译，统一打包下载
- **格式代码处理**：`§` 颜色/格式代码替换为占位符整句翻译后原位还原，或勾选后直接删除输出纯文本
- **源文件预览/校对**：所有模式的源文件与译文均可在线查看和修改，导出使用修改后内容
- 支持 29 种基岩版官方语言，兼容 `en_UK` 等非标准代码别名
- 深色模式、移动端适配、标签页单行可滑动

## 技术栈

- 界面：[MDUI 2.x](https://www.mdui.org/) + Material Icons + 阿里巴巴普惠体
- 归档处理：[JSZip](https://stuk.github.io/jszip/)
- 翻译服务：[xnx3/translate](https://github.com/xnx3/translate)（含 3 秒限流、重复文本去重、失败回退原文）

## 目录结构

```
├── index.html          # 页面结构（4 个模式 + 信息页）
├── check.mjs           # 最小自检脚本（node check.mjs）
├── 需求文档.md          # 需求规格
└── static/
    ├── js/app.js       # 全部逻辑
    └── css/            # styles.css / fonts.css
```

## 自检

```bash
node check.mjs
```

验证语言表完整性（29 种语言与映射一致）、翻译限流、格式代码占位符还原、清单同步、UI 关键元素与引用路径等。

## 本仓库

<https://github.com/MCNeko-Forum/minecraft-resource-lang-key-translator>

## 开源协议

[MIT License](./LICENSE)
