import * as vscode from 'vscode';
import { JenkinsConfiguration, RepositoryMapping } from './types';

/**
 * Retrieves the extension configuration from VS Code settings.
 * @returns The Jenkins configuration object.
 */
export function getConfiguration(): JenkinsConfiguration {
  const config = vscode.workspace.getConfiguration('jenkinsBuildStatus');
  return {
    jenkinsUrl: config.get<string>('jenkinsUrl', ''),
    username: config.get<string>('username', ''),
    repositoryMappings: config.get<RepositoryMapping[]>('repositoryMappings', []),
    pollingInterval: config.get<number>('pollingInterval', 30000)
  };
}

/**
 * Retrieves the Jenkins API token securely from VS Code SecretStorage.
 * @param secretStorage The SecretStorage instance from the extension context.
 * @returns The Jenkins API token or undefined if not found.
 */
export async function getJenkinsApiToken(secretStorage: vscode.SecretStorage): Promise<string | undefined> {
  const username = getConfiguration().username;
  if (!username) {
    return undefined;
  }
  return await secretStorage.get(`jenkinsApiToken.${username}`);
}

/**
 * Stores the Jenkins API token securely in VS Code SecretStorage.
 * @param secretStorage The SecretStorage instance from the extension context.
 * @param token The API token to store.
 */
export async function setJenkinsApiToken(secretStorage: vscode.SecretStorage, token: string): Promise<void> {
  const username = getConfiguration().username;
  if (username) {
    await secretStorage.store(`jenkinsApiToken.${username}`, token);
    vscode.window.showInformationMessage('Jenkins API Token stored securely.');
  } else {
    vscode.window.showWarningMessage('Please configure Jenkins username before setting API token.');
  }
}

/**
 * Gets the Jenkins job name for a given workspace folder based on the configured mappings.
 * @param workspaceFolder The VS Code workspace folder.
 * @param mappings The array of repository mappings from configuration.
 * @returns The corresponding Jenkins job name or undefined if no mapping is found.
 */
export function getJenkinsJobName(workspaceFolder: vscode.WorkspaceFolder, mappings: RepositoryMapping[]): string | undefined {
  const mapping = mappings.find(m => m.workspaceFolderName === workspaceFolder.name);
  return mapping?.jenkinsJobName;
}