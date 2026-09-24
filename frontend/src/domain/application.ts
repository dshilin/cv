import type { ProfileFact } from './profile'

export type DocumentKind = 'resume' | 'letter' | 'explanation'
export type GeneratedDocument = {
  kind: DocumentKind
  title: string
  content: string
  usedFactIds: string[]
  baseContent?: string
}
export type Warning = { id: string; message: string }
export type ApplicationBlocker = { kind: 'fact' | 'package'; message: string; factId?: string }
export type SendState = 'draft' | 'content_confirmed' | 'sent'
export type ApplicationPackage = {
  id: string
  jobId: string
  documents: GeneratedDocument[]
  usedFacts: ProfileFact[]
  warnings: Warning[]
  blockers: ApplicationBlocker[]
  sendState: SendState
}
export type SendResult = { applicationId: string; jobId: string; status: 'sent'; receiptId: string }

export function canSendApplication(pkg: ApplicationPackage): boolean {
  if (pkg.sendState !== 'content_confirmed' || pkg.blockers.length > 0) return false
  if (pkg.documents.length !== 3 || !(['resume', 'letter', 'explanation'] as const)
    .every((kind) => pkg.documents.some((document) => document.kind === kind && document.content.trim()))) return false
  if (pkg.usedFacts.length === 0) return false
  const facts = new Map(pkg.usedFacts.map((fact) => [fact.id, fact]))
  if (pkg.usedFacts.some((fact) => fact.status !== 'confirmed' || !fact.value.trim() || !fact.provenance.trim())) return false
  return pkg.documents.every((document) => document.usedFactIds.every((id) => facts.get(id)?.status === 'confirmed'))
}
