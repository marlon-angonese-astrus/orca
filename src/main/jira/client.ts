import { hostname } from 'node:os'
import { taskProviderFailure } from '../../shared/work-items/task-provider-failure'
import { botToolSignInFailureWords } from '../../shared/bot-tool-sign-in'
import type {
  JiraConnectArgs,
  JiraConnectionStatus,
  JiraSite,
  JiraSiteSelection,
  JiraViewer
} from '../../shared/jira/jira-types'
import { signOutBotTool } from '../bots/tool-oauth/bot-tool-oauth-revoke'
import { createBotToolSignIn } from '../bots/tool-oauth/bot-tool-oauth-sign-in'
import {
  botToolSignInProgress,
  cancelBotToolSignIn,
  connectBotToolSignIn
} from '../bots/tool-oauth/bot-tool-sign-in-flows'
import { BotToolSignInError } from '../bots/tool-oauth/bot-tool-oauth'
import {
  ASTRUSFLOW_MCP_URL,
  ASTRUSFLOW_SITE_ID,
  ASTRUSFLOW_SITE_URL
} from '../../shared/jira/astrusflow-site'
import {
  astrusFlowOAuthKey,
  astrusFlowSignInState,
  callAstrusFlowTool
} from './astrusflow-mcp-client'
import { getSiteFile, writeSiteFile } from './site-credential-store'
import { JiraApiError, type JiraClientForSite } from './authenticated-request'
import { siteToViewer } from './site-identity'

const SIGN_IN_POLL_MS = 500

export function getClients(selection?: JiraSiteSelection | null): JiraClientForSite[] {
  const file = getSiteFile()
  const selected = selection ?? file.selectedSiteId ?? file.activeSiteId
  const sites =
    selected === 'all'
      ? file.sites
      : file.sites.filter((site) => site.id === (selected ?? file.activeSiteId))
  // The OAuth bearer is attached by the MCP client, so there is no per-site authorization header.
  return sites.map((site) => ({ site, authorization: '' }))
}

export function getStatus(): JiraConnectionStatus {
  const file = getSiteFile()
  const activeSite =
    file.sites.find((site) => site.id === file.activeSiteId) ?? file.sites[0] ?? null
  const { error } = astrusFlowSignInState()
  return {
    connected: file.sites.length > 0,
    viewer: siteToViewer(activeSite),
    sites: file.sites,
    activeSiteId: activeSite?.id ?? null,
    selectedSiteId: file.selectedSiteId ?? activeSite?.id ?? null,
    ...(error ? { credentialError: error } : {}),
    // The bot-tool store refuses to hold tokens it cannot seal, so nothing sits in plaintext.
    credentialProtection: null,
    supportsScopedTokens: true
  }
}

/** Waits for the browser sign-in the flow started; resolves with the failure message, or null once signed in. */
async function waitForSignIn(): Promise<string | null> {
  const key = astrusFlowOAuthKey()
  for (;;) {
    const progress = botToolSignInProgress(key)
    if (progress.state === 'done') {
      return null
    }
    if (progress.state === 'failed') {
      return botToolSignInFailureWords(progress.code, hostname())
    }
    if (progress.state === 'idle') {
      return botToolSignInFailureWords('cancelled', hostname())
    }
    await new Promise((resolve) => setTimeout(resolve, SIGN_IN_POLL_MS))
  }
}

// AstrusFlow has no whoami tool and `my_work` does not name the user, so the viewer is generic.
const VIEWER: JiraViewer = { accountId: 'me', displayName: 'AstrusFlow', email: null }

// Args are ignored: the sign-in is OAuth in the browser, not credentials typed into Orca.
export async function connect(
  _args?: JiraConnectArgs
): Promise<{ ok: true; viewer: JiraViewer } | { ok: false; error: string }> {
  const key = astrusFlowOAuthKey()
  try {
    await createBotToolSignIn(key, ASTRUSFLOW_MCP_URL)
    await connectBotToolSignIn(key)
    const failure = await waitForSignIn()
    if (failure) {
      return { ok: false, error: failure }
    }
    await callAstrusFlowTool('my_work')
    const site: JiraSite = {
      id: ASTRUSFLOW_SITE_ID,
      siteUrl: ASTRUSFLOW_SITE_URL,
      email: '',
      displayName: VIEWER.displayName,
      accountId: VIEWER.accountId,
      authType: 'cloud'
    }
    writeSiteFile({
      version: 1,
      activeSiteId: site.id,
      selectedSiteId: site.id,
      sites: [site]
    })
    return { ok: true, viewer: VIEWER }
  } catch (error) {
    cancelBotToolSignIn(key)
    if (error instanceof BotToolSignInError) {
      return { ok: false, error: botToolSignInFailureWords(error.code, hostname()) }
    }
    return error instanceof Error
      ? { ok: false, error: error.message }
      : taskProviderFailure('jira.connectionFailed', 'Connection failed.')
  }
}

export function disconnect(_siteId?: string): void {
  clearToken(ASTRUSFLOW_SITE_ID)
  void signOutBotTool(astrusFlowOAuthKey())
}

export function selectSite(siteId: JiraSiteSelection): JiraConnectionStatus {
  const file = getSiteFile()
  if (siteId !== 'all' && !file.sites.some((site) => site.id === siteId)) {
    return getStatus()
  }
  writeSiteFile({
    ...file,
    activeSiteId: siteId === 'all' ? file.activeSiteId : siteId,
    selectedSiteId: siteId
  })
  return getStatus()
}

export async function testConnection(
  siteId?: string
): Promise<{ ok: true; viewer: JiraViewer } | { ok: false; error: string }> {
  if (!getClients(siteId)[0]) {
    return taskProviderFailure('jira.notConnected', 'Not connected to Jira.')
  }
  try {
    await callAstrusFlowTool('my_work')
    return { ok: true, viewer: VIEWER }
  } catch (error) {
    return error instanceof Error
      ? { ok: false, error: error.message }
      : taskProviderFailure('jira.connectionFailed', 'Connection failed.')
  }
}

/** Forgets the saved site; the OAuth sign-in itself is ended by `disconnect`. */
export function clearToken(siteId: string): void {
  const file = getSiteFile()
  writeSiteFile({ ...file, sites: file.sites.filter((site) => site.id !== siteId) })
}

/** Calls a tool for the connected site; the OAuth sign-in state, not the site file, decides when it is gone. */
export function callSiteTool(
  name: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal
): Promise<unknown> {
  return callAstrusFlowTool(name, args, signal)
}

export function isAuthError(error: unknown): boolean {
  return error instanceof JiraApiError && error.status === 401
}
