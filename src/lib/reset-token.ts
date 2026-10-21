export interface ResetTokenPayload {
  email: string
  otp: string
}

export function decodeResetToken(token: string): ResetTokenPayload | null {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as ResetTokenPayload

    if (
      typeof payload.email !== 'string' ||
      typeof payload.otp !== 'string' ||
      !payload.email ||
      !payload.otp
    ) {
      return null
    }

    return payload
  } catch {
    return null
  }
}
