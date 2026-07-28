/// <reference types="vite/client" />

/**
 * Vite 客户端类型声明。
 *
 * 通过三斜线指令引用 vite/client.d.ts,该声明文件为以下资源提供模块类型,
 * 从而消除 `import './styles.css'` 这类副作用导入的"找不到模块"报错:
 *   - *.css / *.module.css (及 scss/sass/less 等)
 *   - 静态资源:*.svg / *.png / *.jpg / *.webp / *.woff2 ...
 *   - ?url / ?raw / ?worker / ?inline 等查询导入
 *   - import.meta.env / import.meta.hot
 *
 * 本文件在 tsconfig.json 的 include:['src'] 范围内,会被自动纳入编译。
 */