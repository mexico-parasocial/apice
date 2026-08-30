import { Pressable, StyleSheet, Text, View } from 'react-native'
import { tokens } from './theme'

export function SegmentedControl<T extends string>({
  options,
  active,
  onSelect,
  activeColor = tokens.accent,
}: {
  options: { id: T; label: string }[]
  active: T
  onSelect: (id: T) => void
  activeColor?: string
}) {
  const activeIndex = options.findIndex((o) => o.id === active)

  return (
    <View style={styles.container}>
      {/* Active pill background */}
      <View
        style={[
          styles.pill,
          {
            width: `${100 / options.length}%`,
            left: `${(Math.max(0, activeIndex) * 100) / options.length}%`,
            backgroundColor: tokens.surfaceRaised,
          },
        ]}
      />
      {options.map((opt) => {
        const isActive = opt.id === active
        return (
          <Pressable
            key={opt.id}
            onPress={() => onSelect(opt.id)}
            style={styles.segment}
          >
            <Text
              style={[
                styles.label,
                isActive && { color: activeColor, fontWeight: '700' },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 2,
    backgroundColor: tokens.surfaceTransparent,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 0,
    borderRadius: 8,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    zIndex: 1,
  },
  label: {
    color: tokens.muted,
    fontSize: 13,
    fontWeight: '600',
  },
})
