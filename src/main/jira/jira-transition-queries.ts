import { requireStrictJiraSite } from './jira-read-failure'
import type { JiraProjectStatusOrder, JiraTransition } from '../../shared/jira/jira-types'
import { callSiteTool, getClients, isAuthError } from './client'
import { mapTransitions } from './astrusflow-issue-mapping'

export async function listTransitions(
  key: string,
  siteId?: string | null,
  strict = false
): Promise<JiraTransition[]> {
  const entries = getClients(siteId)
  requireStrictJiraSite(entries, siteId, strict)
  if (entries.length === 0) {
    return []
  }
  try {
    const task = (await callSiteTool('get_task', { task: key, comments: 0 })) as {
      status_category?: unknown
    } | null
    return mapTransitions(String(task?.status_category ?? ''))
  } catch (error) {
    if (strict || isAuthError(error)) {
      throw error
    }
    console.warn('[jira] listTransitions failed:', error)
    return []
  }
}

// AstrusFlow has no board columns; empty keeps the alphabetical status order.
export async function getProjectStatusOrder(
  _projectKey: string,
  _siteId?: string | null
): Promise<JiraProjectStatusOrder> {
  return { statusIdsByColumn: [] }
}
