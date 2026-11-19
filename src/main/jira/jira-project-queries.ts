import type { JiraProject, JiraSiteSelection } from '../../shared/jira/jira-types'
import { callSiteTool, getClients, isAuthError } from './client'
import { mapAstrusFlowProject } from './astrusflow-issue-mapping'
import { requireStrictJiraSite } from './jira-read-failure'

export async function listProjects(
  siteId?: JiraSiteSelection | null,
  strict = false
): Promise<JiraProject[]> {
  const entries = getClients(siteId)
  requireStrictJiraSite(entries, siteId, strict)
  if (entries.length === 0) {
    return []
  }
  try {
    const result = (await callSiteTool('list_projects', { limit: 100 })) as {
      projects?: unknown
    } | null
    const projects = Array.isArray(result?.projects) ? result.projects : []
    return projects.map(mapAstrusFlowProject).sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    if (strict || isAuthError(error)) {
      throw error
    }
    console.warn('[jira] listProjects failed:', error)
    return []
  }
}
