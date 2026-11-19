import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { JiraSite, JiraSiteSelection } from '../../shared/jira/jira-types'
import { createIntegrationStateFileCache } from '../credentials/integration-state-file-cache'
import { ASTRUSFLOW_SITE_ID, ASTRUSFLOW_SITE_URL } from '../../shared/jira/astrusflow-site'
import { astrusFlowSignInState } from './astrusflow-mcp-client'

export type JiraSiteFile = {
  version: 1
  activeSiteId: string | null
  selectedSiteId: JiraSiteSelection | null
  sites: JiraSite[]
}

const siteFileCache = createIntegrationStateFileCache({
  filePath: getSiteFilePath,
  readFromDisk: readSiteFileFromDisk
})

function getOrcaDir(): string {
  return join(homedir(), '.orca')
}

function getSiteFilePath(): string {
  return join(getOrcaDir(), 'jira-sites.json')
}

/** Legacy Jira REST token folder; still swept by the plaintext-credential migration. */
export function getTokenDir(): string {
  return join(getOrcaDir(), 'jira-tokens')
}

function ensureOrcaDir(): void {
  const dir = getOrcaDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function emptySiteFile(): JiraSiteFile {
  return {
    version: 1,
    activeSiteId: null,
    selectedSiteId: null,
    sites: []
  }
}

// Sites saved by the Jira REST backend carry other ids and are dropped on read.
function normalizeSite(input: unknown): JiraSite | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const record = input as Record<string, unknown>
  if (
    record.id !== ASTRUSFLOW_SITE_ID ||
    typeof record.displayName !== 'string' ||
    typeof record.accountId !== 'string'
  ) {
    return null
  }
  return {
    id: ASTRUSFLOW_SITE_ID,
    siteUrl: ASTRUSFLOW_SITE_URL,
    email: '',
    displayName: record.displayName,
    accountId: record.accountId,
    authType: 'cloud'
  }
}

function readSiteFileFromDisk(): JiraSiteFile {
  const path = getSiteFilePath()
  if (!existsSync(path)) {
    return emptySiteFile()
  }
  try {
    const parsed = JSON.parse(readFileSync(path, { encoding: 'utf-8' })) as Partial<JiraSiteFile>
    const sites = Array.isArray(parsed.sites)
      ? parsed.sites
          .map((site) => normalizeSite(site))
          .filter((site): site is JiraSite => site !== null)
      : []
    const activeSiteId = sites[0]?.id ?? null
    const selectedSiteId = parsed.selectedSiteId === 'all' ? 'all' : activeSiteId
    return { version: 1, activeSiteId, selectedSiteId, sites }
  } catch {
    return emptySiteFile()
  }
}

export function getSiteFile(): JiraSiteFile {
  return selectableSiteFile(siteFileCache.get())
}

// The site is only selectable while its OAuth sign-in stands.
function selectableSiteFile(file: JiraSiteFile): JiraSiteFile {
  const sites = astrusFlowSignInState().signedIn ? file.sites : []
  const activeSiteId = sites[0]?.id ?? null
  const selectedSiteId = file.selectedSiteId === 'all' && activeSiteId ? 'all' : activeSiteId

  return {
    version: 1,
    activeSiteId,
    selectedSiteId,
    sites
  }
}

export function writeSiteFile(file: JiraSiteFile): void {
  ensureOrcaDir()
  writeFileSync(getSiteFilePath(), JSON.stringify(file, null, 2), {
    encoding: 'utf-8',
    mode: 0o600
  })
  siteFileCache.invalidate()
}
