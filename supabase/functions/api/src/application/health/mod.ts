export interface DatabaseHealth {
  isReachable(): Promise<boolean>;
}

export type HealthStatus = 'healthy' | 'unhealthy';

export interface HealthReport {
  status: HealthStatus;
  databaseReachable: boolean;
}

export class CheckHealth {
  constructor(private readonly database: DatabaseHealth) {}

  async execute(): Promise<HealthReport> {
    const databaseReachable = await this.database.isReachable();
    return { status: databaseReachable ? 'healthy' : 'unhealthy', databaseReachable };
  }
}
