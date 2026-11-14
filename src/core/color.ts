export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const value = parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function rgbToCss([r, g, b]: Rgb, alpha = 1): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Lighter (k > 1) or darker (k < 1) */
export function shade(c: Rgb, k: number): Rgb {
  return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]
}

/** A colour along a ramp of colours, t in 0..1 */
export function ramp(colors: Rgb[], t: number): Rgb {
  const x = Math.max(0, Math.min(0.9999, t)) * (colors.length - 1)
  const i = Math.floor(x)
  return mix(colors[i], colors[i + 1], x - i)
}
