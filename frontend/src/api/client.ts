/**
 * LOCOMART — API Client (M0 Foundation)
 * Thin fetch-based client. Backend URL is read from VITE_API_URL env var.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface HealthResponse {
  status: string;
}

export interface HealthDbResponse {
  status: string;
  database: string;
  version?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // strip trailing slash
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  /** Check basic API health */
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  /** Check database connectivity */
  async getHealthDb(): Promise<HealthDbResponse> {
    return this.request<HealthDbResponse>('/health/db');
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
