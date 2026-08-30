import { StyleSheet } from 'react-native'
import { tokens } from './theme'

export type RowVariant = 'default' | 'active' | 'danger'

export function rowStyle(variant: RowVariant = 'default') {
  const base = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    borderRadius: 16,
    padding: 14,
  }

  switch (variant) {
    case 'active':
      return { ...base, backgroundColor: tokens.surfaceRaised, borderWidth: 1, borderColor: tokens.accent }
    case 'danger':
      return { ...base, backgroundColor: tokens.surfaceRaised, borderWidth: 1, borderColor: tokens.dangerBorder }
    default:
      return { ...base, backgroundColor: tokens.surfaceRaised }
  }
}

export const rowStyles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
  },
  text: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: tokens.text,
    fontSize: 14,
    fontWeight: '700',
  },
  detail: {
    color: tokens.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  meta: {
    color: tokens.accentSoft,
    fontSize: 12,
    fontWeight: '700',
  },
})
