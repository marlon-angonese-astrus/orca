import { requireStrictJiraSite } from './jira-read-failure'
import type {
  JiraCreateField,
  JiraIssueType,
  JiraPriority,
  JiraUser
} from '../../shared/jira/jira-types'
import { getClients } from './client'
import { ASTRUSFLOW_PRIORITIES } from './astrusflow-issue-mapping'

const hasConnectedSite = (siteId: string | null | undefined, strict: boolean): boolean => {
  const entries = getClients(siteId)
  requireStrictJiraSite(entries, siteId, strict)
  return entries.length > 0
}

// AstrusFlow has one task type; its own types (Bug, Feature...) are not selectable at create time.
export async function listIssueTypes(
  _projectIdOrKey: string,
  siteId?: string | null,
  strict = false
): Promise<JiraIssueType[]> {
  return hasConnectedSite(siteId, strict) ? [{ id: 'task', name: 'Task' }] : []
}

// No create metadata exists upstream, so the dialog gets no extra fields.
export async function listCreateFields(
  _projectIdOrKey: string,
  _issueTypeId: string,
  siteId?: string | null,
  strict = false
): Promise<JiraCreateField[]> {
  hasConnectedSite(siteId, strict)
  return []
}

export async function listPriorities(
  siteId?: string | null,
  strict = false
): Promise<JiraPriority[]> {
  return hasConnectedSite(siteId, strict) ? ASTRUSFLOW_PRIORITIES : []
}

// There is no user lookup tool: "me" always works and a typed name is passed through, since assignees accept names.
function assignableUsers(query: string | undefined, siteId: string | null | undefined): JiraUser[] {
  if (!hasConnectedSite(siteId, false)) {
    return []
  }
  const typed = query?.trim()
  return [
    { accountId: 'me', displayName: 'Eu' },
    ...(typed && !/^(me|eu)$/i.test(typed) ? [{ accountId: typed, displayName: typed }] : [])
  ]
}

export async function searchUsers(query?: string, siteId?: string | null): Promise<JiraUser[]> {
  return assignableUsers(query, siteId)
}

export async function listAssignableUsers(
  _key: string,
  query?: string,
  siteId?: string | null,
  strict = false
): Promise<JiraUser[]> {
  return hasConnectedSite(siteId, strict) ? assignableUsers(query, siteId) : []
}

export async function listAssignableUsersForProject(
  _projectIdOrKey: string,
  query?: string,
  siteId?: string | null
): Promise<JiraUser[]> {
  return assignableUsers(query, siteId)
}
