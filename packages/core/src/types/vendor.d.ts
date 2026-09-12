declare module '@ikenxuan/watermark' {
  export function embedWatermarkToPngBytes(
    input: Buffer,
    watermarkText: string
  ): Buffer | Uint8Array
}

declare module 'opencc-js' {
  type ConverterOptions = {
    from: string
    to: string
  }

  type Converter = (input: string) => string

  const OpenCC: {
    Converter(options: ConverterOptions): Converter
  }

  export default OpenCC
}
