import { redirect } from '@tanstack/react-router'
import { bootstrapAuth, canAnyFromUser } from '#/context/authContext'

/** Gate a route on a permission (or any of a list); redirect when missing. */
export async function requirePermissionBeforeLoad(
  key: string | string[],
  redirectTo:
    | '/dashboard'
    | '/dashboard/customers'
    | '/dashboard/vendors'
    | '/dashboard/projects' = '/dashboard',
): Promise<void> {
  const user = await bootstrapAuth()
  if (!user || !canAnyFromUser(user, [key].flat())) {
    throw redirect({ to: redirectTo })
  }
}
