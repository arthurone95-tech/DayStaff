import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import '../services/textEncodingPolyfill';
import { utf8ToBytes } from '../services/qrCrypto';

interface QrCodeProps {
  value: string;
  size?: number;
  darkColor?: string;
  lightColor?: string;
}

const QUIET_ZONE_MODULES = 4;

/**
 * Lightweight QR renderer.
 *
 * `toqr` produces the module matrix; we draw only the dark modules as
 * absolutely-positioned Views so the kiosk does not need an SVG dependency.
 */
export function QrCode({
  value,
  size = 232,
  darkColor = '#06142B',
  lightColor = '#FFFFFF',
}: QrCodeProps) {
  const modules = useMemo(() => {
    try {
      // Loaded lazily so the TextEncoder polyfill above runs first.
      const { toQR } = require('toqr') as typeof import('toqr');
      return toQR(utf8ToBytes(value));
    } catch {
      return new Uint8Array(0);
    }
  }, [value]);

  const extent = Math.round(Math.sqrt(modules.length));
  if (extent < 21) {
    return (
      <View
        style={{ width: size, height: size, backgroundColor: lightColor }}
      />
    );
  }

  const total = extent + QUIET_ZONE_MODULES * 2;
  const cell = size / total;
  const cells: Array<{ key: string; left: number; top: number }> = [];
  for (let row = 0; row < extent; row += 1) {
    for (let col = 0; col < extent; col += 1) {
      if (modules[row * extent + col]) {
        cells.push({
          key: `${row}-${col}`,
          left: (col + QUIET_ZONE_MODULES) * cell,
          top: (row + QUIET_ZONE_MODULES) * cell,
        });
      }
    }
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Attendance verification QR code"
      style={[
        styles.frame,
        { width: size, height: size, backgroundColor: lightColor },
      ]}
    >
      {cells.map((module) => (
        <View
          key={module.key}
          style={{
            position: 'absolute',
            left: module.left,
            top: module.top,
            width: cell + 0.35,
            height: cell + 0.35,
            backgroundColor: darkColor,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: 8,
  },
});
