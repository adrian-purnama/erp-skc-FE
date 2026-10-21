import { redirect } from '@tanstack/react-router'
import { bootstrapAuth, canFromUser } from '#/context/authContext'

/** Gate a route on a single permission; redirect when missing. */
export async function requirePermissionBeforeLoad(
  key: string,
  redirectTo:
    | '/dashboard'
    | '/dashboard/customers'
    | '/dashboard/vendors'
    | '/dashboard/projects' = '/dashboard',
): Promise<void> {
  const user = await bootstrapAuth()
  if (!user || !canFromUser(user, key)) {
    throw redirect({ to: redirectTo })
  }
}
