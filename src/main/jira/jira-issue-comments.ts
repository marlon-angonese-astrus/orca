import type { JiraComment } from '../../shared/jira/jira-types'
import type { JiraMediaFormat } from '../../shared/jira/jira-attachment-image'
import { callSiteTool, getClients, isAuthError } from './client'
import { mapAstrusFlowComments } from './astrusflow-issue-mapping'
import { requireStrictJiraSite } from './jira-read-failure'

export async function getIssueComments(
  key: string,
  siteId?: string | null,
  strict = false,
  _mediaFormat?: JiraMediaFormat
): Promise<JiraComment[]> {
  const entries = getClients(siteId)
  requireStrictJiraSite(entries, siteId, strict)
  if (entries.length === 0) {
    return []
  }
  try {
    return mapAstrusFlowComments(key, await callSiteTool('get_task', { task: key, comments: 50 }))
  } catch (error) {
    if (strict || isAuthError(error)) {
      throw error
    }
    console.warn('[jira] getIssueComments failed:', error)
    return []
  }
}
