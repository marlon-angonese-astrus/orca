import type {
  JiraIssue,
  JiraIssueFilter,
  JiraIssueListFilters,
  JiraSiteSelection
} from '../../shared/jira/jira-types'
import { callSiteTool, getClients } from './client'
import { mapAstrusFlowIssue } from './astrusflow-issue-mapping'
import { requireStrictJiraSite, withJiraDeadline } from './jira-read-failure'

const ISSUE_SEARCH_TIMEOUT_MS = 30_000
const SEARCH_LIMIT_PER_TYPE = 20

const clampLimit = (limit: number | undefined, max: number): number =>
  Math.min(Math.max(1, Number.isFinite(limit) ? Number(limit) : 30), max)

const tasksOf = (result: unknown): JiraIssue[] => {
  const tasks = (result as { tasks?: unknown } | null)?.tasks
  return Array.isArray(tasks) ? tasks.map(mapAstrusFlowIssue) : []
}

async function listTasks(
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<JiraIssue[]> {
  return tasksOf(await callSiteTool('list_tasks', args, signal))
}

export async function listIssues(
  filter: JiraIssueFilter = 'assigned',
  limit = 30,
  siteId?: JiraSiteSelection | null,
  strict = false,
  filters?: JiraIssueListFilters
): Promise<JiraIssue[]> {
  const entries = getClients(siteId)
  requireStrictJiraSite(entries, siteId, strict)
  if (entries.length === 0) {
    return []
  }
  // AstrusFlow has no "reported by me"; it falls back to assigned. Sprints do not exist there either.
  const safeLimit = clampLimit(limit, 100)
  const base: Record<string, unknown> = {
    limit: safeLimit,
    ...(filter === 'all' ? {} : { assignee: 'me' }),
    ...(filter === 'done' ? { status: 'done' } : {})
  }
  const statuses = filter === 'done' ? [] : (filters?.statuses ?? [])
  return withJiraDeadline(undefined, ISSUE_SEARCH_TIMEOUT_MS, async (signal) => {
    if (statuses.length === 0) {
      return listTasks(base, signal)
    }
    const byStatus = await Promise.all(
      statuses.map((status) => listTasks({ ...base, status }, signal))
    )
    const seen = new Set<string>()
    return byStatus
      .flat()
      .filter((issue) => !seen.has(issue.key) && seen.add(issue.key))
      .slice(0, safeLimit)
  })
}

/** The only JQL shapes the UI builds from typed text; AstrusFlow has no JQL, so anything else is empty. */
function plainTextOfJql(jql: string): string | null {
  const key = /^key\s*=\s*"([^"]+)"$/i.exec(jql)
  if (key) {
    return key[1]
  }
  const text = /^text\s*~\s*"(.*)"$/i.exec(jql)
  return text ? text[1].replace(/\*$/, '').trim() || null : null
}

export async function searchIssues(
  jql: string,
  limit = 30,
  siteId?: JiraSiteSelection | null,
  signal?: AbortSignal,
  strict = false
): Promise<JiraIssue[]> {
  const entries = getClients(siteId)
  requireStrictJiraSite(entries, siteId, strict)
  const q = plainTextOfJql(jql.trim())
  if (entries.length === 0 || !q) {
    return []
  }
  return withJiraDeadline(signal, ISSUE_SEARCH_TIMEOUT_MS, async (requestSignal) =>
    tasksOf(
      await callSiteTool(
        'search',
        { q, types: ['tasks'], limit: clampLimit(limit, SEARCH_LIMIT_PER_TYPE) },
        requestSignal
      )
    )
  )
}
