
// Define interfaces for configuration
export interface RepositoryMapping {
  workspaceFolderName: string;
  jenkinsJobName: string;
}

export interface JenkinsConfiguration {
  jenkinsUrl: string;
  username: string;
  repositoryMappings: RepositoryMapping[];
  pollingInterval: number;
}