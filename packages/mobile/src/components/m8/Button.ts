import { StyleSheet } from 'react-native'
import { tokens } from './theme'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export function buttonStyle(variant: ButtonVariant = 'secondary') {
  const base = {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  switch (variant) {
    case 'primary':
      return {
        ...base,
        backgroundColor: tokens.accent,
        borderColor: tokens.accent,
      }
    case 'danger':
      return {
        ...base,
        backgroundColor: tokens.dangerTransparent,
        borderColor: tokens.dangerBorder,
      }
    case 'ghost':
      return {
        ...base,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        paddingVertical: 8,
      }
    case 'secondary':
    default:
      return {
        ...base,
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.stroke,
      }
  }
}

export function buttonTextStyle(variant: ButtonVariant = 'secondary') {
  const base = {
    fontSize: 14,
    fontWeight: '700' as const,
  }

  switch (variant) {
    case 'primary':
      return { ...base, color: tokens.onAccent }
    case 'danger':
      return { ...base, color: tokens.danger }
    case 'ghost':
      return { ...base, color: tokens.accentSoft, fontSize: 13 }
    case 'secondary':
    default:
      return { ...base, color: tokens.text }
  }
}

export const buttonStyles = StyleSheet.create({
  base: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
})
