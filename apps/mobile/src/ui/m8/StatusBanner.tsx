import { View, Text, Pressable, StyleSheet } from 'react-native'
import { tokens } from './theme'

export function StatusBanner({
  detail,
  title,
  tone,
  action,
}: {
  detail: string
  title: string
  tone: 'warning' | 'danger'
  action?: { label: string; onPress: () => void }
}) {
  return (
    <View
      style={[
        styles.banner,
        tone === 'warning' ? styles.bannerWarning : styles.bannerDanger,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.bannerEyebrow,
              {
                color:
                  tone === 'warning' ? tokens.warning : tokens.danger,
              },
            ]}
          >
            {title}
          </Text>
          <Text style={styles.bannerDetail}>{detail}</Text>
        </View>
        {action && (
          <Pressable onPress={action.onPress} style={styles.bannerAction}>
            <Text
              style={{
                color:
                  tone === 'warning' ? tokens.warning : tokens.danger,
                fontSize: 12,
                fontWeight: '700',
              }}
            >
              {action.label}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 18,
    padding: 14,
    gap: 6,
    marginTop: 12,
  },
  bannerWarning: {
    backgroundColor: tokens.warning + '15',
    borderWidth: 1,
    borderColor: tokens.warning + '40',
  },
  bannerDanger: {
    backgroundColor: tokens.danger + '15',
    borderWidth: 1,
    borderColor: tokens.danger + '40',
  },
  bannerEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bannerDetail: {
    color: tokens.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  bannerAction: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: tokens.surfaceRaised,
    marginLeft: 10,
  },
})
