import { createFileRoute } from '@tanstack/react-router'
import PublicQuotationView from '#/components/forms/PublicQuotationView'

/** Public client verification page (QR / link on issued quotations). No login. */
export const Route = createFileRoute('/q/$token')({
  head: () => ({
    meta: [
      { title: 'Verify quotation' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: QuotationVerifyPage,
})

function QuotationVerifyPage() {
  const { token } = Route.useParams()
  return <PublicQuotationView token={token} />
}
