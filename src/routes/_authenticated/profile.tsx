import { createFileRoute } from '@tanstack/react-router'
import ProfileForm from '#/components/forms/ProfileForm'
import RootMainMenuShell from '#/components/RootMainMenuShell'
import { appPageClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/_authenticated/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  return (
    <RootMainMenuShell>
      <main className="min-w-0 overflow-x-hidden px-6 py-10 sm:px-8">
        <div className={appPageClassName}>
          <ProfileForm />
        </div>
      </main>
    </RootMainMenuShell>
  )
}
