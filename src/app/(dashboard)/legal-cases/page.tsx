import { getSession } from '@/lib/auth'
import { BusinessLedger } from '@/components/business-ledger'

export default async function Page() {
  const session = await getSession()
  return <BusinessLedger kind="legal-cases" canWrite={session?.role === 'editor' || session?.role === 'super_admin'} />
}
