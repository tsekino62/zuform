// Vite が処理するアセットの型宣言
declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.css' {
  const css: string;
  export default css;
}
