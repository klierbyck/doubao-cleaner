# 从豆包对话链接中提取无水印图片和视频资源的浏览器插件/油猴脚本

本目录提供两个浏览器侧入口：

- `xiaobai-parse/`：Edge / Chrome Manifest V3 浏览器插件。
- `tampermonkey/`：Tampermonkey 油猴脚本。

两者都会在豆包/千问页面右下角添加解析当前页面素材按钮。点击下载图标按钮后，会尝试从当前页面、分享弹窗或复制链接按钮中捕获图片和视频，并展示解析结果。
如果需要无水印视频资源，需要在登录的情况下使用，未登录情况下只可以解析无水印图片。

## 安装 Edge / Chrome 插件

插件目录：

```text
extension/xiaobai-parse/
```

### Edge

1. 打开：`edge://extensions/`
2. 开启 **开发人员模式**。
3. 点击 **加载解压缩的扩展**。
4. 选择 `extension/xiaobai-parse/`。
5. 进入插件详情页，确认：
   - 插件已启用
   - **站点访问权限** 允许当前网站，建议选择 **在所有站点上**
   - 如页面显示 **允许用户脚本**，需要开启
6. 打开豆包或千问页面，刷新后点击右下角按钮。

### Chrome

1. 打开：`chrome://extensions/`
2. 开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**。
4. 选择 `extension/xiaobai-parse/`。
5. 进入插件详情页，确认 **网站访问权限** 允许当前网站。
6. 打开豆包或千问页面，刷新后点击右下角按钮。

## 插件权限检查

### Edge

```text
edge://extensions/
```

打开插件详情页，确认：

- 插件开关已开启
- **站点访问权限**：选择 **在所有站点上**，或至少允许豆包/千问站点
- **允许用户脚本**：如页面中出现该选项，需要开启
- **在 InPrivate 中允许**：仅隐私窗口使用时需要开启

### Chrome

```text
chrome://extensions/
```

打开插件详情页，确认：

- 插件开关已开启
- **网站访问权限**：允许当前目标网站
- 如果插件刚重新加载过，需要刷新已经打开的网页

## 安装油猴脚本

脚本文件：

```text
tampermonkey/xiaobai-doubao-helper.user.js
```

步骤：

1. 安装 Tampermonkey / 篡改猴扩展。
2. 打开 Tampermonkey 管理面板，新建脚本。
3. 删除默认内容。
4. 复制 `tampermonkey/xiaobai-doubao-helper.user.js` 的完整内容并粘贴。
5. 保存脚本。
6. 刷新豆包或千问页面后使用右下角按钮。

## 油猴权限检查

安装油猴脚本后，请确认：

- Tampermonkey / 篡改猴扩展已启用
- 脚本本身已启用
- 脚本头部的 `@match` / `@include` 覆盖当前网站
- Edge 中如果 Tampermonkey 详情页有 **允许用户脚本**，需要开启
- Tampermonkey 扩展的 **站点访问权限** 需要允许当前网站，建议选择 **在所有站点上**

## 更新方式

### 更新插件

代码更新后，在浏览器扩展管理页点击插件的 **重新加载**，然后刷新目标网页。

### 更新油猴脚本

用最新的 `tampermonkey/xiaobai-doubao-helper.user.js` 覆盖 Tampermonkey 中的旧脚本内容并保存，然后刷新目标网页。

## 注意事项

- 如果目标素材尚未加载到页面中，请先滚动到目标消息附近，或点击一次分享/复制链接按钮后再解析。

## 隐私政策

隐私政策见：

```text
PRIVACY.md
```

## 许可证

MIT

## 社区

本开源项目已链接并认可 [LINUX DO 社区](https://linux.do)。