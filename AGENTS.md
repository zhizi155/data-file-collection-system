# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── page.tsx        # 文件上传主页
│   │   ├── admin/          # 管理后台
│   │   │   ├── page.tsx    # 管理后台主页
│   │   │   └── login/      # 登录页
│   │   │       └── page.tsx
│   │   └── api/            # API 路由
│   │       ├── upload/      # 文件上传接口
│   │       │   ├── chunk/   # 分片上传接口（支持大文件）
│   │       │   ├── confirm/ # 上传确认接口
│   │       │   └── presign/ # 预签名URL生成接口
│   │       ├── rules/      # 命名规则 CRUD 接口
│   │       ├── shops/      # 店铺管理接口
│   │       │   └── parse/  # Excel 解析接口
│   │       ├── variables/  # 自定义变量接口
│   │       └── files/      # 上传记录接口
│   │           └── download/  # 文件下载接口
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

## 文件收集系统功能说明

### 页面路由
- `/` - 文件上传主页（用户上传文件）
- `/admin/login` - 管理后台登录页（账号: admin，密码: admin）
- `/admin` - 管理后台（命名规则配置）

### API 接口
- `POST /api/upload` - 文件上传（FormData，字段: file, shopId 必须）
- `GET /api/rules` - 获取所有命名规则（管理后台使用）
- `POST /api/rules` - 创建命名规则
- `PUT /api/rules` - 更新命名规则
- `DELETE /api/rules?id=xxx` - 删除命名规则
- `GET /api/shops?active=true` - 获取店铺列表
- `POST /api/shops` - 批量创建店铺
- `POST /api/shops/parse` - 解析 Excel 文件（上传 Excel 导入店铺）
- `PUT /api/shops` - 更新店铺
- `DELETE /api/shops?id=xxx` - 删除店铺
- `DELETE /api/shops?clearAll=true` - 清空所有店铺
- `GET /api/variables` - 获取自定义变量
- `POST /api/variables` - 创建自定义变量
- `PUT /api/variables` - 更新自定义变量
- `DELETE /api/variables?id=xxx` - 删除自定义变量
- `GET /api/files` - 获取上传记录列表
- `DELETE /api/files?id=xxx` - 删除上传记录
- `GET /api/files/download?key=xxx` - 下载/预览文件

### 命名规则变量
| 变量 | 说明 | 示例 |
|------|------|------|
| `{original}` | 原始文件名（不含扩展名） | `report` |
| `{date}` | 当前日期 | `2026-04-14` |
| `{time}` | 当前时间 | `151622` |
| `{datetime}` | 完整日期时间 | `20260414T151622` |
| `{random}` | 8位随机字符 | `abc12345` |
| `{timestamp}` | 时间戳（毫秒） | `1713078982000` |
| `{shop}` | 店铺名称（简写） | `旗舰店` |
| `{shop_name}` | 店铺名称（完整） | `官方旗舰店` |
| `{shop_site}` | 店铺所属站点 | `中国` |
| `{shop_platform}` | 店铺所属平台 | `淘宝` |
| `{export_type}` | 文件保存类型 | `素材` |
| `{自定义变量}` | 自定义变量（在管理后台添加） | 如 `{部门}`、`{项目}` |

### 数据库表
- `naming_rules` - 命名规则配置表（支持按导出类型关联）
- `uploaded_files` - 上传文件记录表
- `shops` - 店铺列表表（支持从 Excel 导入）
- `custom_variables` - 自定义变量表

### 大文件处理机制
- **阈值**: 文件 > 50MB 被视为大文件
- **警告提示**: 超过阈值的文件会显示警告，建议压缩后再上传
- **分片上传**: 大文件使用分片上传（5MB/片），支持进度显示
- **API端点**:
  - `POST /api/upload/presign` - 生成预签名上传URL
  - `POST /api/upload/chunk` - 分片上传
  - `POST /api/upload/confirm` - 确认上传完成

### 技术集成
- **数据库**: Supabase (PostgreSQL)
- **对象存储**: S3 兼容存储 (coze-coding-dev-sdk)
- **前端状态**: 简单 localStorage 登录验证

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**
