import { Image, View, Text, StyleSheet } from 'react-native'
import { tokens } from './theme'
import { Icon } from './Icon'

type Props = {
  uri?: string | null
  size?: number
  fallback?: string
  shape?: 'circle' | 'square'
  borderColor?: string
}

export function UserAvatar({
  uri,
  size = 40,
  fallback,
  shape = 'circle',
  borderColor,
}: Props) {
  const borderRadius = shape === 'circle' ? size / 2 : size > 32 ? 8 : 3

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.base,
          {
            width: size,
            height: size,
            borderRadius,
            borderColor,
            borderWidth: borderColor ? 2 : 0,
          },
        ]}
        resizeMode="cover"
      />
    )
  }

  return (
    <View
      style={[
        styles.base,
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: tokens.accent + '20',
          borderColor,
          borderWidth: borderColor ? 2 : 0,
        },
      ]}>
      {fallback ? (
        <Text
          style={[
            styles.fallbackText,
            { fontSize: size * 0.4, color: tokens.accent },
          ]}>
          {fallback.slice(0, 1).toUpperCase()}
        </Text>
      ) : (
        <Icon name="person" size={size * 0.5} color={tokens.accent} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontWeight: '700',
  },
})
