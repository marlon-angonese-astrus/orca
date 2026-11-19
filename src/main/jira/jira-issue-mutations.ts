import { taskProviderFailure } from '../../shared/work-items/task-provider-failure'
import type {
  JiraCreateIssueArgs,
  JiraCreateIssueResult,
  JiraIssueUpdate,
  JiraMutationResult
} from '../../shared/jira/jira-types'
import { callSiteTool, getClients, isAuthError } from './client'

const resultRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

function failureOf(
  error: unknown,
  code: Parameters<typeof taskProviderFailure>[0],
  fallback: string
) {
  return error instanceof Error
    ? { ok: false as const, error: error.message }
    : taskProviderFailure(code, fallback)
}

export async function createIssue(args: JiraCreateIssueArgs): Promise<JiraCreateIssueResult> {
  if (!getClients(args.siteId)[0]) {
    return taskProviderFailure('jira.notConnected', 'Not connected to Jira.')
  }
  const title = args.title.trim()
  if (!title) {
    return taskProviderFailure('jira.titleRequired', 'Title is required.')
  }
  try {
    // projectId carries the AstrusFlow project id; the issue type and custom fields have no counterpart.
    const created = resultRecord(
      await callSiteTool('create_task', {
        title,
        project_id: /^\d+$/.test(args.projectId) ? Number(args.projectId) : args.projectId,
        ...(args.description?.trim() ? { description: args.description.trim() } : {})
      })
    )
    const key = String(created.key ?? '')
    return { ok: true, id: key, key, url: String(created.url ?? '') }
  } catch (error) {
    if (isAuthError(error)) {
      throw error
    }
    return failureOf(error, 'jira.createFailed', 'Failed to create issue.')
  }
}

export async function updateIssue(
  key: string,
  updates: JiraIssueUpdate,
  siteId?: string | null
): Promise<JiraMutationResult> {
  if (!getClients(siteId)[0]) {
    return taskProviderFailure('jira.notConnected', 'Not connected to Jira.')
  }
  try {
    // Labels are ignored: AstrusFlow tasks have none.
    const fields: Record<string, unknown> = {}
    if (updates.title !== undefined) {
      fields.title = updates.title
    }
    if (updates.priorityId !== undefined) {
      fields.priority = updates.priorityId ?? 'none'
    }
    if (updates.assigneeAccountId !== undefined) {
      fields.assignees = updates.assigneeAccountId ? [updates.assigneeAccountId] : []
    }
    if (Object.keys(fields).length > 0) {
      await callSiteTool('update_task', { task: key, ...fields })
    }
    if (updates.transitionId) {
      await callSiteTool('move_task', { task: key, status: updates.transitionId })
    }
    if (updates.transitionComment?.trim()) {
      await callSiteTool('add_comment', { task: key, text: updates.transitionComment.trim() })
    }
    return { ok: true }
  } catch (error) {
    if (isAuthError(error)) {
      throw error
    }
    return failureOf(error, 'jira.updateFailed', 'Failed to update issue.')
  }
}

export async function addIssueComment(
  key: string,
  body: string,
  siteId?: string | null
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!getClients(siteId)[0]) {
    return taskProviderFailure('jira.notConnected', 'Not connected to Jira.')
  }
  try {
    const comment = resultRecord(await callSiteTool('add_comment', { task: key, text: body }))
    return { ok: true, id: String(comment.comment_id ?? '') }
  } catch (error) {
    if (isAuthError(error)) {
      throw error
    }
    return failureOf(error, 'jira.commentFailed', 'Failed to add comment.')
  }
}
