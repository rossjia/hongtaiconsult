# CFIR 2.0 MSL Situation Analysis Tool

基于 CFIR 2.0 框架的医学事务情境分析工具，帮助 MSL 和医学部团队系统化评估创新方案在目标医院的实施障碍与促进因素。

## 功能特点

- **CFIR 2.0 五维评估**：创新领域、外部环境、内部环境、个人领域、实施过程
- **ERIC 策略匹配**：基于评估结果自动推荐实施策略
- **AI 提示词生成**：一键复制结构化提示词，可粘贴到 ChatGPT/DeepSeek 等大模型获取深度分析
- **纯离线运行**：所有数据仅存于本地浏览器，不上传任何服务器
- **中英双语支持**

## 部署到 GitHub Pages（5分钟）

### 步骤 1：创建 GitHub 仓库

1. 登录 [github.com](https://github.com)（没有账号则免费注册）
2. 点击右上角 **"+"** → **"New repository"**
3. 仓库名填写：`cfir-msl-tool`
4. 选择 **Public**
5. 点击 **"Create repository"**

### 步骤 2：上传文件

1. 在新创建的仓库页面，点击 **"uploading an existing file"**
2. 将本文件夹中的 `index.html` 拖拽上传
3. 点击 **"Commit changes"**

### 步骤 3：开启 GitHub Pages

1. 进入仓库 → **Settings**（顶部标签栏）
2. 左侧菜单找到 **Pages**
3. Source 选择 **"Deploy from a branch"**
4. Branch 选择 **main**，文件夹选 **/ (root)**
5. 点击 **Save**
6. 等待约 1-2 分钟，页面顶部会出现：
   > Your site is live at `https://你的用户名.github.io/cfir-msl-tool/`

### 步骤 4：在微信公众号中使用

1. **阅读原文链接**：在公众号文章编辑页底部，将上述 URL 填入"阅读原文"
2. **生成二维码**：用 [草料二维码](https://cli.im/) 将 URL 转为二维码图片，插入文章正文中
3. 读者可通过以下方式访问：
   - 点击文末"阅读原文"
   - 长按识别文中二维码
   - 复制链接到手机浏览器打开

## 学术引用

- CFIR 2.0: Damschroder LJ, et al. The updated Consolidated Framework for Implementation Research. *Implementation Science*. 2022;17(1):75.
- ERIC: Powell BJ, et al. A refined compilation of implementation strategies. *Implementation Science*. 2015;10:21.

## 免责声明

本工具仅供学习参考，不代表 CFIR/ERIC 原作者官方立场。所有用户数据仅存于本地浏览器，不上传任何服务器。
