declare module 'opencc-js/t2cn' {
  export function Converter(opts: { from: 't' | 'tw' | 'twp' | 'hk'; to: 'cn' }): (text: string) => string
}
