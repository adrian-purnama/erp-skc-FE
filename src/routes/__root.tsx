import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { Toaster } from 'react-hot-toast'
import Footer from '../components/Footer'
import Header from '../components/Header'
import { AuthProvider } from '../context/authContext'
import { BrandingProvider } from '../context/brandingContext'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Enterprise Resource Management',
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <link rel="stylesheet" href={appCss} />
      </head>

      <body className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-[var(--surface)] text-[var(--ink)] antialiased">
        <AuthProvider>
          <BrandingProvider>
            <Header />
            <div data-theme="app" className="bg-[var(--surface)] text-[var(--ink)]">
              {children}
            </div>
            <Footer />
          </BrandingProvider>
        </AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              border: '1px solid var(--line)',
              background: '#fff',
              color: 'var(--ink)',
              fontSize: '0.875rem',
              borderRadius: 'var(--radius-sm)',
            },
            success: {
              style: {
                border: '1px solid #bbf7d0',
                background: '#f0fdf4',
                color: 'var(--ink)',
              },
              iconTheme: {
                primary: '#16a34a',
                secondary: '#f0fdf4',
              },
            },
            error: {
              style: {
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: 'var(--ink)',
              },
              iconTheme: {
                primary: '#dc2626',
                secondary: '#fef2f2',
              },
            },
          }}
        />
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
