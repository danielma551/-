// 最小類型聲明：讓 TypeScript 識別 react-dom 的 createPortal
declare module 'react-dom' {
  import { ReactNode } from 'react'
  export function createPortal(children: ReactNode, container: Element): ReactNode
}
