export const EMAIL_TYPES = ['work', 'home', 'campus', 'other'] as const
export type EmailType = (typeof EMAIL_TYPES)[number]

export const PHONE_TYPES = ['home', 'personal', 'whatsapp'] as const
export type PhoneType = (typeof PHONE_TYPES)[number]

export type VendorEmail = {
  id?: string
  address: string
  type: EmailType
  isPreferred: boolean
}

export type VendorPhone = {
  id?: string
  number: string
  type: PhoneType
  isPreferred: boolean
}

export type VendorListItem = {
  id: string
  name: string
  address: string
  npwp: string
  isActive: boolean
}
export type VendorDetail = VendorListItem & {
  emails: VendorEmail[]
  phones: VendorPhone[]
}
