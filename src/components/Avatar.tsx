import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

interface AvatarProps {
  name: string;
  photoUri: string | null;
  size?: number;
  ringColor?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Avatar({ name, photoUri, size = 56, ringColor }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View
      style={[
        styles.wrapper,
        dimension,
        ringColor ? { borderWidth: 2, borderColor: ringColor } : null,
      ]}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={[styles.image, dimension]} />
      ) : (
        <View style={[styles.fallback, dimension]}>
          <Text style={[styles.initials, { fontSize: size * 0.36 }]}>
            {initials(name)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    backgroundColor: colors.slate200,
  },
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  initials: {
    color: colors.white,
    fontWeight: '700',
  },
});
