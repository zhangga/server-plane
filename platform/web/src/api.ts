import type { AcceptedTask, CreateEnvironmentInput, Environment, EnvironmentAction } from './types';

interface EnvironmentListResponse {
  environments: Environment[];
}

export interface FetchEnvironmentsOptions {
  owner?: string;
}

export async function fetchEnvironments(options: FetchEnvironmentsOptions = {}): Promise<Environment[]> {
  const params = new URLSearchParams();
  if (options.owner) {
    params.set('owner', options.owner);
  }
  const query = params.toString();
  const data = await request<EnvironmentListResponse>(`/api/environments${query ? `?${query}` : ''}`);
  return data.environments;
}

export async function createEnvironment(input: CreateEnvironmentInput): Promise<AcceptedTask> {
  return request<AcceptedTask>('/api/environments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function postEnvironmentAction(envId: string, action: Exclude<EnvironmentAction, 'destroy'>): Promise<AcceptedTask> {
  return request<AcceptedTask>(`/api/environments/${envId}/${action}`, {
    method: 'POST',
  });
}

export async function deleteEnvironment(envId: string): Promise<AcceptedTask> {
  return request<AcceptedTask>(`/api/environments/${envId}`, {
    method: 'DELETE',
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => undefined);

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? (body as { error?: { message?: string } }).error?.message
        : undefined;
    throw new Error(message ?? `Request failed with status ${res.status}`);
  }

  return body as T;
}
