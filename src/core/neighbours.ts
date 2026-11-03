export function cellIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}
