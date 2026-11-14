/**
 * Hermes does not provide TextEncoder/TextDecoder. `toqr` constructs a
 * TextEncoder at module load time, so this module must be imported before it.
 */
import { bytesToUtf8, utf8ToBytes } from './qrCrypto';

type EncoderLike = {
  encoding: string;
  encode(input?: string): Uint8Array;
  encodeInto(
    input: string,
    destination: Uint8Array,
  ): { read: number; written: number };
};

type DecoderLike = {
  encoding: string;
  decode(input?: Uint8Array): string;
};

const globalScope = globalThis as unknown as {
  TextEncoder?: new () => EncoderLike;
  TextDecoder?: new () => DecoderLike;
};

if (!globalScope.TextEncoder) {
  globalScope.TextEncoder = class TextEncoderPolyfill implements EncoderLike {
    encoding = 'utf-8';

    encode(input = ''): Uint8Array {
      return utf8ToBytes(String(input));
    }

    encodeInto(
      input: string,
      destination: Uint8Array,
    ): { read: number; written: number } {
      const encoded = utf8ToBytes(String(input));
      const written = Math.min(encoded.length, destination.length);
      destination.set(encoded.subarray(0, written));
      return { read: written, written };
    }
  };
}

if (!globalScope.TextDecoder) {
  globalScope.TextDecoder = class TextDecoderPolyfill implements DecoderLike {
    encoding = 'utf-8';

    decode(input?: Uint8Array): string {
      return input ? bytesToUtf8(input) : '';
    }
  };
}
