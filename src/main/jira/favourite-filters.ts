import type { JiraFavouriteFilterList } from '../../shared/jira/jira-favourite-filters'
import { JiraFavouriteFilterParams } from '../../shared/rpc-contract/jira/jira-favourite-filter-params'
import { getClients } from './client'
import { requireStrictJiraSite } from './jira-read-failure'

// AstrusFlow has no saved or favourite filters.
export async function listFavouriteFilters(
  siteId: string,
  _signal?: AbortSignal
): Promise<JiraFavouriteFilterList> {
  const selection = JiraFavouriteFilterParams.parse({ siteId }).siteId
  requireStrictJiraSite(getClients(selection), selection, true)
  return { filters: [], truncated: false }
}
