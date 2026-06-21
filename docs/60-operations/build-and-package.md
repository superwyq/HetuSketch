# 构建与打包

## 构建

```powershell
npm run build
```

该命令先执行 `npm run typecheck`，再使用 electron-vite 构建 main、preload、renderer 三段产物到 `out/`。

## 目录打包

```powershell
npm run package
```

生成未安装的应用目录，用于本地检查打包产物。

## 安装包

```powershell
npm run dist
```

使用 electron-builder 生成 Windows NSIS 安装包，输出到 `release/`。

## package.json 配置

- `appId`: `cn.hetusketch.app`
- `productName`: `HetuSketch`
- `asar`: `true`
- Windows target: `nsis`
- `allowToChangeInstallationDirectory`: `true`

## 注意事项

- `better-sqlite3` 为原生依赖，打包前如出现 ABI 问题可运行 `npm run eb:rebuild`。
- 发布前应完成 typecheck、lint、test 和手动冒烟验证。
