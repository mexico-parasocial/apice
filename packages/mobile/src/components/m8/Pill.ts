import { StyleSheet } from 'react-native'
import { tokens } from './theme'

export type PillVariant = 'default' | 'success' | 'warning' | 'danger' | 'accent' | 'muted'

export function pillStyle(variant: PillVariant = 'default') {
  const colors: Record<PillVariant, { bg: string; text: string; border: string }> = {
    default: { bg: tokens.surfaceTransparent, text: tokens.text, border: tokens.stroke },
    success: { bg: tokens.success + '20', text: tokens.success, border: tokens.success + '40' },
    warning: { bg: tokens.warning + '20', text: tokens.warning, border: tokens.warning + '40' },
    danger: { bg: tokens.danger + '20', text: tokens.danger, border: tokens.danger + '40' },
    accent: { bg: tokens.accentTransparent, text: tokens.accentSoft, border: tokens.accentBorder },
    muted: { bg: tokens.surfaceTransparent, text: tokens.muted, border: tokens.stroke },
  }

  const c = colors[variant]
  return {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: c.bg,
  }
}

export function pillTextStyle(variant: PillVariant = 'default') {
  const colors: Record<PillVariant, string> = {
    default: tokens.text,
    success: tokens.success,
    warning: tokens.warning,
    danger: tokens.danger,
    accent: tokens.accentSoft,
    muted: tokens.muted,
  }

  return {
    color: colors[variant],
    fontSize: 11,
    fontWeight: '700' as const,
  }
}

export const pillStyles = StyleSheet.create({
  base: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
})
