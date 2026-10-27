/// <reference types="vite/client" />
declare module 'katex/dist/contrib/auto-render' {
  const renderMathInElement: (el: HTMLElement, options?: Record<string, unknown>) => void;
  export default renderMathInElement;
}
declare module 'markdown-it-footnote';
