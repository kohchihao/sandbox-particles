/// <reference types="vite/client" />

import type { SandHook } from './engine';

declare global {
  interface Window {
    __sand?: SandHook;
  }
}
