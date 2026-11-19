import type { JiraIssue, JiraSiteSelection } from '../../shared/jira/jira-types'
import type { JiraMediaFormat } from '../../shared/jira/jira-attachment-image'
import { JiraSummaryLookupError } from '../../shared/jira/jira-summary-lookup'
import { callSiteTool, getClients, isAuthError } from './client'
import { mapAstrusFlowIssue } from './astrusflow-issue-mapping'
import { requireStrictJiraSite, settleJiraSummaryRead, withJiraDeadline } from './jira-read-failure'

const ISSUE_SUMMARY_TIMEOUT_MS = 30_000
// AstrusFlow answers a missing or hidden task with this tool error.
const NOT_FOUND_PATTERN = /não encontrado/i

export async function getIssue(
  key: string,
  siteId?: JiraSiteSelection | null,
  strict = false,
  _mediaFormat?: JiraMediaFormat
): Promise<JiraIssue | null> {
  const entries = getClients(siteId)
  requireStrictJiraSite(entries, siteId, strict)
  if (entries.length === 0) {
    return null
  }
  try {
    // One comment is enough to date the task; the full thread comes from getIssueComments.
    return mapAstrusFlowIssue(await callSiteTool('get_task', { task: key, comments: 1 }))
  } catch (error) {
    if (strict || isAuthError(error)) {
      throw error
    }
    console.warn('[jira] getIssue failed:', error)
    return null
  }
}

export async function getIssueSummary(
  key: string,
  siteId: string,
  signal?: AbortSignal
): Promise<JiraIssue | null> {
  if (!getClients(siteId).some((entry) => entry.site.id === siteId)) {
    throw new JiraSummaryLookupError('disconnected')
  }
  return withJiraDeadline(signal, ISSUE_SUMMARY_TIMEOUT_MS, async (requestSignal) => {
    try {
      const task = await settleJiraSummaryRead(
        callSiteTool('get_task', { task: key, comments: 0 }, requestSignal),
        requestSignal
      )
      return mapAstrusFlowIssue(task)
    } catch (error) {
      if (isAuthError(error)) {
        throw new JiraSummaryLookupError('auth', error)
      }
      if (error instanceof Error && NOT_FOUND_PATTERN.test(error.message)) {
        throw new JiraSummaryLookupError('not-found', error)
      }
      throw new JiraSummaryLookupError('read-failed', error)
    }
  })
}
