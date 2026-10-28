import { useEffect, useState, type ReactNode } from 'react'
import { BadgeCheck, Clock, Download, FileX2, LoaderCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { API_BASE_URL, apiFetch } from '#/lib/api'
import {
  formatRupiah,
  formatYmdLong,
  quotationPrintRows,
  type PublicQuotation,
  type PublicQuotationLink,
} from '#/lib/quotation'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  token: string
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; link: PublicQuotationLink }

/**
 * Client page reached from the QR code / link on an issued quotation. The link
 * is the credential; expired or superseded quotations never show their data.
 */
export default function PublicQuotationView({ token }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch<PublicQuotationLink>(
          `/public/quotation/${encodeURIComponent(token)}`,
        )
        if (cancelled) return
        if (!res.success) {
          setPhase({
            kind: 'error',
            message: res.message || 'This link is not valid',
          })
          return
        }
        setPhase({ kind: 'ready', link: res.data })
      } catch {
        if (!cancelled) {
          setPhase({
            kind: 'error',
            message: 'Unable to reach the server. Please try again.',
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  async function downloadPdf() {
    setDownloading(true)
    setDownloadError(null)
    try {
      const response = await fetch(
        `${API_BASE_URL}/public/quotation/${encodeURIComponent(token)}/pdf`,
      )
      if (!response.ok) {
        let message = 'Download failed'
        try {
          const body = (await response.json()) as { message?: string }
          if (body.message) message = body.message
        } catch {
          /* not JSON */
        }
        setDownloadError(message)
        return
      }
      const disposition = response.headers.get('Content-Disposition')
      const filename =
        disposition?.match(/filename="([^"]+)"/)?.[1] ?? 'Quotation.pdf'
      const url = URL.createObjectURL(await response.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('Unable to reach the server. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      {phase.kind === 'loading' ? (
        <p
          className={cn(
            'flex items-center justify-center gap-2 text-sm',
            hintClassName,
          )}
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Checking quotation…
        </p>
      ) : phase.kind === 'error' ? (
        <Notice
          icon={<FileX2 className="size-6" aria-hidden />}
          title="Link not valid"
        >
          {phase.message}
        </Notice>
      ) : phase.link.quotation ? (
        <QuotationDocument
          q={phase.link.quotation}
          logoUrl={
            phase.link.quotation.company.hasLogo
              ? `${API_BASE_URL}/public/quotation/${encodeURIComponent(token)}/logo`
              : null
          }
          downloading={downloading}
          onDownload={() => void downloadPdf()}
          downloadError={downloadError}
        />
      ) : (
        <ClosedNotice link={phase.link} />
      )}
    </main>
  )
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-(--line) bg-white px-6 py-8 text-center">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-(--surface) text-(--muted)">
        {icon}
      </div>
      <h1 className="text-lg font-medium">{title}</h1>
      <div className={cn('mt-2 text-sm', hintClassName)}>{children}</div>
    </div>
  )
}

function ClosedNotice({ link }: { link: PublicQuotationLink }) {
  const ref = (
    <>
      {link.quotationNumber ? (
        <span className="font-medium text-(--ink)">{link.quotationNumber}</span>
      ) : null}
      {link.companyName ? <> from {link.companyName}</> : null}
    </>
  )
  if (link.state === 'expired') {
    return (
      <Notice
        icon={<Clock className="size-6" aria-hidden />}
        title="Quotation expired"
      >
        <p>
          Quotation {ref} was valid until {formatYmdLong(link.validUntil)} and
          can no longer be viewed.
        </p>
        <p className="mt-2">Please contact us for an updated quotation.</p>
      </Notice>
    )
  }
  if (link.state === 'superseded') {
    return (
      <Notice
        icon={<FileX2 className="size-6" aria-hidden />}
        title="Quotation replaced"
      >
        <p>Quotation {ref} has been replaced by a newer revision.</p>
        <p className="mt-2">Please contact us for the latest quotation.</p>
      </Notice>
    )
  }
  return (
    <Notice
      icon={<FileX2 className="size-6" aria-hidden />}
      title="Link not valid"
    >
      This link does not exist. Please check the link or contact the sender.
    </Notice>
  )
}

function QuotationDocument({
  q,
  logoUrl,
  downloading,
  onDownload,
  downloadError,
}: {
  q: PublicQuotation
  /** Logo captured on this quotation; null when it has none. */
  logoUrl: string | null
  downloading: boolean
  onDownload: () => void
  downloadError: string | null
}) {
  const [logoFailed, setLogoFailed] = useState(false)
  const contact = [
    q.company.phone && `Telp: ${q.company.phone}`,
    q.company.email,
    q.company.website,
  ]
    .filter(Boolean)
    .join(' · ')
  const branches = q.company.branchOfficeAddresses
    .map((b) => b.trim())
    .filter(Boolean)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
        <span className="flex items-center gap-2">
          <BadgeCheck className="size-4 shrink-0" aria-hidden />
          Official quotation from {q.company.name}, valid until{' '}
          {formatYmdLong(q.validUntil)}.
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 bg-white"
          disabled={downloading}
          onClick={onDownload}
        >
          {downloading ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Download className="size-3.5" aria-hidden />
          )}
          Download PDF
        </Button>
      </div>
      {downloadError ? (
        <p className="text-sm text-red-600">{downloadError}</p>
      ) : null}

      <article className="space-y-6 rounded-lg border border-(--line) bg-white px-5 py-6 text-sm sm:px-8">
        <header className="flex flex-col gap-3 border-b border-(--ink)/80 pb-3 sm:flex-row sm:items-center sm:gap-5">
          {logoUrl && !logoFailed ? (
            <img
              src={logoUrl}
              alt={`${q.company.name} logo`}
              className="h-14 w-auto max-w-40 shrink-0 object-contain object-left sm:h-16"
              onError={() => setLogoFailed(true)}
            />
          ) : null}
          <div className="min-w-0 space-y-0.5">
            <h1 className="text-lg font-semibold">{q.company.name}</h1>
            {q.company.address ? (
              <p className="whitespace-pre-line text-xs">
                {branches.length > 0 ? (
                  <span className="font-medium">Head Office: </span>
                ) : null}
                {q.company.address}
              </p>
            ) : null}
            {branches.map((b, i) => (
              <p key={i} className="whitespace-pre-line text-xs">
                <span className="font-medium">Branch Office: </span>
                {b}
              </p>
            ))}
            {contact ? <p className="text-xs">{contact}</p> : null}
            {q.company.npwp ? (
              <p className="text-xs">NPWP: {q.company.npwp}</p>
            ) : null}
          </div>
        </header>

        <h2 className="text-center text-base font-semibold tracking-wide">
          PENAWARAN HARGA
        </h2>

        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <dl className="grid grid-cols-[5rem_1fr] content-start gap-x-3 gap-y-0.5">
            <dt className="font-medium">Kepada</dt>
            <dd>{q.customer.name}</dd>
            {q.customer.address ? (
              <>
                <dt className="font-medium">Alamat</dt>
                <dd className="whitespace-pre-line">{q.customer.address}</dd>
              </>
            ) : null}
            <dt className="font-medium">Up.</dt>
            <dd>{q.attention}</dd>
          </dl>
          <dl className="grid grid-cols-[5rem_1fr] content-start gap-x-3 gap-y-0.5">
            <dt className="font-medium">No.</dt>
            <dd>{q.quotationNumber}</dd>
            <dt className="font-medium">Tanggal</dt>
            <dd>{q.issuedAt ? formatYmdLong(q.issuedAt.slice(0, 10)) : '—'}</dd>
            {q.subject ? (
              <>
                <dt className="font-medium">Perihal</dt>
                <dd>{q.subject}</dd>
              </>
            ) : null}
          </dl>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="bg-(--surface) text-xs">
                <th className="border border-(--line) px-2 py-1.5">No</th>
                <th className="border border-(--line) px-2 py-1.5">Kode</th>
                <th className="border border-(--line) px-2 py-1.5 text-left">
                  Keterangan
                </th>
                <th className="border border-(--line) px-2 py-1.5">
                  Ukuran
                  <span className="block font-normal">(p x tebal x t mm)</span>
                </th>
                <th className="border border-(--line) px-2 py-1.5">Qty</th>
                <th className="border border-(--line) px-2 py-1.5">Satuan</th>
                <th className="border border-(--line) px-2 py-1.5 text-right">
                  Harga Satuan
                </th>
                <th className="border border-(--line) px-2 py-1.5 text-right">
                  Jumlah
                </th>
              </tr>
            </thead>
            <tbody>
              {quotationPrintRows(q.lines, q.sections).map((row, i) =>
                row.type === 'section' ? (
                  <tr key={i} className="bg-(--surface)">
                    <th
                      colSpan={8}
                      scope="colgroup"
                      className="border border-(--line) px-2 py-1.5 text-center text-xs font-semibold tracking-wide"
                    >
                      {row.title}
                    </th>
                  </tr>
                ) : row.type === 'subtotal' ? (
                  <tr key={i} className="bg-(--surface) font-semibold">
                    <td
                      colSpan={7}
                      className="border border-(--line) px-2 py-1.5 text-right"
                    >
                      {row.label}
                    </td>
                    <td className="border border-(--line) px-2 py-1.5 text-right tabular-nums">
                      {formatRupiah(row.amount)}
                    </td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td className="border border-(--line) px-2 py-1.5 text-center tabular-nums">
                      {row.no}
                    </td>
                    <td className="border border-(--line) px-2 py-1.5 align-top font-medium whitespace-nowrap">
                      {row.line.code}
                    </td>
                    <td className="border border-(--line) px-2 py-1.5 align-top">
                      <p className="font-semibold">{row.line.description}</p>
                      {row.line.descriptions.map((d, i) => (
                        <p key={i}>{d}</p>
                      ))}
                    </td>
                    <td className="border border-(--line) px-2 py-1.5 align-top whitespace-nowrap tabular-nums">
                      {row.line.dimension}
                    </td>
                    <td className="border border-(--line) px-2 py-1.5 text-center tabular-nums">
                      {row.line.qty}
                    </td>
                    <td className="border border-(--line) px-2 py-1.5 text-center">
                      {row.line.uom}
                    </td>
                    <td className="border border-(--line) px-2 py-1.5 text-right tabular-nums">
                      {formatRupiah(row.line.unitPrice)}
                    </td>
                    <td className="border border-(--line) px-2 py-1.5 text-right tabular-nums">
                      {formatRupiah(row.line.lineTotal)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt>Subtotal</dt>
          <dd className="text-right tabular-nums">
            {formatRupiah(q.totals.subtotal)}
          </dd>
          {Number(q.totals.discountAmount) > 0 ? (
            <>
              <dt>
                Diskon
                {q.discountType === 'percent' ? ` ${q.discountValue}%` : ''}
              </dt>
              <dd className="text-right tabular-nums">
                −{formatRupiah(q.totals.discountAmount)}
              </dd>
              <dt>DPP</dt>
              <dd className="text-right tabular-nums">
                {formatRupiah(q.totals.taxBase)}
              </dd>
            </>
          ) : null}
          {Number(q.taxPercent) > 0 ? (
            <>
              <dt>PPN {q.taxPercent}%</dt>
              <dd className="text-right tabular-nums">
                {formatRupiah(q.totals.taxAmount)}
              </dd>
            </>
          ) : null}
          <dt className="border-t border-(--line) pt-1 font-semibold">Total</dt>
          <dd className="border-t border-(--line) pt-1 text-right font-semibold tabular-nums">
            {formatRupiah(q.totals.grandTotal)}
          </dd>
        </dl>

        {q.termOfPaymentText || q.notes ? (
          <section className="space-y-1">
            <h3 className="font-medium">Syarat &amp; Ketentuan</h3>
            {q.termOfPaymentText ? (
              <p>Termin Pembayaran: {q.termOfPaymentText}</p>
            ) : null}
            <p>Berlaku Hingga: {formatYmdLong(q.validUntil)}</p>
            {q.notes ? <p className="whitespace-pre-line">{q.notes}</p> : null}
          </section>
        ) : null}

        <section className="ml-auto w-56 text-center">
          <p>Hormat kami,</p>
          <p className="font-semibold">{q.company.name}</p>
          <p className="mt-12 font-semibold underline underline-offset-2">
            {q.issuedByName ?? '(....................................)'}
          </p>
        </section>
      </article>
    </div>
  )
}
